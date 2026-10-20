-- The game's admin (the developer's account): the dashboard of play stats,
-- tuning levels and the economy from the game, and the training labels.
--
-- Admins are listed by user id, not by name, so if the account were ever
-- deleted, someone registering the same username wouldn't inherit it. Every
-- admin function checks is_admin() itself: the game only uses the answer to
-- decide which buttons to show. To add another admin later, in the SQL Editor:
--   insert into admins (user_id) select user_id from accounts where username_key = 'name';

create table public.admins (
  user_id uuid primary key references public.accounts (user_id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

insert into public.admins (user_id)
select user_id from public.accounts where username_key = 'james'
on conflict do nothing;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Training labels: what a phrase deserves, for training the built-in judge.
-- Players' "Wrong?" taps wait for review; the admin's own labels (from the
-- labelling screen or "Wrong?") count straight away. npm run pull:labels
-- takes the approved ones down to training/labels.jsonl on the PC.
-- ---------------------------------------------------------------------------
create table public.labels (
  id bigint generated always as identity primary key,
  phrase text not null check (phrase ~ '^[a-z'']+( [a-z'']+){1,9}$'),
  tier text not null check (tier in ('invalid', 'ok', 'great', 'poetic')),
  -- What the judge had said, for corrections made in play.
  judged text check (judged in ('invalid', 'ok', 'great', 'poetic')),
  source text not null check (source in ('play', 'admin')),
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- The tier the admin settled on (may differ from what the player said).
  final_tier text check (final_tier in ('invalid', 'ok', 'great', 'poetic')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index labels_by_status on public.labels (status, phrase);

alter table public.labels enable row level security;
revoke all on public.labels from anon, authenticated;

-- Corrections already sent as play stats (Phase 6) join the review queue.
insert into public.labels (phrase, tier, judged, source, user_id, created_at)
select e.props->>'phrase', e.props->>'tier',
       case when e.props->>'judged' in ('invalid', 'ok', 'great', 'poetic') then e.props->>'judged' end,
       'play', e.user_id, e.created_at
from public.events e
where e.name = 'label'
  and (e.props->>'phrase') ~ '^[a-z'']+( [a-z'']+){1,9}$'
  and e.props->>'tier' in ('invalid', 'ok', 'great', 'poetic');

-- Saves a label from the calling player: a "Wrong?" correction, or the
-- admin's own label. Players sending more than 60 in half an hour are ignored.
create function public.submit_label(p_phrase text, p_tier text, p_judged text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if not public.consume_judge_quota(auth.uid(), 1800, 60) then
    return;
  end if;
  insert into public.labels (phrase, tier, judged, source, user_id, status, final_tier, reviewed_at)
  values (
    lower(btrim(p_phrase)), p_tier, p_judged,
    case when v_admin then 'admin' else 'play' end, auth.uid(),
    case when v_admin then 'approved' else 'pending' end,
    case when v_admin then p_tier end,
    case when v_admin then now() end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin only.
-- ---------------------------------------------------------------------------

-- One of the dashboard's tables, as JSON rows: overview, level_stats,
-- level_funnel, daily_stats, active_players, economy_stats or feedback.
create function public.admin_stats(p_view text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  perform public.require_admin();
  if p_view = 'overview' then
    return jsonb_build_object(
      'players', (select count(distinct user_id) from public.events),
      'accounts', (select count(*) from public.accounts),
      'active_today', (select count(distinct user_id) from public.events where created_at >= date_trunc('day', now())),
      'active_week', (select count(distinct user_id) from public.events where created_at >= now() - interval '7 days'),
      'games_week', (select count(*) from public.events where name = 'game_end' and created_at >= now() - interval '7 days'),
      'labels_pending', (select count(distinct phrase) from public.labels where status = 'pending'),
      'feedback_week', (select count(*) from public.events where name = 'feedback' and created_at >= now() - interval '7 days')
    );
  elsif p_view = 'feedback' then
    select coalesce(jsonb_agg(row_to_json(f)), '[]'::jsonb) into v_rows from (
      select f.created_at, f.text, f.version, f.platform, a.username
      from public.feedback f left join public.accounts a on a.user_id = f.user_id
      order by f.created_at desc
      limit 200
    ) f;
    return v_rows;
  elsif p_view in ('level_stats', 'level_funnel', 'daily_stats', 'active_players', 'economy_stats') then
    execute format('select coalesce(jsonb_agg(row_to_json(v)), ''[]''::jsonb) from (select * from public.%I limit 500) v', p_view)
      into v_rows;
    return v_rows;
  end if;
  raise exception 'Unknown view %', p_view;
end;
$$;

-- Players' corrections waiting for review, one row per phrase: what the judge
-- said, how many players suggested each tier, and when.
create function public.admin_review_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  perform public.require_admin();
  with pending as (
    select phrase, tier, judged, created_at from public.labels where status = 'pending'
  ), votes as (
    select phrase, jsonb_object_agg(tier, n) as votes
    from (select phrase, tier, count(*) as n from pending group by phrase, tier) t
    group by phrase
  )
  select coalesce(jsonb_agg(row_to_json(q) order by q.players desc, q.last desc), '[]'::jsonb) into v_rows
  from (
    select p.phrase, mode() within group (order by p.judged) as judged, v.votes,
           count(*) as players, max(p.created_at) as last
    from pending p join votes v using (phrase)
    group by p.phrase, v.votes
    order by count(*) desc, max(p.created_at) desc
    limit 200
  ) q;
  return v_rows;
end;
$$;

-- Settles every pending correction of a phrase: approved as p_tier, or
-- rejected when p_tier is null. Returns how many corrections it settled.
create function public.admin_review(p_phrase text, p_tier text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public.require_admin();
  if p_tier is not null and p_tier not in ('invalid', 'ok', 'great', 'poetic') then
    raise exception 'Unknown tier %', p_tier;
  end if;
  update public.labels
  set status = case when p_tier is null then 'rejected' else 'approved' end,
      final_tier = p_tier,
      reviewed_at = now()
  where phrase = p_phrase and status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Every approved label, oldest first, for training (npm run pull:labels).
create function public.admin_training_labels()
returns table (phrase text, tier text, judged text, source text, at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select l.phrase, coalesce(l.final_tier, l.tier), l.judged, l.source, l.created_at
    from public.labels l
    where l.status = 'approved'
    order by l.created_at, l.id;
end;
$$;

-- The remote config as stored (the game only sees its parsed values), for editing.
create function public.admin_get_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  perform public.require_admin();
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_rows from public.remote_config;
  return v_rows;
end;
$$;

-- Replaces one remote config value (economy or tuning).
create function public.admin_set_config(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_key not in ('economy', 'tuning') then
    raise exception 'Unknown config %', p_key;
  end if;
  if jsonb_typeof(p_value) is distinct from 'object' or pg_column_size(p_value) > 65536 then
    raise exception 'The value must be a JSON object';
  end if;
  insert into public.remote_config (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke execute on function public.is_admin(), public.require_admin(), public.submit_label(text, text, text),
  public.admin_stats(text), public.admin_review_queue(), public.admin_review(text, text),
  public.admin_training_labels(), public.admin_get_config(), public.admin_set_config(text, jsonb)
  from public, anon;
grant execute on function public.is_admin(), public.submit_label(text, text, text),
  public.admin_stats(text), public.admin_review_queue(), public.admin_review(text, text),
  public.admin_training_labels(), public.admin_get_config(), public.admin_set_config(text, jsonb)
  to authenticated;
