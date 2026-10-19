-- Leaderboards (Phase 5): the daily puzzle and per-level bests.
--
-- Scores are only ever written by the `scores` Edge Function, which replays
-- each run's moves with the shared game core and re-judges it with the
-- built-in judge before saving (see src/server/scores.ts). Players read
-- leaderboards through the functions below, which show names and scores but
-- never anyone's moves.

-- Display names. A player without one shows as "Anonymous owl".
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 20),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create policy "Players see their own profile" on public.profiles
  for select to authenticated using (user_id = auth.uid());

-- Sets (or changes) the calling player's display name.
create function public.set_player_name(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  insert into public.profiles (user_id, name) values (auth.uid(), btrim(p_name))
  on conflict (user_id) do update set name = excluded.name, updated_at = now();
end;
$$;

-- One attempt per player per daily puzzle; the first finished run is final.
create table public.daily_scores (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  won boolean not null,
  score integer not null check (score >= 0),
  stars smallint not null check (stars between 0 and 3),
  submits smallint not null check (submits between 1 and 3),
  actions jsonb not null,
  judge_version text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index daily_scores_board on public.daily_scores (day, score desc, submits, created_at);

-- Each player's best clear of each level.
create table public.level_scores (
  user_id uuid not null references auth.users (id) on delete cascade,
  level_id text not null,
  score integer not null check (score >= 0),
  stars smallint not null check (stars between 1 and 3),
  actions jsonb not null,
  judge_version text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, level_id)
);

create index level_scores_board on public.level_scores (level_id, score desc, updated_at);

alter table public.daily_scores enable row level security;
alter table public.level_scores enable row level security;
revoke all on public.daily_scores, public.level_scores from anon, authenticated;

-- Saves a daily result unless the player already has one. True if saved.
create function public.save_daily_score(
  p_user uuid, p_day date, p_won boolean, p_score integer, p_stars smallint,
  p_submits smallint, p_actions jsonb, p_judge_version text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.daily_scores (user_id, day, won, score, stars, submits, actions, judge_version)
  values (p_user, p_day, p_won, p_score, p_stars, p_submits, p_actions, p_judge_version)
  on conflict (user_id, day) do nothing;
  return found;
end;
$$;

-- Saves a level clear if it beats the player's best. True if saved.
create function public.save_level_score(
  p_user uuid, p_level text, p_score integer, p_stars smallint, p_actions jsonb, p_judge_version text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.level_scores (user_id, level_id, score, stars, actions, judge_version)
  values (p_user, p_level, p_score, p_stars, p_actions, p_judge_version)
  on conflict (user_id, level_id) do update
    set score = excluded.score, stars = excluded.stars, actions = excluded.actions,
        judge_version = excluded.judge_version, updated_at = now()
    where excluded.score > public.level_scores.score;
  return found;
end;
$$;

-- The top of a day's board, plus the calling player's own row wherever it is.
create function public.daily_leaderboard(p_day date, p_limit integer default 50)
returns table (rank bigint, name text, score integer, stars smallint, submits smallint, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select rank() over (order by d.score desc, d.submits, d.created_at) as rank,
           coalesce(p.name, 'Anonymous owl') as name, d.score, d.stars, d.submits,
           d.user_id = auth.uid() as is_me
    from public.daily_scores d left join public.profiles p on p.user_id = d.user_id
    where d.day = p_day
  )
  select * from ranked
  where rank <= least(greatest(p_limit, 1), 100) or is_me
  order by rank;
$$;

create function public.level_leaderboard(p_level text, p_limit integer default 50)
returns table (rank bigint, name text, score integer, stars smallint, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select rank() over (order by l.score desc, l.updated_at) as rank,
           coalesce(p.name, 'Anonymous owl') as name, l.score, l.stars,
           l.user_id = auth.uid() as is_me
    from public.level_scores l left join public.profiles p on p.user_id = l.user_id
    where l.level_id = p_level
  )
  select * from ranked
  where rank <= least(greatest(p_limit, 1), 100) or is_me
  order by rank;
$$;

revoke execute on function public.save_daily_score(uuid, date, boolean, integer, smallint, smallint, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.save_level_score(uuid, text, integer, smallint, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.daily_leaderboard(date, integer) from public, anon;
revoke execute on function public.level_leaderboard(text, integer) from public, anon;
revoke execute on function public.set_player_name(text) from public, anon;
grant execute on function public.set_player_name(text) to authenticated;
grant execute on function public.daily_leaderboard(date, integer) to authenticated;
grant execute on function public.level_leaderboard(text, integer) to authenticated;
