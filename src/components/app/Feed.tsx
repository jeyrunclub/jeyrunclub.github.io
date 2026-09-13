// The club feed.
//
// One post from Salar, and the club can answer it. This is the part of a
// WhatsApp group worth rebuilding: an announcement that stays put, with the
// replies attached to it, instead of scrolling away under today's chatter.
// What is deliberately NOT here is a chat — no typing indicators, no read
// receipts, and no push notifications, so nothing about it pretends to be
// somewhere you wait for an answer.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Heart, MessageCircle, Loader2, Trash2, Pencil, Send, Megaphone, X, Camera,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import {
  fetchFeed, fetchThread, createPost, editPost, deletePost,
  addComment, deleteComment, setLike, faSince, lastSeen, markSeen,
  uploadFeedPhoto, removeFeedPhoto, signedFeedUrls,
} from '../../lib/feed.js';
import { Avatar } from './Avatar';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { cn } from '../../lib/utils';

type Post = {
  id: string; body: string; photo_path: string | null;
  created_at: string; updated_at: string;
  author_id: string; author_name: string | null; author_avatar: string | null;
  like_count: number; comment_count: number; liked_by_me: boolean;
};
type Comment = {
  id: string; body: string; created_at: string;
  author_id: string; author_name: string | null; author_avatar: string | null;
};

const SHOW_AT_FIRST = 3;
const MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit

function Lines({ text }: { text: string }) {
  return (
    <>
      {text.replace(/\r\n/g, '\n').split('\n').map((line, i) =>
        line.trim()
          ? <p key={i} dir="auto" className="text-[0.95rem] leading-7">{line.trim()}</p>
          : <div key={i} className="h-2" />,
      )}
    </>
  );
}

export function Feed({ me, isCoach, page }: {
  me: { id: string; full_name: string | null; avatar_path: string | null };
  isCoach?: boolean;
  /** On its own page: no section heading, and nothing collapsed. */
  page?: boolean;
}) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, Comment[]>>({});
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [seen] = useState(() => lastSeen());
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; url: string } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { posts: rows } = await fetchFeed(supabase, 20);
    setPosts(rows as Post[]);
    if (rows.length) markSeen(rows[0].created_at);
  }, []);

  useEffect(() => { load(); }, [load]);

  // The bucket is private, so every render needs fresh URLs — but one request
  // for the whole feed, not one per post.
  useEffect(() => {
    let alive = true;
    const paths = (posts || []).map((p) => p.photo_path).filter(Boolean) as string[];
    if (!paths.length) return;
    signedFeedUrls(supabase, paths).then((m) => { if (alive) setPhotoUrls(m); });
    return () => { alive = false; };
  }, [posts]);

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('عکس باید کمتر از ۱۰ مگابایت باشد.'); return; }
    setError(null);
    setPendingPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file, url: URL.createObjectURL(file) };
    });
  }

  function dropPending() {
    setPendingPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  async function openThread(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!threads[id]) {
      const { comments } = await fetchThread(supabase, id);
      setThreads((t) => ({ ...t, [id]: comments as Comment[] }));
    }
  }

  async function post() {
    if (!draft.trim() && !pendingPhoto) return;
    setBusy(true); setError(null);

    let path: string | null = null;
    if (pendingPhoto) {
      const up = await uploadFeedPhoto(supabase, me.id, pendingPhoto.file);
      if (up.error || !up.path) { setBusy(false); setError('آپلود عکس نشد.'); return; }
      path = up.path;
    }

    const { error: err } = await createPost(supabase, me.id, draft, path);
    setBusy(false);
    if (err) {
      // Don't leave the file behind when the row it belonged to never landed.
      if (path) await removeFeedPhoto(supabase, path);
      setError('ارسال نشد. دوباره تلاش کن.');
      return;
    }
    setDraft('');
    dropPending();
    await load();
  }

  async function saveEdit(id: string) {
    setBusy(true);
    const { error: err } = await editPost(supabase, id, editDraft);
    setBusy(false);
    if (err) { setError('ذخیره نشد.'); return; }
    setEditing(null);
    await load();
  }

  async function removePost(id: string) {
    if (!window.confirm('این اطلاعیه حذف شود؟')) return;
    const photo = (posts || []).find((p) => p.id === id)?.photo_path || null;
    const { error: err } = await deletePost(supabase, id);
    if (err) { setError('حذف نشد.'); return; }
    if (photo) await removeFeedPhoto(supabase, photo);
    await load();
  }

  // Editing only ever drops the picture — replacing one is a new post's job.
  async function dropPhoto(p: Post) {
    if (!p.photo_path) return;
    const { error: err } = await editPost(supabase, p.id, p.body, null);
    if (err) { setError('حذف عکس نشد.'); return; }
    await removeFeedPhoto(supabase, p.photo_path);
    await load();
  }

  // The count moves before the network does: a like that waits on a round trip
  // feels broken, and the worst case is a number that corrects itself.
  async function toggleLike(p: Post) {
    const on = !p.liked_by_me;
    setPosts((rows) => (rows || []).map((r) => r.id === p.id
      ? { ...r, liked_by_me: on, like_count: Number(r.like_count) + (on ? 1 : -1) }
      : r));
    const { error: err } = await setLike(supabase, p.id, me.id, on);
    if (err) await load();
  }

  async function sendReply(id: string) {
    const body = (replies[id] || '').trim();
    if (!body) return;
    setBusy(true);
    const { data, error: err } = await addComment(supabase, id, me.id, body);
    setBusy(false);
    if (err) { setError('ارسال نشد.'); return; }
    setReplies((r) => ({ ...r, [id]: '' }));
    setThreads((t) => ({
      ...t,
      [id]: [...(t[id] || []), {
        id: data.id, body: data.body, created_at: data.created_at,
        author_id: me.id, author_name: me.full_name, author_avatar: me.avatar_path,
      }],
    }));
    setPosts((rows) => (rows || []).map((r) =>
      r.id === id ? { ...r, comment_count: Number(r.comment_count) + 1 } : r));
  }

  async function removeComment(postId: string, id: string) {
    const { error: err } = await deleteComment(supabase, id);
    if (err) { setError('حذف نشد.'); return; }
    setThreads((t) => ({ ...t, [postId]: (t[postId] || []).filter((c) => c.id !== id) }));
    setPosts((rows) => (rows || []).map((r) =>
      r.id === postId ? { ...r, comment_count: Math.max(0, Number(r.comment_count) - 1) } : r));
  }

  if (!posts) return <div className="h-24 animate-pulse rounded-2xl bg-muted" />;
  if (!posts.length && !isCoach && !page) return null;

  const shown = page || expanded ? posts : posts.slice(0, SHOW_AT_FIRST);

  return (
    <section className="flex flex-col gap-3">
      {!page && (
        <div className="flex items-center gap-2 px-1">
          <Megaphone className="size-4 text-primary" />
          <h2 className="display text-xl">اطلاعیه‌ها</h2>
        </div>
      )}

      {isCoach && (
        <Card className="p-4">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            dir="auto"
            placeholder="خبری برای باشگاه بنویس…"
            className="field-sizing-content min-h-16 text-sm leading-7"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { choosePhoto(e.target.files?.[0]); e.target.value = ''; }}
          />

          {pendingPhoto && (
            <div className="nib-sm relative mt-3 overflow-hidden border border-border">
              <img src={pendingPhoto.url} alt="" className="max-h-64 w-full object-cover" />
              <button
                type="button"
                onClick={dropPending}
                aria-label="حذف عکس"
                className="absolute end-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Camera className="size-4" />
              {pendingPhoto ? 'تعویض عکس' : 'عکس'}
            </Button>
            <Button
              size="sm"
              onClick={post}
              disabled={busy || (!draft.trim() && !pendingPhoto)}
              className="ms-auto"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              انتشار
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <p className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {!posts.length ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          هنوز اطلاعیه‌ای نیست.
        </Card>
      ) : shown.map((p) => {
        const isNew = !!seen && p.created_at > seen;
        const open = openId === p.id;
        const thread = threads[p.id];
        return (
          <Card key={p.id} className="overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-2.5">
                <Avatar name={p.author_name} path={p.author_avatar} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold">{p.author_name || 'مربی'}</span>
                    {isNew && (
                      <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[0.6rem] font-bold text-primary-foreground">
                        جدید
                      </span>
                    )}
                  </div>
                  <div className="text-[0.7rem] text-muted-foreground">
                    {faSince(p.created_at)}
                    {p.updated_at > p.created_at && ' · ویرایش شده'}
                  </div>
                </div>
                {isCoach && p.author_id === me.id && editing !== p.id && (
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => { setEditing(p.id); setEditDraft(p.body); }}
                      aria-label="ویرایش"
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePost(p.id)}
                      aria-label="حذف"
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {editing === p.id ? (
                <div className="mt-3">
                  <Textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                    dir="auto"
                    className="field-sizing-content min-h-20 text-sm leading-7"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                      <X className="size-4" />
                      انصراف
                    </Button>
                    <Button size="sm" onClick={() => saveEdit(p.id)} disabled={busy || !editDraft.trim()}>
                      ذخیره
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  {p.body.trim() && <Lines text={p.body} />}
                  {p.photo_path && (
                    <div className={cn('relative', p.body.trim() && 'mt-3')}>
                      {photoUrls[p.photo_path] ? (
                        <button
                          type="button"
                          onClick={() => setLightbox(photoUrls[p.photo_path!])}
                          className="nib-sm block w-full overflow-hidden border border-border"
                        >
                          <img
                            src={photoUrls[p.photo_path]}
                            alt=""
                            className="max-h-96 w-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="nib-sm h-48 w-full animate-pulse bg-muted" />
                      )}
                      {isCoach && p.author_id === me.id && (
                        <button
                          type="button"
                          onClick={() => dropPhoto(p)}
                          aria-label="حذف عکس"
                          className="absolute end-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleLike(p)}
                  aria-pressed={p.liked_by_me}
                  className={cn(
                    'nib-pill inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-colors',
                    p.liked_by_me
                      ? 'bg-accent text-primary'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <Heart className={cn('size-4', p.liked_by_me && 'fill-current')} />
                  {Number(p.like_count) > 0 && faNum(Number(p.like_count))}
                </button>
                <button
                  type="button"
                  onClick={() => openThread(p.id)}
                  className={cn(
                    'nib-pill inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-colors',
                    open ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <MessageCircle className="size-4" />
                  {Number(p.comment_count) > 0 ? faNum(Number(p.comment_count)) : 'نظر'}
                </button>
              </div>
            </div>

            {open && (
              <div className="border-t border-border bg-secondary/30 px-5 py-4">
                {!thread ? (
                  <div className="h-10 animate-pulse rounded-xl bg-muted" />
                ) : (
                  <div className="flex flex-col gap-3">
                    {thread.map((c) => (
                      <div key={c.id} className="flex items-start gap-2.5">
                        <Avatar name={c.author_name} path={c.author_avatar} size={28} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-bold">{c.author_name || '—'}</span>
                            <span className="shrink-0 text-[0.65rem] text-muted-foreground">
                              {faSince(c.created_at)}
                            </span>
                            {(c.author_id === me.id || isCoach) && (
                              <button
                                type="button"
                                onClick={() => removeComment(p.id, c.id)}
                                aria-label="حذف نظر"
                                className="ms-auto shrink-0 rounded-full p-1 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            )}
                          </div>
                          <p dir="auto" className="mt-0.5 text-sm leading-6">{c.body}</p>
                        </div>
                      </div>
                    ))}
                    {!thread.length && (
                      <p className="text-xs text-muted-foreground">اولین نظر را تو بنویس.</p>
                    )}
                  </div>
                )}

                <div className="mt-3 flex items-end gap-2">
                  <Textarea
                    value={replies[p.id] || ''}
                    onChange={(e) => setReplies((r) => ({ ...r, [p.id]: e.target.value }))}
                    rows={1}
                    dir="auto"
                    placeholder="نظرت را بنویس…"
                    className="field-sizing-content min-h-10 flex-1 text-sm leading-6"
                  />
                  <Button
                    size="icon"
                    onClick={() => sendReply(p.id)}
                    disabled={busy || !(replies[p.id] || '').trim()}
                    aria-label="ارسال نظر"
                    className="size-10 shrink-0"
                  >
                    <Send className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-5"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label="بستن"
            className="absolute end-5 top-5 rounded-full bg-white/15 p-2 text-white"
          >
            <X className="size-5" />
          </button>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-2xl object-contain" />
        </div>
      )}

      {!page && posts.length > SHOW_AT_FIRST && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mx-auto text-xs font-bold text-primary hover:underline"
        >
          {expanded ? 'بستن' : `نمایش همه (${faNum(posts.length)})`}
        </button>
      )}
    </section>
  );
}

function faNum(n: number) {
  return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}
