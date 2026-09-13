-- Jeyrun — let members clear their own notifications, and name the coach on a
-- plan the way every other notification names who caused it.
-- Run once in the Supabase SQL editor. Idempotent.

drop policy if exists "notifications: own delete" on public.notifications;
create policy "notifications: own delete"
  on public.notifications for delete
  using (user_id = auth.uid());

grant delete on public.notifications to authenticated;

-- The list leads with the body now, so the body has to carry the news and the
-- title is just who it came from.
create or replace function public._on_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
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

  select full_name into v_name from public.profiles where id = new.updated_by;

  insert into public.notifications (user_id, kind, title, body, href, actor_id)
  values (new.student_id, 'plan',
          coalesce(nullif(btrim(v_name), ''), 'مربی'),
          'برنامه‌ی هفته‌ات نوشته شد.',
          '/app', new.updated_by);
  return new;
end;
$$;
