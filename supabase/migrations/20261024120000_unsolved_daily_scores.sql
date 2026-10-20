-- Unsolved daily puzzles keep their points.
--
-- A daily puzzle that runs out of submits before its first star used to be
-- saved with a score of 0. The scores function now saves its real points, and
-- the board ranks every solve first, then unsolved runs by their points.
-- Runs saved before this change still say 0: npm run rescore:dailies replays
-- their stored moves and fills in the points.

create or replace function public.daily_leaderboard(p_day date, p_limit integer default 50)
returns table (rank bigint, name text, score integer, stars smallint, submits smallint, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select rank() over (order by d.won desc, d.score desc, d.submits, d.created_at) as rank,
           coalesce(a.username, 'Anonymous owl') as name, d.score, d.stars, d.submits,
           d.user_id = auth.uid() as is_me
    from public.daily_scores d left join public.accounts a on a.user_id = d.user_id
    where d.day = p_day
  )
  select * from ranked
  where rank <= least(greatest(p_limit, 1), 100) or is_me
  order by rank;
$$;

-- Admin only: unsolved runs still saved with 0 points, with their moves.
create function public.admin_unscored_dailies()
returns table (user_id uuid, day date, actions jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select d.user_id, d.day, d.actions from public.daily_scores d where not d.won and d.score = 0;
end;
$$;

-- Admin only: fills in an unsolved run's points (worked out by replaying its
-- moves with the game's own scoring). Never touches a solve.
create function public.admin_set_unsolved_score(p_user uuid, p_day date, p_score integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.daily_scores set score = p_score
  where user_id = p_user and day = p_day and not won and score = 0 and p_score >= 0;
  return found;
end;
$$;

revoke execute on function public.admin_unscored_dailies(), public.admin_set_unsolved_score(uuid, date, integer)
  from public, anon;
grant execute on function public.admin_unscored_dailies(), public.admin_set_unsolved_score(uuid, date, integer)
  to authenticated;
