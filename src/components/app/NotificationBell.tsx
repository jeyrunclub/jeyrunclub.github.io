// The bell.
//
// The app has no way to reach anyone who is not looking at it — no push, and
// in Iran the services that would deliver it may not even be reachable. So
// this is the next best thing: when somebody does open the app, everything
// that happened since they last looked is in one place, with a count on it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { faNum } from '../../lib/plan.js';
import { faSince } from '../../lib/feed.js';
import {
  fetchNotifications, unreadCount, markAllRead, watchNotifications,
} from '../../lib/notifications.js';
import { cn } from '../../lib/utils';

type Note = {
  id: string; kind: string; title: string; body: string | null;
  href: string | null; read_at: string | null; created_at: string;
};

export function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    setCount(await unreadCount(supabase));
  }, []);

  useEffect(() => { refreshCount(); }, [refreshCount]);

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
    setNotes(await fetchNotifications(supabase) as Note[]);
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
          <div className="sticky top-0 flex items-center gap-2 border-b border-border bg-card px-4 py-2.5">
            <b className="text-sm">اعلان‌ها</b>
            <button
              type="button" onClick={() => setOpen(false)} aria-label="بستن"
              className="ms-auto text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
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
                    {n.body && (
                      <p dir="auto" className="mt-0.5 line-clamp-2 text-right text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    )}
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
