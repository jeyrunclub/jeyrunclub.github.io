-- ============================================================
-- Jeyrun member app — Supabase schema
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Idempotent: safe to re-run.
-- ============================================================

-- ---------- profiles ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  status      text not null default 'pending'
                check (status in ('pending','approved','rejected')),
  role        text not null default 'student'
                check (role in ('student','coach')),
  created_at  timestamptz not null default now()
);

-- ---------- plans (one row per student per week, Saturday-start) ----------
-- The coach fills one row per day of the week in `plan_days`; the student
-- reads it day by day. `plan_text` holds weeks written before the table
-- existed and is still shown when a week has no `plan_days`.
-- `sessions`/`notes` are leftovers from the old planner and are never read.
create table if not exists public.plans (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  week_start   date not null, -- the Saturday (Persian week start)
  -- One entry per day of the week, index 0 = Saturday .. 6 = Friday:
  --   [{"workout": "...", "note": "..."}, ...]
  plan_days    jsonb not null default '[]'::jsonb,
  plan_text    text,                               -- legacy free-text weeks
  sessions     jsonb not null default '[]'::jsonb, -- legacy, unused
  notes        text,                               -- legacy, unused
  updated_by   uuid references public.profiles(id),
  updated_at   timestamptz not null default now(),
  unique(student_id, week_start)
);

-- Existing installs: add the column.
-- What the runner is training for, in their own words: «ماراتن استانبول»,
-- «صعود دماوند», «اولین نیمه‌ماراتن». Free text, because a goal is a race far
-- more often than it is a time. pr_10k/goal_10k are the earlier 10k-specific
-- pair, kept so nothing already typed is lost, but no longer shown anywhere.
alter table public.profiles add column if not exists training_goal text;
alter table public.profiles add column if not exists avatar_path   text;
alter table public.profiles add column if not exists pr_10k   text;  -- legacy
alter table public.profiles add column if not exists goal_10k text;  -- legacy

alter table public.plans add column if not exists plan_text text;
alter table public.plans
  add column if not exists plan_days jsonb not null default '[]'::jsonb;

create index if not exists plans_student_week_idx
  on public.plans(student_id, week_start desc);

-- ---------- bootstrap coach emails ----------
-- Any account created with one of these emails is auto-approved as coach.
-- Edit this list and re-run this file to grant coach access to a new email
-- (existing accounts are updated by the UPDATE at the bottom).
create or replace function public._is_bootstrap_coach(em text)
returns boolean
language sql
immutable
as $$
  select lower(em) = any(array[
    'pjsofts@gmail.com',
    'salar.piri71@gmail.com'
  ]);
$$;

-- ---------- auto-create profile on signup ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bootstrap boolean := public._is_bootstrap_coach(new.email);
begin
  insert into public.profiles (id, full_name, phone, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    case when bootstrap then 'coach'    else 'student' end,
    case when bootstrap then 'approved' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- helpers ----------
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'coach'
  );
$$;

-- coach-only: change a profile's status / role (approve, promote, reject)
create or replace function public.set_profile_status(
  target uuid,
  new_status text,
  new_role text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_coach() then
    raise exception 'only coach can change status/role';
  end if;
  if new_status not in ('pending','approved','rejected') then
    raise exception 'invalid status';
  end if;
  if new_role is not null and new_role not in ('student','coach') then
    raise exception 'invalid role';
  end if;
  update public.profiles
     set status = new_status,
         role   = coalesce(new_role, role)
   where id = target;
end;
$$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.plans    enable row level security;

-- profiles: everyone sees their own; coach sees all
drop policy if exists "profiles: self read"  on public.profiles;
drop policy if exists "profiles: self edit"  on public.profiles;
drop policy if exists "profiles: coach read" on public.profiles;
drop policy if exists "profiles: coach edit" on public.profiles;

create policy "profiles: self read"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: self edit"
  on public.profiles for update
  using (id = auth.uid());
-- column-level grants below restrict what a self-edit can actually change.

create policy "profiles: coach read"
  on public.profiles for select
  using (public.is_coach());

create policy "profiles: coach edit"
  on public.profiles for update
  using (public.is_coach());

-- Lock down which columns a normal user can UPDATE.
-- (Coach still edits status/role via set_profile_status(), which is security-definer.)
revoke update on public.profiles from authenticated;
grant  update (full_name, phone, training_goal, pr_10k, goal_10k, avatar_path) on public.profiles to authenticated;
grant  select on public.profiles to authenticated;

-- plans: student reads own (read-only); coach can CRUD everything.
drop policy if exists "plans: student read"  on public.plans;
drop policy if exists "plans: student edit"  on public.plans;
drop policy if exists "plans: coach all"     on public.plans;

create policy "plans: student read"
  on public.plans for select
  using (student_id = auth.uid());

create policy "plans: coach all"
  on public.plans for all
  using (public.is_coach())
  with check (public.is_coach());

-- Grants are role-wide (coach and student are both `authenticated`), so the
-- write side is gated by RLS alone: with no student UPDATE/INSERT policy, only
-- the coach's "plans: coach all" policy admits a write.
grant select, insert, update, delete on public.plans to authenticated;

-- ---------- day_logs (the student's own record of a session) ----------
-- One row per student per calendar day. The coach writes the plan; the student
-- writes whether they actually did it. Deliberately separate from `plans` so a
-- student never needs write access to the plan itself.
create table if not exists public.day_logs (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  day         date not null,
  done        boolean not null default false,
  note        text,
  photo_path  text,   -- object name inside the `session-photos` bucket
  updated_at  timestamptz not null default now(),
  unique(student_id, day)
);

create index if not exists day_logs_student_day_idx
  on public.day_logs(student_id, day desc);

alter table public.day_logs enable row level security;

drop policy if exists "day_logs: student own" on public.day_logs;
drop policy if exists "day_logs: coach read"  on public.day_logs;

-- The log belongs to the student: they are the only one who can write it.
create policy "day_logs: student own"
  on public.day_logs for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "day_logs: coach read"
  on public.day_logs for select
  using (public.is_coach());

grant select, insert, update, delete on public.day_logs to authenticated;

-- ---------- coach-only view of all users (joins auth.users for email) ----------
-- The return type changes when columns are added, so drop before replacing.
drop function if exists public.list_all_users();
create or replace function public.list_all_users()
returns table (
  id         uuid,
  full_name  text,
  email      text,
  phone      text,
  role       text,
  status     text,
  training_goal text,
  pr_10k     text,
  goal_10k   text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, u.email::text, p.phone, p.role, p.status,
         p.training_goal, p.pr_10k, p.goal_10k, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
   where public.is_coach()
   order by
     case p.status when 'pending' then 0 when 'approved' then 1 else 2 end,
     p.full_name nulls last;
$$;

revoke execute on function public.list_all_users() from public;
grant  execute on function public.list_all_users() to authenticated;

-- ---------- Leaderboard (removed) ----------
-- The app no longer tracks per-session completion, so the leaderboard is gone.
drop function if exists public.leaderboard(date, date);

-- ---------- promote any existing accounts on the bootstrap list ----------
-- (idempotent; runs every time this file is executed)
update public.profiles p
   set role = 'coach', status = 'approved'
  from auth.users u
 where p.id = u.id
   and public._is_bootstrap_coach(u.email)
   and (p.role <> 'coach' or p.status <> 'approved');

-- ---------- Storage bucket for session photos ----------
-- Private. Students upload a photo with a day's log; the coach reads them back.
-- Every view mints a short-lived signed URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('session-photos', 'session-photos', false, 10485760,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Students CRUD only files under their own user-id folder
drop policy if exists "session-photos: student own" on storage.objects;
create policy "session-photos: student own"
  on storage.objects for all
  to authenticated
  using  (bucket_id = 'session-photos'
      and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'session-photos'
      and auth.uid()::text = (storage.foldername(name))[1]);

-- Coaches can read everyone's photos
drop policy if exists "session-photos: coach read" on storage.objects;
create policy "session-photos: coach read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'session-photos' and public.is_coach());

-- ---------- Storage bucket for profile pictures ----------
-- PUBLIC, unlike session photos. The leaderboard shows every member's picture
-- at once; signing a URL per row would mean a round trip per member on every
-- render. The trade is that an avatar URL works for anyone who has it — they
-- are profile pictures in a members' app, not private documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may read; you may only write inside your own user-id folder.
drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars: own write" on storage.objects;
create policy "avatars: own write"
  on storage.objects for all
  to authenticated
  using  (bucket_id = 'avatars'
      and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'avatars'
      and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------- Leaderboard ----------
-- Students may only select their OWN day_logs, so counting everybody has to
-- happen inside a security-definer function. It exposes nothing beyond a name,
-- a picture and two counts — no emails, no notes, no plans.
--
-- The membership check in the WHERE clause is the thing that actually protects
-- it. A grant alone did not: the publishable key is in the client bundle, so
-- "anyone authenticated" is close to "anyone", and an anonymous caller was
-- getting the whole board back. Guarding inside the body is how
-- list_all_users() does it too, and it holds no matter how the grants drift.
drop function if exists public.leaderboard();
create or replace function public.leaderboard()
returns table (
  id          uuid,
  full_name   text,
  avatar_path text,
  pr_10k      text,
  done_total  bigint,
  done_week   bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.full_name,
         p.avatar_path,
         p.pr_10k,
         count(dl.id) filter (where dl.done)                             as done_total,
         count(dl.id) filter (where dl.done and dl.day >= (current_date - 6)) as done_week
    from public.profiles p
    left join public.day_logs dl on dl.student_id = p.id
   where p.status = 'approved'
     and p.role <> 'coach'
     and exists (
       select 1 from public.profiles viewer
        where viewer.id = auth.uid()
          and (viewer.role = 'coach' or viewer.status = 'approved')
     )
   group by p.id, p.full_name, p.avatar_path, p.pr_10k
   order by done_total desc, done_week desc, p.full_name nulls last;
$$;

-- Approved members and the coach can read the board; nobody anonymous can.
revoke execute on function public.leaderboard() from public, anon;
grant execute on function public.leaderboard() to authenticated;

-- ---------- announcements (the club feed) ----------
-- Salar posts, everyone reads, everyone can like and comment. One table per
-- verb rather than counters on the post, so a like is idempotent by primary
-- key and nothing has to be kept in sync.
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcement_comments (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  author_id       uuid not null references public.profiles(id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now()
);

create table if not exists public.announcement_likes (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists announcements_created_idx
  on public.announcements(created_at desc);
create index if not exists announcement_comments_post_idx
  on public.announcement_comments(announcement_id, created_at);

-- "Is the caller in the club?" — used by every policy below. security definer
-- so it can read profiles without the caller needing a policy that lets them
-- see anyone but themselves. It is never used in a policy ON profiles, which
-- is what would make it recurse.
create or replace function public._is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and (p.role = 'coach' or p.status = 'approved')
  );
$$;
revoke execute on function public._is_member() from public, anon;
grant  execute on function public._is_member() to authenticated;

alter table public.announcements          enable row level security;
alter table public.announcement_comments  enable row level security;
alter table public.announcement_likes     enable row level security;

drop policy if exists "announcements: member read" on public.announcements;
drop policy if exists "announcements: coach write" on public.announcements;

create policy "announcements: member read"
  on public.announcements for select
  using (public._is_member());

-- Only the coach posts, and only as themselves.
create policy "announcements: coach write"
  on public.announcements for all
  using (exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'coach'))
  with check (author_id = auth.uid()
          and exists (select 1 from public.profiles p
                       where p.id = auth.uid() and p.role = 'coach'));

drop policy if exists "comments: member read"   on public.announcement_comments;
drop policy if exists "comments: own write"     on public.announcement_comments;
drop policy if exists "comments: own delete"    on public.announcement_comments;

create policy "comments: member read"
  on public.announcement_comments for select
  using (public._is_member());

create policy "comments: own write"
  on public.announcement_comments for insert
  with check (author_id = auth.uid() and public._is_member());

-- Your own comment, or the coach clearing something up.
create policy "comments: own delete"
  on public.announcement_comments for delete
  using (author_id = auth.uid()
      or exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'coach'));

drop policy if exists "likes: member read" on public.announcement_likes;
drop policy if exists "likes: own write"   on public.announcement_likes;
drop policy if exists "likes: own delete"  on public.announcement_likes;

create policy "likes: member read"
  on public.announcement_likes for select
  using (public._is_member());

create policy "likes: own write"
  on public.announcement_likes for insert
  with check (user_id = auth.uid() and public._is_member());

create policy "likes: own delete"
  on public.announcement_likes for delete
  using (user_id = auth.uid());

grant select, insert, update, delete on public.announcements         to authenticated;
grant select, insert, delete         on public.announcement_comments to authenticated;
grant select, insert, delete         on public.announcement_likes    to authenticated;

-- Reading the feed needs the poster's and each commenter's name and picture,
-- and a student may only select their own profiles row — the same wall the
-- leaderboard hit. So the feed comes back through security-definer functions
-- that expose a name and an avatar and nothing else: no email, no phone.
-- The membership check lives in the body, because the publishable key ships
-- in the client bundle and a grant alone protects nothing.
drop function if exists public.announcement_feed(int);
create or replace function public.announcement_feed(limit_n int default 20)
returns table (
  id            uuid,
  body          text,
  created_at    timestamptz,
  updated_at    timestamptz,
  author_id     uuid,
  author_name   text,
  author_avatar text,
  like_count    bigint,
  comment_count bigint,
  liked_by_me   boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.body, a.created_at, a.updated_at,
         a.author_id, p.full_name, p.avatar_path,
         (select count(*) from public.announcement_likes l
           where l.announcement_id = a.id),
         (select count(*) from public.announcement_comments c
           where c.announcement_id = a.id),
         exists (select 1 from public.announcement_likes l
                  where l.announcement_id = a.id and l.user_id = auth.uid())
    from public.announcements a
    join public.profiles p on p.id = a.author_id
   where public._is_member()
   order by a.created_at desc
   limit greatest(1, least(coalesce(limit_n, 20), 100));
$$;
revoke execute on function public.announcement_feed(int) from public, anon;
grant  execute on function public.announcement_feed(int) to authenticated;

drop function if exists public.announcement_thread(uuid);
create or replace function public.announcement_thread(post uuid)
returns table (
  id            uuid,
  body          text,
  created_at    timestamptz,
  author_id     uuid,
  author_name   text,
  author_avatar text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.body, c.created_at,
         c.author_id, p.full_name, p.avatar_path
    from public.announcement_comments c
    join public.profiles p on p.id = c.author_id
   where c.announcement_id = post
     and public._is_member()
   order by c.created_at;
$$;
revoke execute on function public.announcement_thread(uuid) from public, anon;
grant  execute on function public.announcement_thread(uuid) to authenticated;

-- ============================================================
-- To grant coach access to ANY OTHER email later:
--   1. Add the email to _is_bootstrap_coach() above
--   2. Re-run this whole file (safe — everything is idempotent)
-- ============================================================
