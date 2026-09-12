// "Add to home screen", as a sheet that rises over the page.
//
// Two entirely different mechanisms hide behind one button:
//   • Chrome / Edge / Samsung fire `beforeinstallprompt`, which we hold onto
//     and replay when the user taps نصب — one tap, done.
//   • iOS has no such event. Every iOS browser can add to the home screen via
//     its own share menu, but the menu sits in a different place in each one,
//     so the hint has to name the right browser or it sends people hunting.

import { useEffect, useState } from 'react';
import { Download, X, Share, SquarePlus, MoreVertical } from 'lucide-react';
import { Button } from '../ui/button';

const DISMISS_KEY = 'jeyrun.install_dismissed_at';
const DISMISS_DAYS = 7;
const DELAY_MS = 2500; // let the page settle before asking for anything

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// Which iOS browser, if any. They all use WebKit, so the UA is the only tell.
function iosBrowser(ua: string): 'safari' | 'chrome' | 'firefox' | 'edge' | null {
  const isIos = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
  if (!isIos) return null;
  if (/CriOS/.test(ua)) return 'chrome';
  if (/FxiOS/.test(ua)) return 'firefox';
  if (/EdgiOS/.test(ua)) return 'edge';
  return 'safari';
}

const IOS_HINT: Record<string, { where: string; icon: 'share' | 'dots' }> = {
  safari:  { where: 'نوار پایین سافاری', icon: 'share' },
  chrome:  { where: 'نوار بالای کروم',   icon: 'share' },
  edge:    { where: 'منوی «…» در اج',    icon: 'dots'  },
  firefox: { where: 'منوی «…» در فایرفاکس', icon: 'dots' },
};

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState<string | null>(null);

  useEffect(() => {
    // Already installed / running standalone → nothing to ask for.
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((window.navigator as any).standalone === true) return;

    try {
      const t = Number(localStorage.getItem(DISMISS_KEY));
      if (t && Date.now() - t < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;
    } catch {}

    const which = iosBrowser(navigator.userAgent);
    if (which) {
      const timer = setTimeout(() => { setIos(which); setVisible(true); }, DELAY_MS);
      return () => clearTimeout(timer);
    }

    let timer: ReturnType<typeof setTimeout>;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      timer = setTimeout(() => setVisible(true), DELAY_MS);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const installed = () => { setVisible(false); dismissFor(); };
    window.addEventListener('appinstalled', installed);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  function dismissFor() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  }

  function dismiss() {
    setVisible(false);
    dismissFor();
  }

  async function install() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') { setVisible(false); dismissFor(); }
    } catch {}
    setDeferred(null);
  }

  if (!visible) return null;

  const hint = ios ? IOS_HINT[ios] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="نصب اپلیکیشن جیران"
    >
      <div
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
        onClick={dismiss}
        aria-hidden
      />

      <div
        className="nib rise relative m-3 w-full max-w-sm border border-border bg-card p-5 shadow-2xl"
        style={{ marginBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="بستن"
          className="absolute end-3 top-3 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
        >
          <X className="size-4" />
        </button>

        <div className="nib-sm flex size-14 items-center justify-center bg-primary text-white shadow-sm shadow-brand-600/30">
          <Download className="size-6" />
        </div>

        <h2 className="display mt-3 text-2xl">جیران روی صفحه‌ی اصلی</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          برنامه‌ی تمرینت را مثل یک اپلیکیشن باز کن — بدون مرورگر، سریع‌تر، حتی آفلاین.
        </p>

        {hint ? (
          <>
            <ol className="mt-4 space-y-2.5 text-sm">
              <li className="flex items-center gap-2">
                <Step n="۱" />
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {hint.icon === 'share'
                    ? <Share className="size-4 text-primary" />
                    : <MoreVertical className="size-4 text-primary" />}
                  را از {hint.where} بزن.
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Step n="۲" />
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <SquarePlus className="size-4 text-primary" />
                  <span dir="ltr" className="figures">Add to Home Screen</span>
                  را انتخاب کن.
                </span>
              </li>
            </ol>
            <Button variant="outline" onClick={dismiss} className="mt-4 w-full">
              فهمیدم
            </Button>
          </>
        ) : (
          <div className="mt-4 flex gap-2">
            <Button onClick={install} className="flex-1">
              <Download className="size-4" />
              نصب
            </Button>
            <Button variant="ghost" onClick={dismiss}>بعداً</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ n }: { n: string }) {
  return (
    <span className="figures flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
      {n}
    </span>
  );
}
