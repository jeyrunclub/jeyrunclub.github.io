-- Jeyrun — who liked an announcement. Run once in the Supabase SQL editor.
--
-- A member cannot read anyone else's profiles row, so the names and pictures
-- come back through a definer function that returns those two things and
-- nothing else — the same shape as the leaderboard and the event board.

drop function if exists public.announcement_likers(uuid);
create or replace function public.announcement_likers(p_post uuid)
returns table (id uuid, full_name text, avatar_path text, liked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_path, l.created_at
    from public.announcement_likes l
    join public.profiles p on p.id = l.user_id
   where l.announcement_id = p_post
     and public._is_member()
   order by l.created_at desc;
$$;

revoke execute on function public.announcement_likers(uuid) from public, anon;
grant  execute on function public.announcement_likers(uuid) to authenticated;
