-- A second admin: Kimberly's account (kimberlymladd), with the same access as
-- James's (the dashboard, tuning, the review queue and labelling). By user
-- id, like the first. If the account doesn't exist yet when this runs, it
-- adds no one; run the insert again in the SQL Editor once it does.

insert into public.admins (user_id)
select user_id from public.accounts where username_key = 'kimberlymladd'
on conflict do nothing;
