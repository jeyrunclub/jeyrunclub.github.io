-- Jeyrun — richer notifications: who wrote it, what it said, and the picture.
-- Run once in the Supabase SQL editor. Idempotent.

alter table public.notifications add column if not exists image_path text;

-- Same fan-out as before, plus a picture to carry.
create or replace function public._notify_members(
  p_kind text, p_title text, p_body text, p_href text, p_actor uuid,
  p_image text default null
) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, href, actor_id, image_path)
  select p.id, p_kind, p_title, left(coalesce(p_body, ''), 140), p_href, p_actor, p_image
    from public.profiles p
   where p.status = 'approved'
     and (p_actor is null or p.id <> p_actor);
$$;

-- The poster's name is the title and the post itself is the body — the way a
-- message from a person reads. A post that is only a photo says so, rather
-- than arriving as a title with nothing under it.
create or replace function public._on_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select full_name into v_name from public.profiles where id = new.author_id;

  perform public._notify_members(
    'announcement',
    coalesce(nullif(btrim(v_name), ''), 'جیران'),
    case when btrim(coalesce(new.body, '')) <> '' then new.body
         when new.photo_path is not null then 'یک عکس فرستاد'
         else 'اطلاعیه‌ی تازه' end,
    '/app/news',
    new.author_id,
    new.photo_path);
  return new;
end;
$$;

-- Carry the picture through to the sender.
create or replace function public._on_notification_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v public.push_config;
begin
  select * into v from public.push_config where id = 1;
  if v.url is null then return new; end if;

  perform net.http_post(
    url     := v.url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-push-secret', coalesce(v.secret, '')),
    body    := jsonb_build_object(
                 'user_id',    new.user_id,
                 'title',      new.title,
                 'body',       coalesce(new.body, ''),
                 'href',       coalesce(new.href, '/app'),
                 'image_path', new.image_path)
  );
  return new;
end;
$$;
