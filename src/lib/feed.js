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

// Who liked one post. Fetched when somebody asks rather than for every post
// in the feed — thirty posts would otherwise be thirty queries nobody reads.
export async function fetchLikers(supabase, postId) {
  const { data, error } = await supabase.rpc('announcement_likers', { p_post: postId });
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function createPost(supabase, authorId, body, photoPath = null) {
  return await supabase.from('announcements')
    .insert({ author_id: authorId, body: body.trim(), photo_path: photoPath })
    .select().single();
}

export async function editPost(supabase, id, body, photoPath) {
  const patch = { body: body.trim(), updated_at: new Date().toISOString() };
  if (photoPath !== undefined) patch.photo_path = photoPath;
  return await supabase.from('announcements')
    .update(patch).eq('id', id).select().single();
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

// ---------- Photos ----------
//
// Private bucket, like session photos. A feed of twenty posts signs all its
// URLs in one call, so the round-trip-per-row problem that made the avatars
// bucket public does not arise here.

export const FEED_BUCKET = 'feed-photos';

export async function uploadFeedPhoto(supabase, userId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(FEED_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) return { path: null, error };
  return { path, error: null };
}

export async function removeFeedPhoto(supabase, path) {
  if (!path) return;
  await supabase.storage.from(FEED_BUCKET).remove([path]);
}

// { path: url } for every path given, in one request.
export async function signedFeedUrls(supabase, paths, seconds = 3600) {
  const wanted = [...new Set((paths || []).filter(Boolean))];
  if (!wanted.length) return {};
  const { data, error } = await supabase.storage.from(FEED_BUCKET)
    .createSignedUrls(wanted, seconds);
  if (error) { console.error(error); return {}; }
  return Object.fromEntries((data || [])
    .filter((d) => d.signedUrl)
    .map((d) => [d.path, d.signedUrl]));
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
