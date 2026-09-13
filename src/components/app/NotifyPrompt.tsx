// Asking for notifications at the one moment it makes sense.
//
// Installing the app and turning on notifications were two separate acts with
// nothing joining them: the install sheet vanished on success and the only way
// to the toggle was to find it inside the bell. So somebody would install the
// app precisely because they wanted to hear about things, and then hear
// nothing.
//
// Deliberately not asked on first load. A permission prompt with no context is
// denied, and a denial is close to permanent — the browser stops asking and
// the member has to go into site settings to undo it. This waits until the app
// is on the home screen, which is itself the signal that they want it.

import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { pushSupported, isInstalled, enablePush } from '../../lib/push.js';

const DISMISS_KEY = 'jeyrun.notify_dismissed_at';
const AGAIN_AFTER = 14 * 24 * 60 * 60 * 1000;   // a fortnight

export function NotifyPrompt() {
  const [visible, setVisible] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSupported()) return;
    if (Notification.permission !== 'default') return;   // already answered

    let dismissed = 0;
    try { dismissed = Number(localStorage.getItem(DISMISS_KEY)) || 0; } catch {}
    if (dismissed && Date.now() - dismissed < AGAIN_AFTER) return;

    let timer: number | undefined;
    const show = (delay: number) => {
      timer = window.setTimeout(async () => {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;               // only members
        setUid(data.session.user.id);
        setVisible(true);
      }, delay);
    };

    // Already on the home screen: ask once things have settled.
    if (isInstalled()) show(4000);

    // Or the moment they install.
    const onInstalled = () => show(2500);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('appinstalled', onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  function later() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }

  async function turnOn() {
    if (!uid) return;
    setBusy(true);
    setError(null);
    const { error: err } = await enablePush(supabase, uid);
    setBusy(false);
    if (err) { setError(err); return; }
    // Whatever they answered, do not ask again from here.
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="روشن کردن اعلان‌ها"
    >
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={later} aria-hidden />

      <div
        className="nib rise relative m-3 w-full max-w-sm border border-border bg-card p-5 shadow-2xl"
        style={{ marginBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={later}
          aria-label="بستن"
          className="absolute end-3 top-3 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
        >
          <X className="size-4" />
        </button>

        <div className="nib-sm flex size-14 items-center justify-center bg-primary text-white shadow-sm shadow-brand-600/30">
          <BellRing className="size-6" />
        </div>

        <h2 className="display mt-3 text-2xl">خبردار شو</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          وقتی سالار برنامه‌ی هفته‌ات را می‌نویسد، اطلاعیه‌ای می‌گذارد یا روز رکوردگیری
          را اعلام می‌کند، گوشی‌ات خبرت می‌کند — حتی وقتی اپ بسته است.
        </p>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={turnOn}
            disabled={busy}
            className="nib-pill flex-1 bg-primary py-2.5 text-sm font-bold text-primary-foreground shadow-sm disabled:opacity-60"
          >
            {busy ? '…' : 'روشن کن'}
          </button>
          <button
            type="button"
            onClick={later}
            className="nib-pill px-5 py-2.5 text-sm font-bold text-muted-foreground hover:bg-secondary"
          >
            بعداً
          </button>
        </div>
      </div>
    </div>
  );
}
