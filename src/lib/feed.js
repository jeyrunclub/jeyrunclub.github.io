// The club feed: Salar posts, everyone reads, likes and comments.
//
// Reads go through security-definer functions because a student may only
// select their own profiles row, and a feed without the poster's name is not a
// feed. Writes are plain table calls — RLS decides who may post (the coach),
// who may comment (any member, as themselves) and who may delete (the author,
// or the coach).

export async function fetchFeed(supabase, limit = 20) {
  const { data, error } = await supabase.rpc('announcement_feed', { limit_n: limit });
  if (error) { console.error(error); return { posts: [], error }; }
  return { posts: data || [], error: null };
}

export async function fetchThread(supabase, postId) {
  const { data, error } = await supabase.rpc('announcement_thread', { post: postId });
  if (error) { console.error(error); return { comments: [], error }; }
  return { comments: data || [], error: null };
}

export async function createPost(supabase, authorId, body) {
  return await supabase.from('announcements')
    .insert({ author_id: authorId, body: body.trim() })
    .select().single();
}

export async function editPost(supabase, id, body) {
  return await supabase.from('announcements')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
}

export async function deletePost(supabase, id) {
  return await supabase.from('announcements').delete().eq('id', id);
}

export async function addComment(supabase, postId, authorId, body) {
  return await supabase.from('announcement_comments')
    .insert({ announcement_id: postId, author_id: authorId, body: body.trim() })
    .select().single();
}

export async function deleteComment(supabase, id) {
  return await supabase.from('announcement_comments').delete().eq('id', id);
}

// A like is a row keyed by (post, user), so liking twice is the same as liking
// once and there is no counter to drift.
export async function setLike(supabase, postId, userId, on) {
  if (on) {
    return await supabase.from('announcement_likes')
      .upsert({ announcement_id: postId, user_id: userId },
              { onConflict: 'announcement_id,user_id' });
  }
  return await supabase.from('announcement_likes')
    .delete().eq('announcement_id', postId).eq('user_id', userId);
}

// ---------- When ----------

// «چند لحظه پیش» / «۳ ساعت پیش» / «۲ روز پیش», then a plain date. A feed is
// read in the present tense; an absolute timestamp makes the reader do
// arithmetic to work out whether something still matters.
export function faSince(iso) {
  const then = new Date(iso);
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  const fa = (n) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  if (mins < 2) return 'چند لحظه پیش';
  if (mins < 60) return `${fa(mins)} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${fa(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${fa(days)} روز پیش`;
  return then.toLocaleDateString('fa-IR', { day: 'numeric', month: 'long' });
}

// What the reader has already seen, per device. A badge on a new post is worth
// having; a read receipt synced across devices is not worth a table.
const SEEN_KEY = 'jeyrun.feed_seen';

export function lastSeen() {
  try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; }
}

export function markSeen(iso) {
  try { if (iso) localStorage.setItem(SEEN_KEY, iso); } catch {}
}
