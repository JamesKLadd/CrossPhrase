-- Phase 2: the AI judge's shared verdict cache, player appeals, per-player
-- rate limits, and a usage log for measuring cost per player.

-- ---------------------------------------------------------------------------
-- Verdict cache: every AI verdict, keyed by phrase and shared by all players.
-- Only the judge function (service role) reads or writes it.
-- ---------------------------------------------------------------------------
create table public.verdict_cache (
  phrase text primary key check (char_length(phrase) between 1 and 300),
  tier text not null check (tier in ('invalid', 'ok', 'great', 'poetic')),
  reading text not null,
  reason text not null default '',
  quip text not null default '',
  -- Verdicts from an older judge prompt are re-judged on next use.
  -- Rulings from upheld appeals ('appeal') are kept whatever the version.
  prompt_version integer not null,
  source text not null default 'model' check (source in ('model', 'appeal')),
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.verdict_cache enable row level security;

create function public.record_verdict_hits(p_phrases text[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.verdict_cache set hits = hits + 1 where phrase = any (p_phrases);
$$;

-- ---------------------------------------------------------------------------
-- Appeals: players contest an "invalid" verdict. Review them in the Supabase
-- table editor: set status to 'upheld' with a resolved_tier, or 'rejected'.
-- ---------------------------------------------------------------------------
create table public.appeals (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid () references auth.users (id) on delete cascade,
  phrase text not null check (char_length(phrase) between 1 and 300),
  -- The verdict being appealed, copied from the cache when the appeal is filed.
  appealed_tier text,
  appealed_reason text,
  status text not null default 'pending' check (status in ('pending', 'upheld', 'rejected')),
  -- The tier the phrase should have had; required when upholding.
  resolved_tier text check (resolved_tier in ('invalid', 'ok', 'great', 'poetic')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, phrase),
  check (status <> 'upheld' or resolved_tier is not null)
);
create index appeals_pending_idx on public.appeals (created_at) where status = 'pending';
create index appeals_phrase_idx on public.appeals (phrase);
alter table public.appeals enable row level security;

-- Players may only file the phrase; everything else is set by the database.
revoke all on public.appeals from anon, authenticated;
grant select on public.appeals to authenticated;
grant insert (phrase) on public.appeals to authenticated;

create policy "Players file their own appeals" on public.appeals
  for insert to authenticated
  with check (user_id = (select auth.uid ()));

create policy "Players see their own appeals" on public.appeals
  for select to authenticated
  using (user_id = (select auth.uid ()));

create function public.appeals_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select tier, reason into new.appealed_tier, new.appealed_reason
  from public.verdict_cache
  where phrase = new.phrase;
  if new.appealed_tier is null then
    raise exception 'No verdict to appeal for this phrase' using errcode = 'P0002';
  end if;
  new.status := 'pending';
  new.resolved_tier := null;
  new.resolved_at := null;
  return new;
end;
$$;

create trigger appeals_before_insert
  before insert on public.appeals
  for each row execute function public.appeals_before_insert();

create function public.appeals_stamp_resolution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.resolved_at := now();
  return new;
end;
$$;

create trigger appeals_stamp_resolution
  before update of status on public.appeals
  for each row
  when (old.status = 'pending' and new.status <> 'pending')
  execute function public.appeals_stamp_resolution();

-- An upheld appeal overwrites the cached verdict for everyone, and one ruling
-- settles every other pending appeal of the same phrase.
create function public.appeals_apply_resolution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'upheld' then
    insert into public.verdict_cache as v (phrase, tier, reading, reason, quip, prompt_version, source)
    values (
      new.phrase,
      new.resolved_tier,
      new.phrase,
      '',
      'On reflection, I was wrong. Do not let it go to your head.',
      0,
      'appeal'
    )
    on conflict (phrase) do update
    set tier = excluded.tier,
        reason = case when excluded.tier = 'invalid' then v.reason else '' end,
        quip = excluded.quip,
        source = 'appeal',
        updated_at = now();
  end if;

  update public.appeals
  set status = new.status, resolved_tier = new.resolved_tier
  where phrase = new.phrase and status = 'pending' and id <> new.id;
  return null;
end;
$$;

create trigger appeals_apply_resolution
  after update of status on public.appeals
  for each row
  when (old.status = 'pending' and new.status <> 'pending' and pg_trigger_depth() < 1)
  execute function public.appeals_apply_resolution();

-- ---------------------------------------------------------------------------
-- Rate limits: judge requests per player per fixed time window.
-- ---------------------------------------------------------------------------
create table public.judge_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  window_seconds integer not null,
  window_start timestamptz not null,
  calls integer not null default 0,
  primary key (user_id, window_seconds, window_start)
);
alter table public.judge_usage enable row level security;

-- Counts one request against the player's current window and returns whether
-- they are still within p_limit.
create function public.consume_judge_quota(p_user uuid, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_calls integer;
begin
  insert into public.judge_usage as u (user_id, window_seconds, window_start, calls)
  values (p_user, p_window_seconds, v_start, 1)
  on conflict (user_id, window_seconds, window_start) do update set calls = u.calls + 1
  returning calls into v_calls;

  -- Finished windows are no longer needed.
  delete from public.judge_usage
  where user_id = p_user and window_seconds = p_window_seconds and window_start < v_start;

  return v_calls <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Usage log: one row per judge request, for measuring cost per player.
-- ---------------------------------------------------------------------------
create table public.judge_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  phrases integer not null,
  cache_hits integer not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  latency_ms integer,
  created_at timestamptz not null default now()
);
create index judge_calls_created_at_idx on public.judge_calls (created_at);
alter table public.judge_calls enable row level security;

-- Daily judge cost and cost per active player. Prices are Claude Haiku 5.5
-- list prices in USD per million tokens (prompts under 100K tokens):
-- input 0.10, output 0.50, cache reads 0.01, 5-minute cache writes 0.125.
-- Update them here if pricing changes.
create view public.judge_cost_daily
with (security_invoker = true)
as
with priced as (
  select
    created_at::date as day,
    user_id,
    phrases,
    cache_hits,
    (input_tokens * 0.10 + output_tokens * 0.50 + cache_read_tokens * 0.01 + cache_write_tokens * 0.125) / 1e6 as cost_usd
  from public.judge_calls
)
select
  day,
  count(distinct user_id) as active_players,
  count(*) as requests,
  sum(phrases) as phrases,
  round(100.0 * sum(cache_hits) / nullif(sum(phrases), 0), 1) as cache_hit_pct,
  round(sum(cost_usd)::numeric, 4) as cost_usd,
  round((sum(cost_usd) / count(distinct user_id))::numeric, 6) as cost_per_player_usd
from priced
group by day
order by day desc;

-- Only the judge function (service role) uses these.
revoke all on public.verdict_cache, public.judge_usage, public.judge_calls from anon, authenticated;
revoke execute on function public.record_verdict_hits(text[]) from public, anon, authenticated;
revoke execute on function public.consume_judge_quota(uuid, integer, integer) from public, anon, authenticated;
revoke all on public.judge_cost_daily from anon, authenticated;
