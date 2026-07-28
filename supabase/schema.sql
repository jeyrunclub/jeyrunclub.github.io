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

-- ---------- plans (one row per student per ISO-week Saturday) ----------
create table if not exists public.plans (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  week_start   date not null, -- the Saturday (Persian week start)
  sessions     jsonb not null default '[]'::jsonb,
  -- shape: [{day:0..6, title, description, distance_km?, minutes?, done:false}]
  notes        text,
  updated_by   uuid references public.profiles(id),
  updated_at   timestamptz not null default now(),
  unique(student_id, week_start)
);

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
    'pjsofts@gmail.com'
    -- , 'salar@example.com'  -- add Salar's real email here
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
  insert into public.profiles (id, full_name, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
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
grant  update (full_name, phone) on public.profiles to authenticated;
grant  select on public.profiles to authenticated;

-- plans: student reads own, coach reads all; student can toggle "done"; coach can CRUD
drop policy if exists "plans: student read"  on public.plans;
drop policy if exists "plans: student edit"  on public.plans;
drop policy if exists "plans: coach all"     on public.plans;

create policy "plans: student read"
  on public.plans for select
  using (student_id = auth.uid());

create policy "plans: student edit"
  on public.plans for update
  using (student_id = auth.uid());

create policy "plans: coach all"
  on public.plans for all
  using (public.is_coach())
  with check (public.is_coach());

-- Students can only mark sessions done — restrict column-level UPDATE.
revoke update on public.plans from authenticated;
grant  update (sessions) on public.plans to authenticated;
grant  select on public.plans to authenticated;
-- Coach can insert / delete via RLS above (all commands allowed for coach).
grant  insert, delete, update on public.plans to authenticated;
-- ^ Together with column grants and RLS: only coach effectively gets full update
--   (RLS "plans: student edit" applies to students, whose grants are limited to `sessions`).

-- ---------- promote any existing accounts on the bootstrap list ----------
-- (idempotent; runs every time this file is executed)
update public.profiles p
   set role = 'coach', status = 'approved'
  from auth.users u
 where p.id = u.id
   and public._is_bootstrap_coach(u.email)
   and (p.role <> 'coach' or p.status <> 'approved');

-- ============================================================
-- To grant coach access to ANY OTHER email later:
--   1. Add the email to _is_bootstrap_coach() above
--   2. Re-run this whole file (safe — everything is idempotent)
-- ============================================================
