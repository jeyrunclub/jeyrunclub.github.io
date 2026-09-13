-- Jeyrun — in-app notifications. Run once in the Supabase SQL editor.
-- Idempotent; also appended to schema.sql.
--
-- Rows written by triggers, read by their owner and nobody else. This is the
-- part of "notify everyone" that Supabase can actually do on its own: a phone
-- that buzzes while the app is closed needs Web Push through Apple's and
-- Google's services, which is a separate piece of work with a real chance of
-- not being reachable from Iran.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  href       text,
  actor_id   uuid references public.profiles(id) on delete set null,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications: own read"  on public.notifications;
drop policy if exists "notifications: own write" on public.notifications;

create policy "notifications: own read"
  on public.notifications for select using (user_id = auth.uid());

-- Marking your own as read. Rows are only ever created by the triggers below,
-- which run as definer — there is no insert policy, so no client can forge one.
create policy "notifications: own write"
  on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, update on public.notifications to authenticated;

-- Everyone in the club except the person who caused it.
create or replace function public._notify_members(
  p_kind text, p_title text, p_body text, p_href text, p_actor uuid
) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, href, actor_id)
  select p.id, p_kind, p_title, left(coalesce(p_body, ''), 140), p_href, p_actor
    from public.profiles p
   where p.status = 'approved'
     and (p_actor is null or p.id <> p_actor);
$$;

-- ---------- an announcement ----------
create or replace function public._on_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._notify_members(
    'announcement', 'اطلاعیه‌ی تازه', new.body, '/app/news', new.author_id);
  return new;
end;
$$;
drop trigger if exists notify_announcement on public.announcements;
create trigger notify_announcement after insert on public.announcements
  for each row execute function public._on_announcement();

-- ---------- a comment: the post's author and everyone else in the thread ----------
create or replace function public._on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select full_name into v_name from public.profiles where id = new.author_id;

  insert into public.notifications (user_id, kind, title, body, href, actor_id)
  select distinct t.uid, 'comment',
         coalesce(v_name, 'یکی از اعضا') || ' نظر داد',
         left(new.body, 140), '/app/news', new.author_id
    from (
      select a.author_id as uid from public.announcements a where a.id = new.announcement_id
      union
      select c.author_id from public.announcement_comments c
       where c.announcement_id = new.announcement_id
    ) t
   where t.uid is not null and t.uid <> new.author_id;

  return new;
end;
$$;
drop trigger if exists notify_comment on public.announcement_comments;
create trigger notify_comment after insert on public.announcement_comments
  for each row execute function public._on_comment();

-- ---------- a record day ----------
create or replace function public._on_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._notify_members(
    'event', 'رکوردگیری اعلام شد', new.title, '/app/event', new.created_by);
  return new;
end;
$$;
drop trigger if exists notify_event on public.events;
create trigger notify_event after insert on public.events
  for each row execute function public._on_event();

-- ---------- the week's plan, to the one runner it belongs to ----------
-- Only when the table actually changed and is not empty: the coach's editor
-- saves on every keystroke-worth of work, and an empty save is not news.
create or replace function public._on_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.plan_days is null or jsonb_array_length(new.plan_days) = 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.plan_days is not distinct from new.plan_days then
    return new;
  end if;
  if new.updated_by is not null and new.updated_by = new.student_id then
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, href, actor_id)
  values (new.student_id, 'plan', 'برنامه‌ی تازه', 'برنامه‌ی هفته‌ات نوشته شد.',
          '/app', new.updated_by);
  return new;
end;
$$;
drop trigger if exists notify_plan on public.plans;
create trigger notify_plan after insert or update on public.plans
  for each row execute function public._on_plan();

-- ---------- somebody asking to join, to the coach ----------
create or replace function public._on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'pending' then return new; end if;
  insert into public.notifications (user_id, kind, title, body, href, actor_id)
  select c.id, 'signup', 'درخواست عضویت',
         coalesce(new.full_name, 'یک نفر') || ' می‌خواهد عضو شود.',
         '/app/coach', new.id
    from public.profiles c where c.role = 'coach';
  return new;
end;
$$;
drop trigger if exists notify_signup on public.profiles;
create trigger notify_signup after insert on public.profiles
  for each row execute function public._on_signup();

-- Live updates while the app is open.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.notifications;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
