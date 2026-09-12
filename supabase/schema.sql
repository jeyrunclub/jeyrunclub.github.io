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
alter table public.profiles add column if not exists pr_10k   text;
alter table public.profiles add column if not exists goal_10k text;

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
grant  update (full_name, phone, pr_10k, goal_10k) on public.profiles to authenticated;
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
         p.pr_10k, p.goal_10k, p.created_at
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

-- ---------- Storage bucket for session photos (legacy) ----------
-- No longer written to — the app has no photo upload. Kept so existing photos
-- stay reachable; drop the bucket by hand in the Supabase dashboard to delete them.
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

-- ============================================================
-- To grant coach access to ANY OTHER email later:
--   1. Add the email to _is_bootstrap_coach() above
--   2. Re-run this whole file (safe — everything is idempotent)
-- ============================================================
