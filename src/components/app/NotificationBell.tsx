// The bell.
//
// The app has no way to reach anyone who is not looking at it — no push, and
// in Iran the services that would deliver it may not even be reachable. So
// this is the next best thing: when somebody does open the app, everything
// that happened since they last looked is in one place, with a count on it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, BellRing, X } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { faNum } from '../../lib/plan.js';
import { faSince, signedFeedUrls } from '../../lib/feed.js';
import {
  fetchNotifications, unreadCount, markAllRead, watchNotifications,
} from '../../lib/notifications.js';
import {
  pushSupported, currentSubscription, enablePush, disablePush, isIOS, isInstalled,
} from '../../lib/push.js';
import { cn } from '../../lib/utils';

type Note = {
  id: string; kind: string; title: string; body: string | null;
  href: string | null; image_path: string | null;
  read_at: string | null; created_at: string;
};

export function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushErr, setPushErr] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const panel = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    setCount(await unreadCount(supabase));
  }, []);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  useEffect(() => {
    if (!pushSupported()) { setPushOn(false); return; }
    currentSubscription().then((s) => setPushOn(!!s));
  }, []);

  async function togglePush() {
    setPushBusy(true);
    setPushErr(null);
    if (pushOn) {
      await disablePush(supabase);
      setPushOn(false);
    } else {
      const { error } = await enablePush(supabase, userId);
      if (error) setPushErr(error); else setPushOn(true);
    }
    setPushBusy(false);
  }

  // Live: a new row bumps the count without a reload.
  useEffect(() => {
    if (!userId) return;
    return watchNotifications(supabase, userId, (row: Note) => {
      setCount((c) => c + 1);
      setNotes((prev) => (prev ? [row, ...prev] : prev));
    });
  }, [userId]);

  // Close on a click outside or Escape — it is a menu, not a page.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    const rows = await fetchNotifications(supabase) as Note[];
    setNotes(rows);
    const paths = rows.map((r) => r.image_path).filter(Boolean) as string[];
    if (paths.length) setThumbs(await signedFeedUrls(supabase, paths));
    if (count > 0) {
      await markAllRead(supabase, userId);
      setCount(0);
    }
  }

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={toggle}
        aria-label={count > 0 ? `${count} اعلان خوانده‌نشده` : 'اعلان‌ها'}
        aria-expanded={open}
        className="relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Bell className="size-4" />
        {count > 0 && (
          <span className="figures absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.55rem] font-bold leading-4 text-primary-foreground ring-2 ring-background">
            {faNum(count > 9 ? '۹+' : count)}
          </span>
        )}
      </button>

      {open && (
        <div className="nib absolute end-0 top-11 z-40 max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto border border-border bg-card shadow-xl">
          <div className="sticky top-0 border-b border-border bg-card px-4 py-2.5">
            <div className="flex items-center gap-2">
              <b className="text-sm">اعلان‌ها</b>
              <button
                type="button" onClick={() => setOpen(false)} aria-label="بستن"
                className="ms-auto text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Notifications that arrive with the app shut. On iOS this only
                works once the app is on the Home Screen, so say so rather than
                fail silently. */}
            {pushSupported() && (
              <button
                type="button"
                onClick={togglePush}
                disabled={pushBusy}
                className={cn(
                  'nib-sm mt-2 flex w-full items-center gap-2 border px-3 py-2 text-start text-xs transition-colors',
                  pushOn
                    ? 'border-easy/40 bg-easy/10 text-easy'
                    : 'border-border hover:bg-secondary',
                )}
              >
                {pushOn ? <BellRing className="size-4 shrink-0" /> : <BellOff className="size-4 shrink-0" />}
                <span className="flex-1 font-bold">
                  {pushOn ? 'اعلان روی این دستگاه روشن است' : 'اعلان روی این دستگاه'}
                </span>
                <span className="text-[0.65rem] text-muted-foreground">
                  {pushBusy ? '…' : pushOn ? 'خاموش کن' : 'روشن کن'}
                </span>
              </button>
            )}
            {pushErr && <p className="mt-1.5 text-[0.68rem] text-destructive">{pushErr}</p>}
            {!pushOn && pushSupported() && isIOS() && !isInstalled() && (
              <p className="mt-1.5 text-[0.68rem] text-muted-foreground">
                روی آیفون اول اپ را به صفحه‌ی اصلی اضافه کن.
              </p>
            )}
          </div>

          {!notes ? (
            <div className="h-20 animate-pulse bg-muted" />
          ) : !notes.length ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              هنوز خبری نیست.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {notes.map((n) => {
                const inner = (
                  <>
                    <div className="flex items-start gap-2">
                      <b className="text-[0.8rem]">{n.title}</b>
                      <span className="ms-auto shrink-0 text-[0.65rem] text-muted-foreground">
                        {faSince(n.created_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-start gap-2">
                      {n.image_path && thumbs[n.image_path] && (
                        <img
                          src={thumbs[n.image_path]}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="nib-sm size-10 shrink-0 border border-border object-cover"
                        />
                      )}
                      {n.body && (
                        <p dir="auto" className="line-clamp-2 flex-1 text-right text-xs text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                    </div>
                  </>
                );
                const cls = cn(
                  'block px-4 py-3 transition-colors',
                  n.read_at ? 'hover:bg-secondary/60' : 'bg-accent/40 hover:bg-accent/60',
                );
                return n.href
                  ? <a key={n.id} href={n.href} data-astro-prefetch="tap" className={cls}>{inner}</a>
                  : <div key={n.id} className={cls}>{inner}</div>;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
