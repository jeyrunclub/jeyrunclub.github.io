-- Jeyrun — رکوردگیری events. Run once in the Supabase SQL editor.
-- Idempotent; also appended to schema.sql.

-- ---------- personal records, per distance ----------
-- profiles.pr_10k held one number because the app only ever asked about 10k.
-- A record event lets each runner pick their own distance, so a record is now
-- (runner, distance). The 10k row is mirrored back into profiles.pr_10k so the
-- leaderboard and the runner's own card keep working untouched.
create table if not exists public.personal_records (
  student_id  uuid not null references public.profiles(id) on delete cascade,
  distance_m  int  not null,
  time_text   text not null,
  achieved_on date,
  updated_at  timestamptz not null default now(),
  primary key (student_id, distance_m)
);

-- Carry across whatever is already on the profiles.
insert into public.personal_records (student_id, distance_m, time_text)
select id, 10000, pr_10k from public.profiles
 where pr_10k is not null and pr_10k <> ''
on conflict (student_id, distance_m) do nothing;

-- ---------- the events ----------
-- `distances` is what the event offers; each entry still carries its own, so
-- one runner may do 5k on a day the rest run 21k.
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  event_date  date not null,
  start_time  text,
  place       text,
  distances   int[] not null default '{5000,10000}',
  status      text not null default 'open' check (status in ('open','done')),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.event_entries (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  distance_m  int  not null,
  -- The record they held when they named a target. Snapshotted, because an
  -- improvement computed against a live record silently rewrites itself the
  -- moment that record changes.
  prior_time  text,
  target_time text,
  result_time text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, student_id)
);

create index if not exists events_date_idx on public.events(event_date desc);
create index if not exists event_entries_event_idx on public.event_entries(event_id);

-- "mm:ss" or "h:mm:ss" to seconds; anything else is null and sorts last.
create or replace function public._secs(t text)
returns int language sql immutable as $$
  select case
    when t is null or btrim(t) = '' then null
    when btrim(t) ~ '^[0-9]{1,3}:[0-9]{1,2}$'
      then split_part(btrim(t), ':', 1)::int * 60 + split_part(btrim(t), ':', 2)::int
    when btrim(t) ~ '^[0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}$'
      then split_part(btrim(t), ':', 1)::int * 3600
         + split_part(btrim(t), ':', 2)::int * 60
         + split_part(btrim(t), ':', 3)::int
    else null
  end;
$$;

alter table public.personal_records enable row level security;
alter table public.events           enable row level security;
alter table public.event_entries    enable row level security;

drop policy if exists "records: own read"     on public.personal_records;
drop policy if exists "records: coach read"   on public.personal_records;
create policy "records: own read"
  on public.personal_records for select
  using (student_id = auth.uid() or public.is_coach());

drop policy if exists "events: member read" on public.events;
drop policy if exists "events: coach write" on public.events;
create policy "events: member read"
  on public.events for select using (public._is_member());
create policy "events: coach write"
  on public.events for all
  using (public.is_coach())
  with check (public.is_coach());

-- Everyone in the club sees everyone's entries: that is the ceremony.
drop policy if exists "entries: member read" on public.event_entries;
create policy "entries: member read"
  on public.event_entries for select using (public._is_member());

grant select on public.events to authenticated;
grant insert, update, delete on public.events to authenticated;
grant select on public.event_entries   to authenticated;
grant select on public.personal_records to authenticated;

-- ---------- writes go through functions, so the rules live in one place ----------

-- Name a distance and a target. Allowed until the day of the event: after
-- that a "target" chosen with the result in hand is not a target.
create or replace function public.set_event_entry(
  p_event uuid, p_distance int, p_target text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_date date;
  v_prior text;
begin
  if not public._is_member() then
    raise exception 'not a member';
  end if;

  select event_date into v_date from public.events where id = p_event;
  if v_date is null then raise exception 'no such event'; end if;
  if current_date > v_date then raise exception 'targets are closed'; end if;
  if public._secs(p_target) is null and p_target is not null and btrim(p_target) <> '' then
    raise exception 'bad time';
  end if;

  select time_text into v_prior
    from public.personal_records
   where student_id = auth.uid() and distance_m = p_distance;

  insert into public.event_entries (event_id, student_id, distance_m, prior_time, target_time)
  values (p_event, auth.uid(), p_distance, v_prior, nullif(btrim(p_target), ''))
  on conflict (event_id, student_id) do update
    set distance_m  = excluded.distance_m,
        -- Changing distance changes which record they are chasing.
        prior_time  = case when public.event_entries.distance_m = excluded.distance_m
                           then public.event_entries.prior_time else excluded.prior_time end,
        target_time = excluded.target_time,
        updated_at  = now();
end;
$$;

-- Record what you actually ran. Your own row; the coach may fix anyone's.
create or replace function public.set_event_result(
  p_event uuid, p_student uuid, p_result text, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_entry public.event_entries;
  v_date  date;
  v_best  int;
  v_new   int;
begin
  if p_student <> auth.uid() and not public.is_coach() then
    raise exception 'not yours';
  end if;
  if not public._is_member() then raise exception 'not a member'; end if;

  select * into v_entry from public.event_entries
   where event_id = p_event and student_id = p_student;
  if v_entry.id is null then raise exception 'no entry — pick a distance first'; end if;

  v_new := public._secs(p_result);
  if p_result is not null and btrim(p_result) <> '' and v_new is null then
    raise exception 'bad time';
  end if;

  update public.event_entries
     set result_time = nullif(btrim(p_result), ''),
         note        = coalesce(p_note, note),
         updated_at  = now()
   where id = v_entry.id;

  if v_new is null then return; end if;

  select event_date into v_date from public.events where id = p_event;

  -- A faster time becomes the record for that distance, and the 10k mirrors
  -- back to profiles so the leaderboard needs to know nothing about events.
  select public._secs(time_text) into v_best
    from public.personal_records
   where student_id = p_student and distance_m = v_entry.distance_m;

  if v_best is null or v_new < v_best then
    insert into public.personal_records (student_id, distance_m, time_text, achieved_on)
    values (p_student, v_entry.distance_m, btrim(p_result), v_date)
    on conflict (student_id, distance_m) do update
      set time_text = excluded.time_text,
          achieved_on = excluded.achieved_on,
          updated_at = now();

    if v_entry.distance_m = 10000 then
      update public.profiles set pr_10k = btrim(p_result) where id = p_student;
    end if;
  end if;
end;
$$;

-- The board for one event: names and pictures and nothing else from profiles.
drop function if exists public.event_board(uuid);
create or replace function public.event_board(p_event uuid)
returns table (
  student_id    uuid,
  full_name     text,
  avatar_path   text,
  distance_m    int,
  prior_time    text,
  target_time   text,
  result_time   text,
  note          text,
  improvement_s int,
  hit_target    boolean,
  is_pr         boolean
)
language sql stable security definer set search_path = public as $$
  select e.student_id, p.full_name, p.avatar_path, e.distance_m,
         e.prior_time, e.target_time, e.result_time, e.note,
         case when public._secs(e.result_time) is not null
               and public._secs(e.prior_time)  is not null
              then public._secs(e.prior_time) - public._secs(e.result_time) end,
         case when public._secs(e.result_time) is not null
               and public._secs(e.target_time) is not null
              then public._secs(e.result_time) <= public._secs(e.target_time) end,
         case when public._secs(e.result_time) is not null
              then public._secs(e.prior_time) is null
                or public._secs(e.result_time) < public._secs(e.prior_time) end
    from public.event_entries e
    join public.profiles p on p.id = e.student_id
   where e.event_id = p_event
     and public._is_member()
   order by e.distance_m,
            (case when public._secs(e.result_time) is not null
                   and public._secs(e.prior_time)  is not null
                  then public._secs(e.prior_time) - public._secs(e.result_time) end) desc nulls last,
            public._secs(e.result_time) asc nulls last,
            p.full_name;
$$;

-- Your own records, for the entry form.
drop function if exists public.my_records();
create or replace function public.my_records()
returns table (distance_m int, time_text text, achieved_on date)
language sql stable security definer set search_path = public as $$
  select distance_m, time_text, achieved_on
    from public.personal_records
   where student_id = auth.uid()
   order by distance_m;
$$;

revoke execute on function public.set_event_entry(uuid, int, text)          from public, anon;
revoke execute on function public.set_event_result(uuid, uuid, text, text)  from public, anon;
revoke execute on function public.event_board(uuid)                         from public, anon;
revoke execute on function public.my_records()                              from public, anon;
grant  execute on function public.set_event_entry(uuid, int, text)          to authenticated;
grant  execute on function public.set_event_result(uuid, uuid, text, text)  to authenticated;
grant  execute on function public.event_board(uuid)                         to authenticated;
grant  execute on function public.my_records()                              to authenticated;
