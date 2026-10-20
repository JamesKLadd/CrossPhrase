-- Live ops (Phase 6): remote config, play analytics and feedback.

-- ---------------------------------------------------------------------------
-- Remote config: settings the game reads when it starts, so the economy and
-- level difficulty can be retuned from the Supabase dashboard (Table Editor →
-- remote_config) without a new build. The keys the game knows:
--   economy  overrides for DEFAULT_ECONOMY in src/core/economy.ts
--   tuning   level difficulty, see src/core/tuning.ts
-- A value the game doesn't understand is ignored and the default kept.
-- Anyone may read it (game settings, nothing secret); only the dashboard and
-- the service role can change it.
-- ---------------------------------------------------------------------------
create table public.remote_config (
  key text primary key check (key ~ '^[a-z_]{1,40}$'),
  value jsonb not null,
  note text,
  updated_at timestamptz not null default now()
);

alter table public.remote_config enable row level security;
revoke all on public.remote_config from anon, authenticated;
grant select on public.remote_config to anon, authenticated;

create policy "Anyone can read the remote config" on public.remote_config
  for select to anon, authenticated using (true);

create function public.touch_remote_config()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger remote_config_touch before update on public.remote_config
  for each row execute function public.touch_remote_config();

insert into public.remote_config (key, value, note) values
  ('economy', '{}', 'Overrides for DEFAULT_ECONOMY (src/core/economy.ts), e.g. {"lives": {"refillMinutes": 20}, "boosters": {"hint": {"cost": 15}}}'),
  ('tuning', '{}', 'Level difficulty (src/core/tuning.ts), e.g. {"bands": {"mid": {"stars": 0.9}}, "levels": {"level-37": {"swaps": 1}}}');

-- ---------------------------------------------------------------------------
-- Play analytics: anonymous events the game sends in batches (switchable in
-- Settings). Players can only add their own events, through log_events; they
-- can't read any. The views below sum them up for the dashboard.
-- ---------------------------------------------------------------------------
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session text not null,
  name text not null,
  props jsonb not null default '{}',
  client_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index events_name_time on public.events (name, created_at);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

-- Saves a batch of the calling player's events. Malformed events are skipped;
-- a player sending too often (more than 30 batches in 5 minutes) is ignored
-- for the rest of the window. Returns how many events were saved.
create function public.log_events(p_session text, p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_saved integer;
begin
  if v_user is null then
    raise exception 'Sign in first';
  end if;
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events) not between 1 and 50 then
    raise exception 'Send 1 to 50 events at a time';
  end if;
  if p_session !~ '^[A-Za-z0-9-]{8,40}$' then
    raise exception 'Bad session id';
  end if;
  -- The quota table counts by window length, so this 5-minute window is
  -- separate from the judge's and the leaderboard's.
  if not public.consume_judge_quota(v_user, 300, 30) then
    return 0;
  end if;

  insert into public.events (user_id, session, name, props, client_at)
  select v_user, p_session, e->>'name', coalesce(e->'props', '{}'),
         case
           when (e->>'at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$'
             then least(now(), greatest(now() - interval '7 days', (e->>'at')::timestamptz))
           else now()
         end
  from jsonb_array_elements(p_events) e
  where jsonb_typeof(e) = 'object'
    and (e->>'name') ~ '^[a-z_]{1,40}$'
    and jsonb_typeof(coalesce(e->'props', '{}')) = 'object'
    and pg_column_size(coalesce(e->'props', '{}')) <= 2048;
  get diagnostics v_saved = row_count;
  return v_saved;
end;
$$;

revoke execute on function public.log_events(text, jsonb) from public, anon;
grant execute on function public.log_events(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard views (Table Editor or SQL Editor; players can't read them).
-- Events the game sends: session_start, game_start, game_submit, game_end,
-- game_quit (props: mode = level | daily | zen, level, number, ...),
-- rating, booster, hearts_refill, out_of_hearts, share, feedback, label.
-- ---------------------------------------------------------------------------

-- How each level plays: who starts it, wins, loses or gives up, and how
-- playtesters rated it. A high fail rate or many "hard" ratings mark a level
-- to ease with the `tuning` remote config.
create view public.level_stats with (security_invoker = true) as
with games as (
  select (props->>'number')::integer as number, props->>'level' as level, name, user_id, props
  from public.events
  where props->>'mode' = 'level' and (props->>'number') ~ '^\d{1,4}$'
)
select
  number,
  min(level) as level,
  count(distinct user_id) filter (where name = 'game_start') as players,
  count(*) filter (where name = 'game_start') as starts,
  count(*) filter (where name = 'game_end' and props->>'won' = 'true') as wins,
  count(*) filter (where name = 'game_end' and props->>'won' = 'false') as losses,
  count(*) filter (where name = 'game_quit') as quits,
  round(
    count(*) filter (where name = 'game_end' and props->>'won' = 'false')::numeric
      / nullif(count(*) filter (where name = 'game_end'), 0),
    2
  ) as fail_rate,
  round(avg((props->>'submits')::numeric) filter (where name = 'game_end' and props->>'won' = 'true'), 2)
    as submits_to_win,
  round(avg((props->>'stars')::numeric) filter (where name = 'game_end' and props->>'won' = 'true'), 2)
    as avg_stars,
  count(*) filter (where name = 'game_end' and props->>'boosted' = 'true') as boosted,
  count(*) filter (where name = 'rating' and props->>'rating' = 'easy') as rated_easy,
  count(*) filter (where name = 'rating' and props->>'rating' = 'right') as rated_right,
  count(*) filter (where name = 'rating' and props->>'rating' = 'hard') as rated_hard
from games
group by number
order by number;

-- How far players get: how many have started each level.
create view public.level_funnel with (security_invoker = true) as
select (props->>'number')::integer as number, count(distinct user_id) as players
from public.events
where name = 'game_start' and props->>'mode' = 'level' and (props->>'number') ~ '^\d{1,4}$'
group by 1
order by 1;

-- Each day's daily puzzle.
create view public.daily_stats with (security_invoker = true) as
select
  props->>'day' as day,
  count(distinct user_id) filter (where name = 'game_start') as players,
  count(*) filter (where name = 'game_end' and props->>'won' = 'true') as wins,
  count(*) filter (where name = 'game_end' and props->>'won' = 'false') as losses,
  round(avg((props->>'score')::numeric) filter (where name = 'game_end' and props->>'won' = 'true'), 1)
    as avg_winning_score,
  count(*) filter (where name = 'share') as shares,
  count(*) filter (where name = 'rating' and props->>'rating' = 'easy') as rated_easy,
  count(*) filter (where name = 'rating' and props->>'rating' = 'right') as rated_right,
  count(*) filter (where name = 'rating' and props->>'rating' = 'hard') as rated_hard
from public.events
where props->>'mode' = 'daily'
group by 1
order by 1 desc;

-- Players, sessions and games per day (UTC).
create view public.active_players with (security_invoker = true) as
select
  (created_at at time zone 'utc')::date as day,
  count(distinct user_id) as players,
  count(*) filter (where name = 'session_start') as sessions,
  count(*) filter (where name = 'game_end') as games
from public.events
group by 1
order by 1 desc;

-- Where feathers go: boosters bought, hearts refilled, and how often players run out.
create view public.economy_stats with (security_invoker = true) as
select name, coalesce(props->>'kind', '') as kind, count(*) as times, count(distinct user_id) as players,
       coalesce(sum((props->>'cost')::integer) filter (where (props->>'cost') ~ '^\d{1,4}$'), 0) as feathers
from public.events
where name in ('booster', 'hearts_refill', 'out_of_hearts')
group by 1, 2
order by 1, 2;

-- What playtesters wrote in Settings → Feedback, newest first.
create view public.feedback with (security_invoker = true) as
select created_at, props->>'text' as text, props->>'version' as version, props->>'platform' as platform, user_id
from public.events
where name = 'feedback'
order by created_at desc;

-- "Wrong?" corrections players made in play: training data for the judges.
-- Export it as CSV (SQL Editor: select * from player_labels) and run
-- npm run import:labels -- <file.csv> to add it to training/labels.jsonl.
create view public.player_labels with (security_invoker = true) as
select created_at as at, props->>'phrase' as phrase, props->>'tier' as tier, props->>'judged' as judged, user_id
from public.events
where name = 'label' and props->>'tier' in ('invalid', 'ok', 'great', 'poetic')
order by created_at;

revoke all on public.level_stats, public.level_funnel, public.daily_stats, public.active_players,
  public.economy_stats, public.feedback, public.player_labels from anon, authenticated;
