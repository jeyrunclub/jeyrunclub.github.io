-- Jeyrun — the club feed. Run once in the Supabase SQL editor.
-- Idempotent, and already included in schema.sql; this file is just the new
-- section on its own so the whole schema does not have to be re-run.

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
