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

/** Runs `fn` as someone who hasn't signed in. */
async function asAnon(fn) {
  await db.exec(`set role anon;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
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

describe('leaderboards', () => {
  const CAROL = '33333333-3333-3333-3333-333333333333';
  const saveDaily = (user, score, submits = 1, won = true) =>
    one(
      `select save_daily_score($1, '2026-10-20', $2, $3, $4, $5, '[]'::jsonb, 'v1') as saved`,
      [user, won, score, won ? 2 : 0, submits],
    );

  before(async () => {
    await q('insert into auth.users values ($1)', [CAROL]);
  });

  test('a daily result is final: the first run counts', async () => {
    assert.equal((await saveDaily(ALICE, 40)).saved, true);
    assert.equal((await saveDaily(ALICE, 99)).saved, false);
    assert.equal((await one(`select score from daily_scores where user_id = $1`, [ALICE])).score, 40);
  });

  test('ranks by score, then fewer submits, with the player shown even below the cut', async () => {
    await saveDaily(BOB, 40, 2);
    await saveDaily(CAROL, 10, 3, false);
    await q(`insert into accounts (user_id, username) values ($1, 'Alice')`, [ALICE]);
    const rows = (await asPlayer(BOB, () => q(`select * from daily_leaderboard('2026-10-20', 1)`))).rows;
    assert.deepEqual(
      rows.map((r) => [Number(r.rank), r.name, r.score, r.is_me]),
      [
        [1, 'Alice', 40, false],
        [2, 'Anonymous owl', 40, true],
      ],
    );
  });

  test('level bests only go up', async () => {
    const save = (score) =>
      one(`select save_level_score($1, 'level-11', $2, 2::smallint, '[]'::jsonb, 'v1') as saved`, [ALICE, score]);
    assert.equal((await save(30)).saved, true);
    assert.equal((await save(20)).saved, false);
    assert.equal((await save(35)).saved, true);
    const rows = (await asPlayer(ALICE, () => q(`select * from level_leaderboard('level-11')`))).rows;
    assert.deepEqual(rows.map((r) => [Number(r.rank), r.score, r.is_me]), [[1, 35, true]]);
  });

  test('players cannot write scores, read moves or rename others', async () => {
    await assert.rejects(
      asPlayer(ALICE, () => q(`select save_daily_score($1, '2026-10-21', true, 999, 3::smallint, 1::smallint, '[]', 'x')`, [ALICE])),
      /permission denied/,
    );
    await assert.rejects(asPlayer(ALICE, () => q('select * from daily_scores')), /permission denied/);
    await assert.rejects(asPlayer(ALICE, () => q(`insert into level_scores values ($1, 'x', 1, 1, '[]', 'v', now())`, [ALICE])), /permission denied/);
    await assert.rejects(asPlayer(ALICE, () => q(`update profiles set name = 'Mallory'`)), /permission denied/);
    const seen = await asPlayer(BOB, () => q('select * from profiles'));
    assert.equal(seen.rows.length, 0);
  });

  test('names come from accounts: free-text names are retired', async () => {
    await assert.rejects(asPlayer(BOB, () => q(`select set_player_name('Alice')`)), /permission denied/);
  });
});

describe('remote config', () => {
  test('anyone can read it, including before signing in', async () => {
    const rows = await asAnon(() => q('select key from remote_config order by key'));
    assert.deepEqual(rows.rows.map((r) => r.key), ['economy', 'tuning']);
  });

  test('only the dashboard can change it, and changes are timestamped', async () => {
    await assert.rejects(asPlayer(ALICE, () => q(`update remote_config set value = '{"x": 1}'`)), /permission denied/);
    await assert.rejects(asAnon(() => q(`insert into remote_config (key, value) values ('evil', '{}')`)), /permission denied/);
    const before = await one(`select updated_at from remote_config where key = 'economy'`);
    await q(`update remote_config set value = '{"lives": {"max": 6}}' where key = 'economy'`);
    const after = await one(`select value, updated_at from remote_config where key = 'economy'`);
    assert.deepEqual(after.value, { lives: { max: 6 } });
    assert.ok(after.updated_at >= before.updated_at);
  });
});

describe('analytics events', () => {
  const SESSION = 'session-abc123';
  const log = (user, events, session = SESSION) =>
    asPlayer(user, () => one(`select log_events($1, $2::jsonb) as saved`, [session, JSON.stringify(events)]));

  test('a player logs a batch, saved under their own id, skipping malformed events', async () => {
    const saved = await log(ALICE, [
      { name: 'game_start', at: '2026-10-21T10:00:00.000Z', props: { mode: 'level', level: 'level-11', number: 11 } },
      { name: 'game_end', props: { mode: 'level', level: 'level-11', number: 11, won: false, submits: 3 } },
      { name: 'Bad Name!', props: {} },
      { name: 'feedback', props: 'not an object' },
      { name: 'feedback', props: { text: 'x'.repeat(5000) } },
      'not even an event',
    ]);
    assert.equal(saved.saved, 2);
    const rows = (await q(`select user_id, name, session from events order by id`)).rows;
    assert.deepEqual(rows.map((r) => [r.user_id, r.name, r.session]), [
      [ALICE, 'game_start', SESSION],
      [ALICE, 'game_end', SESSION],
    ]);
  });

  test('needs a signed-in player, a sane batch and a session id', async () => {
    await assert.rejects(asAnon(() => q(`select log_events('session-abc123', '[{"name": "x"}]')`)), /permission denied/);
    await assert.rejects(log(ALICE, []), /1 to 50 events/);
    await assert.rejects(log(ALICE, Array.from({ length: 51 }, () => ({ name: 'x' }))), /1 to 50 events/);
    await assert.rejects(log(ALICE, [{ name: 'x' }], 'no spaces allowed'), /session/);
  });

  test('ignores a player who sends too often', async () => {
    let saved = 0;
    for (let i = 0; i < 35; i++) saved += (await log(BOB, [{ name: 'game_quit', props: {} }])).saved;
    assert.equal(saved, 30); // 30 batches per 5-minute window
  });

  test('players cannot read events or the dashboard views', async () => {
    await assert.rejects(asPlayer(ALICE, () => q('select * from events')), /permission denied/);
    for (const view of ['level_stats', 'level_funnel', 'daily_stats', 'active_players', 'economy_stats', 'feedback', 'player_labels']) {
      await assert.rejects(asPlayer(ALICE, () => q(`select * from ${view}`)), /permission denied/, view);
    }
  });

  test('player_labels lists corrections made in play', async () => {
    await log(ALICE, [
      { name: 'label', props: { phrase: 'the moon glows', tier: 'poetic', judged: 'ok' } },
      { name: 'label', props: { phrase: 'x', tier: 'amazing' } },
    ]);
    const rows = (await q('select phrase, tier, judged from player_labels')).rows;
    assert.deepEqual(rows, [{ phrase: 'the moon glows', tier: 'poetic', judged: 'ok' }]);
  });

  test('level_stats sums up wins, losses, fail rate and ratings', async () => {
    await log(ALICE, [
      { name: 'game_start', props: { mode: 'level', level: 'level-11', number: 11 } },
      { name: 'game_end', props: { mode: 'level', level: 'level-11', number: 11, won: true, submits: 2, stars: 3 } },
      { name: 'rating', props: { mode: 'level', level: 'level-11', number: 11, rating: 'hard' } },
    ]);
    const row = await one(`select * from level_stats where number = 11`);
    assert.equal(Number(row.players), 1);
    assert.equal(Number(row.starts), 2);
    assert.equal(Number(row.wins), 1);
    assert.equal(Number(row.losses), 1);
    assert.equal(Number(row.fail_rate), 0.5);
    assert.equal(Number(row.submits_to_win), 2);
    assert.equal(Number(row.rated_hard), 1);
  });
});

describe('accounts and cloud saves', () => {
  const DAVE = '44444444-4444-4444-4444-444444444444';
  const ERIN = '55555555-5555-5555-5555-555555555555';
  const put = (user, data, expected = null) =>
    asPlayer(user, () => one(`select put_save($1::jsonb, $2::timestamptz) as at`, [JSON.stringify(data), expected]));

  before(async () => {
    await q('insert into auth.users values ($1), ($2)', [DAVE, ERIN]);
  });

  test('usernames are unique whatever their case, and well-formed', async () => {
    await q(`insert into accounts (user_id, username) values ($1, 'Dave_99')`, [DAVE]);
    await assert.rejects(q(`insert into accounts (user_id, username) values ($1, 'dave_99')`, [ERIN]), /unique/);
    await assert.rejects(q(`insert into accounts (user_id, username) values ($1, 'x')`, [ERIN]), /check/);
    await assert.rejects(q(`insert into accounts (user_id, username) values ($1, 'has space')`, [ERIN]), /check/);
  });

  test('players see only their own account and cannot make one themselves', async () => {
    const mine = await asPlayer(DAVE, () => q('select username from accounts'));
    assert.deepEqual(mine.rows, [{ username: 'Dave_99' }]);
    await assert.rejects(
      asPlayer(ERIN, () => q(`insert into accounts (user_id, username) values ($1, 'Erin')`, [ERIN])),
      /permission denied/,
    );
  });

  test('a save needs an account', async () => {
    await assert.rejects(put(ERIN, { progress: {} }), /Create an account first/);
  });

  test('saves only write over the version that was read', async () => {
    const first = await put(DAVE, { progress: { v: 1 } });
    assert.ok(first.at);
    // A second "first save" (another device that hadn't seen this one) is refused.
    assert.equal((await put(DAVE, { progress: { v: 2 } })).at, null);
    const read = await asPlayer(DAVE, () => one('select data, updated_at from get_save()'));
    assert.deepEqual(read.data, { progress: { v: 1 } });
    const second = await put(DAVE, { progress: { v: 3 } }, read.updated_at);
    assert.ok(second.at);
    // Writing over the old version again fails: someone saved since.
    assert.equal((await put(DAVE, { progress: { v: 4 } }, read.updated_at)).at, null);
    const latest = await asPlayer(DAVE, () => one('select data from get_save()'));
    assert.deepEqual(latest.data, { progress: { v: 3 } });
  });

  test('players never see anyone else\'s save, and saves have a size limit', async () => {
    const other = await asPlayer(ERIN, () => q('select * from get_save()'));
    assert.equal(other.rows.length, 0);
    await assert.rejects(asPlayer(DAVE, () => q('select * from saves')), /permission denied/);
    const read = await asPlayer(DAVE, () => one('select updated_at from get_save()'));
    await assert.rejects(put(DAVE, { blob: 'x'.repeat(300000) }, read.updated_at), /too big/);
    await assert.rejects(asAnon(() => q('select * from get_save()')), /permission denied/);
  });

  test('leaderboards show usernames, and Anonymous owl for players without an account', async () => {
    await q(`select save_level_score($1, 'level-12', 50, 3::smallint, '[]'::jsonb, 'v1')`, [DAVE]);
    await q(`select save_level_score($1, 'level-12', 40, 2::smallint, '[]'::jsonb, 'v1')`, [ERIN]);
    const rows = (await asPlayer(ERIN, () => q(`select name, is_me from level_leaderboard('level-12')`))).rows;
    assert.deepEqual(rows, [
      { name: 'Dave_99', is_me: false },
      { name: 'Anonymous owl', is_me: true },
    ]);
  });

  test('deleting the user deletes the account and its save', async () => {
    await q('delete from auth.users where id = $1', [DAVE]);
    assert.equal((await q('select * from accounts where user_id = $1', [DAVE])).rows.length, 0);
    assert.equal((await q('select * from saves where user_id = $1', [DAVE])).rows.length, 0);
  });
});

describe('admin', () => {
  const log = (user, events) =>
    asPlayer(user, () => one(`select log_events($1, $2::jsonb) as saved`, ['session-admin1', JSON.stringify(events)]));
  const JAMES = '66666666-6666-6666-6666-666666666666';
  const PLAYER = '77777777-7777-7777-7777-777777777777';
  const asJames = (fn) => asPlayer(JAMES, fn);

  before(async () => {
    await q('insert into auth.users values ($1), ($2)', [JAMES, PLAYER]);
    await q(`insert into accounts (user_id, username) values ($1, 'James')`, [JAMES]);
    // What the migration does for the real database, where James's account already existed.
    await q(`insert into admins (user_id) select user_id from accounts where username_key = 'james'`);
  });

  test('only the admin is an admin', async () => {
    assert.equal((await asJames(() => one('select is_admin() as yes'))).yes, true);
    assert.equal((await asPlayer(PLAYER, () => one('select is_admin() as yes'))).yes, false);
    await assert.rejects(asPlayer(PLAYER, () => q(`insert into admins values ($1)`, [PLAYER])), /permission denied/);
  });

  test('every admin function refuses other players', async () => {
    for (const sql of [
      `select admin_stats('overview')`,
      `select admin_review_queue()`,
      `select admin_review('the moon glows', 'ok')`,
      `select * from admin_training_labels()`,
      `select admin_get_config()`,
      `select admin_set_config('economy', '{}')`,
    ]) {
      await assert.rejects(asPlayer(PLAYER, () => q(sql)), /Admins only/, sql);
    }
    await assert.rejects(asAnon(() => q(`select admin_stats('overview')`)), /permission denied/);
  });

  test("players' corrections wait for review; the admin's own labels count at once", async () => {
    await asPlayer(PLAYER, () => q(`select submit_label('The Moon glows', 'poetic', 'ok')`));
    await asPlayer(BOB, () => q(`select submit_label('the moon glows', 'great', 'ok')`));
    await asJames(() => q(`select submit_label('owl reads the news', 'great')`));
    await assert.rejects(asPlayer(PLAYER, () => q(`select submit_label('x', 'ok')`)), /check/);
    await assert.rejects(asPlayer(PLAYER, () => q(`select submit_label('two words', 'amazing')`)), /check/);
    await assert.rejects(asPlayer(PLAYER, () => q('select * from labels')), /permission denied/);

    const queue = (await asJames(() => one('select admin_review_queue() as q'))).q;
    const moon = queue.find((r) => r.phrase === 'the moon glows');
    assert.deepEqual([moon.players, moon.judged, moon.votes], [2, 'ok', { poetic: 1, great: 1 }]);
    assert.equal(queue.some((r) => r.phrase === 'owl reads the news'), false);
    const training = (await asJames(() => q('select phrase, tier, source from admin_training_labels()'))).rows;
    assert.deepEqual(training, [{ phrase: 'owl reads the news', tier: 'great', source: 'admin' }]);
  });

  test('reviewing approves (as the tier chosen) or rejects every correction of a phrase', async () => {
    assert.equal((await asJames(() => one(`select admin_review('the moon glows', 'great') as n`))).n, 2);
    await asPlayer(PLAYER, () => q(`select submit_label('dog of the eat', 'ok', 'invalid')`));
    assert.equal((await asJames(() => one(`select admin_review('dog of the eat', null) as n`))).n, 1);
    const training = (await asJames(() => q('select phrase, tier from admin_training_labels()'))).rows;
    assert.deepEqual(training.map((r) => `${r.phrase}:${r.tier}`).sort(), [
      'owl reads the news:great',
      'the moon glows:great',
      'the moon glows:great',
    ]);
    assert.deepEqual((await asJames(() => one('select admin_review_queue() as q'))).q, []);
  });

  test('the dashboard reads the stats views', async () => {
    const overview = (await asJames(() => one(`select admin_stats('overview') as o`))).o;
    assert.ok(overview.accounts >= 1);
    assert.equal(typeof overview.labels_pending, 'number');
    const levels = (await asJames(() => one(`select admin_stats('level_stats') as r`))).r;
    assert.ok(levels.some((row) => row.number === 11));
    await log(ALICE, [{ name: 'feedback', props: { text: 'Level 12 is hard', version: 'abc1234', platform: 'web' } }]);
    const feedback = (await asJames(() => one(`select admin_stats('feedback') as r`))).r;
    assert.equal(feedback[0].text, 'Level 12 is hard');
    assert.equal(feedback[0].username, 'Alice');
    await assert.rejects(asJames(() => q(`select admin_stats('events')`)), /Unknown view/);
  });

  test('the admin can read and set the economy and tuning, and nothing else', async () => {
    await asJames(() => q(`select admin_set_config('tuning', '{"levels": {"level-37": {"stars": 0.85}}}')`));
    const config = (await asJames(() => one('select admin_get_config() as c'))).c;
    assert.deepEqual(config.tuning, { levels: { 'level-37': { stars: 0.85 } } });
    // The game reads it like any other remote config.
    const seen = await asAnon(() => one(`select value from remote_config where key = 'tuning'`));
    assert.deepEqual(seen.value, { levels: { 'level-37': { stars: 0.85 } } });
    await assert.rejects(asJames(() => q(`select admin_set_config('secrets', '{}')`)), /Unknown config/);
    await assert.rejects(asJames(() => q(`select admin_set_config('economy', '[1]')`)), /JSON object/);
  });
});

describe('unsolved daily puzzles', () => {
  const KIM = '88888888-8888-8888-8888-888888888888';
  const LEE = '99999999-9999-9999-9999-999999999999';
  const ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const save = (user, won, score, stars) =>
    q(`select save_daily_score($1, '2026-10-30', $2, $3, $4::smallint, 3::smallint, '[{"type":"submit"}]'::jsonb, 'v1')`, [user, won, score, stars]);

  before(async () => {
    await q('insert into auth.users values ($1), ($2), ($3)', [KIM, LEE, ADMIN]);
    await q(`insert into accounts (user_id, username) values ($1, 'Kim'), ($2, 'Lee'), ($3, 'Boss')`, [KIM, LEE, ADMIN]);
    await q('insert into admins (user_id) values ($1)', [ADMIN]);
  });

  test('rank below every solve, by their points', async () => {
    await save(KIM, false, 60, 0); // more points than the solve, but unsolved
    await save(LEE, true, 30, 1);
    await save(ALICE, false, 0, 0); // saved before unsolved runs kept points
    const rows = (await asPlayer(KIM, () => q(`select name, score, stars from daily_leaderboard('2026-10-30')`))).rows;
    assert.deepEqual(rows.map((r) => `${r.name}:${r.score}`), ['Lee:30', 'Kim:60', 'Alice:0']);
  });

  test('the admin can fill in the points of old unsolved runs, and nothing else', async () => {
    await assert.rejects(asPlayer(KIM, () => q('select * from admin_unscored_dailies()')), /Admins only/);
    const rows = (await asPlayer(ADMIN, () => q('select user_id, day from admin_unscored_dailies()'))).rows;
    assert.ok(rows.some((r) => r.user_id === ALICE));
    const set = (user, score) =>
      asPlayer(ADMIN, () => one(`select admin_set_unsolved_score($1, '2026-10-30', $2) as ok`, [user, score]));
    assert.equal((await set(ALICE, 13)).ok, true);
    assert.equal((await set(ALICE, 99)).ok, false); // already filled in
    assert.equal((await set(LEE, 99)).ok, false); // a solve
    assert.equal((await set(KIM, 99)).ok, false); // already has points
    assert.deepEqual((await one(`select score from daily_scores where user_id = $1 and day = '2026-10-30'`, [ALICE])).score, 13);
  });
});
