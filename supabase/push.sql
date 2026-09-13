-- Jeyrun — Web Push subscriptions. Run once in the Supabase SQL editor.
--
-- One row per device per member. The endpoint is the push service's URL for
-- that device; p256dh and auth are the keys it gave us to encrypt with. None
-- of it is a secret that lets anyone read anything — it only lets whoever
-- holds it send that device a message, which is why it still lives behind RLS.

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);

create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push: own all" on public.push_subscriptions;
create policy "push: own all"
  on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ---------- hand each new notification to the sender ----------
-- pg_net posts it and does not wait, so a slow push service cannot hold up
-- the insert that caused it.
create extension if not exists pg_net with schema extensions;

-- Where to send and what to prove. Set once, by you:
--   select public.set_push_config('https://<ref>.functions.supabase.co/push', '<shared secret>');
create table if not exists public.push_config (
  id     int primary key default 1 check (id = 1),
  url    text,
  secret text
);
alter table public.push_config enable row level security;  -- no policy: nobody reads it but definers

create or replace function public.set_push_config(p_url text, p_secret text)
returns void language sql security definer set search_path = public as $$
  insert into public.push_config (id, url, secret) values (1, p_url, p_secret)
  on conflict (id) do update set url = excluded.url, secret = excluded.secret;
$$;
revoke execute on function public.set_push_config(text, text) from public, anon, authenticated;

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
                 'user_id', new.user_id,
                 'title',   new.title,
                 'body',    coalesce(new.body, ''),
                 'href',    coalesce(new.href, '/app'))
  );
  return new;
end;
$$;

drop trigger if exists push_notification on public.notifications;
create trigger push_notification after insert on public.notifications
  for each row execute function public._on_notification_push();
