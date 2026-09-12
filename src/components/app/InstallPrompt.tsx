// "Add to home screen", as a sheet that rises over the page.
//
// Two entirely different mechanisms hide behind one button:
//   • Chrome / Edge / Samsung fire `beforeinstallprompt`, which we hold onto
//     and replay when the user taps نصب — one tap, done.
//   • iOS has no such event. Every iOS browser can add to the home screen via
//     its own share menu, but the menu sits in a different place in each one,
//     so the hint has to name the right browser or it sends people hunting.

import { useEffect, useState } from 'react';
import { Download, X, Share, SquarePlus, Copy, Check } from 'lucide-react';
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

// Where the share control actually lives, per browser. Being vague here sends
// people into the ⋮ menu, which on Chrome does NOT carry "Add to Home Screen" —
// it sits behind the share icon in the address bar instead. Chrome, Edge and
// Firefox also need iOS 16.4+; below that, Safari is the only route.
const IOS_HINT: Record<string, { where: string; needs164: boolean }> = {
  safari:  { where: 'آیکن اشتراک‌گذاری در نوار پایین سافاری', needs164: false },
  chrome:  { where: 'آیکن اشتراک‌گذاری کنار نوار آدرس (بالا) — نه منوی سه‌نقطه', needs164: true },
  edge:    { where: 'آیکن اشتراک‌گذاری در نوار پایین اج', needs164: true },
  firefox: { where: 'آیکن اشتراک‌گذاری در نوار پایین فایرفاکس', needs164: true },
};

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/app');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
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
            <ol className="mt-4 space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Step n="۱" />
                <span className="inline-flex flex-wrap items-center gap-1.5 leading-6">
                  <Share className="size-4 shrink-0 text-primary" />
                  {hint.where}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Step n="۲" />
                <span className="inline-flex flex-wrap items-center gap-1.5 leading-6">
                  <SquarePlus className="size-4 shrink-0 text-primary" />
                  <span dir="ltr" className="figures">Add to Home Screen</span>
                  را انتخاب کن.
                </span>
              </li>
            </ol>

            {hint.needs164 && (
              <p className="nib-sm mt-3 bg-secondary/70 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                اگر این گزینه را ندیدی، iOS دستگاهت قدیمی‌تر از ۱۶٫۴ است. لینک را کپی کن و
                در <strong className="text-foreground">سافاری</strong> باز کن — آنجا همیشه هست.
              </p>
            )}

            <Button variant="outline" onClick={copyLink} className="mt-3 w-full">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'کپی شد' : 'کپی لینک برای سافاری'}
            </Button>

            <Button variant="ghost" onClick={dismiss} className="mt-1 w-full">
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
