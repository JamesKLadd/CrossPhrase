-- Accounts and cloud saves.
--
-- Every player starts as an anonymous Supabase user (one per device). Creating
-- an account turns that user into a permanent one with a username and
-- password (the `account` function does it, with a made-up email address:
-- see supabase/functions/_shared/accountRules.ts), so their scores stay
-- theirs. Logging in on another device signs in as the same user, and the
-- game merges that device's progress with the cloud save.

create table public.accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,14}[A-Za-z0-9]$'),
  -- Usernames are unique whatever their case.
  username_key text generated always as (lower(username)) stored unique,
  created_at timestamptz not null default now()
);

alter table public.accounts enable row level security;
revoke all on public.accounts from anon, authenticated;
grant select (user_id, username, created_at) on public.accounts to authenticated;

create policy "Players see their own account" on public.accounts
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Cloud saves: one per account, the game's progress and wallet as JSON. The
-- game merges before it saves (src/account/merge.ts), so a save only ever
-- grows. put_save only writes over the version the game last read, so two
-- devices saving at once can't overwrite each other's progress: the one that
-- loses reads the newer save, merges again and retries.
-- ---------------------------------------------------------------------------
create table public.saves (
  user_id uuid primary key references public.accounts (user_id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.saves enable row level security;
revoke all on public.saves from anon, authenticated;

-- The calling player's save, or no rows if there isn't one yet.
create function public.get_save()
returns table (data jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.data, s.updated_at from public.saves s where s.user_id = auth.uid();
$$;

-- Saves the calling player's progress. `p_expected` is the updated_at of the
-- save the game merged with (null if there was none). Returns the new
-- updated_at, or null if the save changed in the meantime (read it again).
create function public.put_save(p_data jsonb, p_expected timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null or not exists (select 1 from public.accounts where user_id = auth.uid()) then
    raise exception 'Create an account first';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data) > 262144 then
    raise exception 'That save is too big';
  end if;
  if p_expected is null then
    insert into public.saves (user_id, data) values (auth.uid(), p_data)
    on conflict (user_id) do nothing
    returning updated_at into v_at;
  else
    update public.saves set data = p_data, updated_at = clock_timestamp()
    where user_id = auth.uid() and updated_at = p_expected
    returning updated_at into v_at;
  end if;
  return v_at;
end;
$$;

revoke execute on function public.get_save() from public, anon;
revoke execute on function public.put_save(jsonb, timestamptz) from public, anon;
grant execute on function public.get_save() to authenticated;
grant execute on function public.put_save(jsonb, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Leaderboard names are now account usernames; players without an account
-- show as "Anonymous owl". The old free-text names (set_player_name) are
-- retired, so nobody can take a name that looks like someone's username.
-- ---------------------------------------------------------------------------
create or replace function public.daily_leaderboard(p_day date, p_limit integer default 50)
returns table (rank bigint, name text, score integer, stars smallint, submits smallint, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select rank() over (order by d.score desc, d.submits, d.created_at) as rank,
           coalesce(a.username, 'Anonymous owl') as name, d.score, d.stars, d.submits,
           d.user_id = auth.uid() as is_me
    from public.daily_scores d left join public.accounts a on a.user_id = d.user_id
    where d.day = p_day
  )
  select * from ranked
  where rank <= least(greatest(p_limit, 1), 100) or is_me
  order by rank;
$$;

create or replace function public.level_leaderboard(p_level text, p_limit integer default 50)
returns table (rank bigint, name text, score integer, stars smallint, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select rank() over (order by l.score desc, l.updated_at) as rank,
           coalesce(a.username, 'Anonymous owl') as name, l.score, l.stars,
           l.user_id = auth.uid() as is_me
    from public.level_scores l left join public.accounts a on a.user_id = l.user_id
    where l.level_id = p_level
  )
  select * from ranked
  where rank <= least(greatest(p_limit, 1), 100) or is_me
  order by rank;
$$;

revoke execute on function public.set_player_name(text) from authenticated;
