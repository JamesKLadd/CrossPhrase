// Tests the database migrations in an in-process Postgres (PGlite), with
// small stand-ins for the parts of Supabase they rely on (auth.users,
// auth.uid() and the anon/authenticated/service_role roles).
//
// Run with: npm run test:db

import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { before, describe, test } from 'node:test';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

const SUPABASE_STANDINS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key);
  grant select on auth.users to authenticated;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

let db;
const q = (sql, params) => db.query(sql, params);
const one = async (sql, params) => (await q(sql, params)).rows[0];

/** Runs `fn` as a signed-in player, the way PostgREST would. */
async function asPlayer(id, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STANDINS);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  }
  await q('insert into auth.users values ($1), ($2)', [ALICE, BOB]);
  await q(`insert into verdict_cache (phrase, tier, reading, reason, quip, prompt_version) values
    ('the the moon', 'invalid', 'the the moon', 'Two articles in a row', 'Hoo?', 1),
    ('of and the', 'invalid', 'of and the', 'No content words', 'Hmm.', 1),
    ('the golden toast', 'great', 'the golden toast', '', 'Crunchy.', 1)`);
});

describe('verdict cache', () => {
  test('record_verdict_hits counts cache hits', async () => {
    await q(`select record_verdict_hits(array['the golden toast', 'not cached'])`);
    assert.equal((await one(`select hits from verdict_cache where phrase = 'the golden toast'`)).hits, 1);
  });

  test('players cannot read the cache or call service functions', async () => {
    await assert.rejects(asPlayer(ALICE, () => q('select * from verdict_cache')), /permission denied/);
    await assert.rejects(
      asPlayer(ALICE, () => q('select consume_judge_quota($1, 60, 5)', [ALICE])),
      /permission denied/,
    );
    await assert.rejects(asPlayer(ALICE, () => q(`select record_verdict_hits(array['x'])`)), /permission denied/);
  });
});

describe('appeals', () => {
  test('a player files an appeal with just the phrase', async () => {
    await asPlayer(ALICE, () => q(`insert into appeals (phrase) values ('the the moon')`));
    const appeal = await one(`select * from appeals where user_id = $1`, [ALICE]);
    assert.equal(appeal.status, 'pending');
    assert.equal(appeal.appealed_tier, 'invalid');
    assert.equal(appeal.appealed_reason, 'Two articles in a row');
  });

  test('players cannot forge or resolve appeals', async () => {
    await assert.rejects(
      asPlayer(ALICE, () => q(`insert into appeals (phrase) values ('the the moon')`)),
      /duplicate key/,
    );
    await assert.rejects(
      asPlayer(ALICE, () => q(`insert into appeals (phrase, status) values ('of and the', 'upheld')`)),
      /permission denied/,
    );
    await assert.rejects(
      asPlayer(ALICE, () => q(`insert into appeals (phrase, user_id) values ('of and the', $1)`, [BOB])),
      /permission denied/,
    );
    await assert.rejects(
      asPlayer(ALICE, () => q(`update appeals set status = 'upheld', resolved_tier = 'poetic'`)),
      /permission denied/,
    );
  });

  test('only phrases the judge has ruled on can be appealed', async () => {
    await assert.rejects(
      asPlayer(ALICE, () => q(`insert into appeals (phrase) values ('never judged')`)),
      /No verdict to appeal/,
    );
  });

  test('players only see their own appeals', async () => {
    await asPlayer(BOB, () => q(`insert into appeals (phrase) values ('the the moon')`));
    const seen = await asPlayer(ALICE, () => one('select count(*)::int as n from appeals'));
    assert.equal(seen.n, 1);
  });

  test('upholding needs a resolved tier', async () => {
    await assert.rejects(q(`update appeals set status = 'upheld' where user_id = $1`, [ALICE]), /check constraint/);
  });

  test('an upheld appeal overwrites the verdict and settles every appeal of the phrase', async () => {
    await q(`update appeals set status = 'upheld', resolved_tier = 'ok' where user_id = $1`, [ALICE]);
    const verdict = await one(`select * from verdict_cache where phrase = 'the the moon'`);
    assert.equal(verdict.tier, 'ok');
    assert.equal(verdict.source, 'appeal');
    assert.equal(verdict.reason, '');
    const appeals = (await q(`select status, resolved_tier, resolved_at from appeals where phrase = 'the the moon'`)).rows;
    assert.equal(appeals.length, 2);
    for (const appeal of appeals) {
      assert.equal(appeal.status, 'upheld');
      assert.equal(appeal.resolved_tier, 'ok');
      assert.ok(appeal.resolved_at);
    }
  });

  test('a rejected appeal leaves the verdict alone', async () => {
    await asPlayer(ALICE, () => q(`insert into appeals (phrase) values ('of and the')`));
    await q(`update appeals set status = 'rejected' where phrase = 'of and the'`);
    const verdict = await one(`select tier, source from verdict_cache where phrase = 'of and the'`);
    assert.deepEqual({ ...verdict }, { tier: 'invalid', source: 'model' });
  });
});

describe('rate limits', () => {
  test('consume_judge_quota allows `limit` requests per window, per player', async () => {
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push((await one('select consume_judge_quota($1, 600, 3) as ok', [ALICE])).ok);
    }
    assert.deepEqual(results, [true, true, true, false]);
    assert.equal((await one('select consume_judge_quota($1, 86400, 3) as ok', [ALICE])).ok, true);
    assert.equal((await one('select consume_judge_quota($1, 600, 3) as ok', [BOB])).ok, true);
  });
});

describe('cost tracking', () => {
  test('judge_cost_daily prices tokens per day and per active player', async () => {
    await q(
      `insert into judge_calls (user_id, phrases, cache_hits, model, input_tokens, output_tokens) values
        ($1, 10, 4, 'claude-haiku-5-5', 1000000, 100000),
        ($2, 6, 0, 'claude-haiku-5-5', 0, 0)`,
      [ALICE, BOB],
    );
    const row = await one('select * from judge_cost_daily');
    assert.equal(Number(row.active_players), 2);
    assert.equal(Number(row.cost_usd), 0.15); // 1M input at $0.10 + 100K output at $0.50
    assert.equal(Number(row.cost_per_player_usd), 0.075);
    assert.equal(Number(row.cache_hit_pct), 25);
    await assert.rejects(asPlayer(ALICE, () => q('select * from judge_cost_daily')), /permission denied/);
  });
});
