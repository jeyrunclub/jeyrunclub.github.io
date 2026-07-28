import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';
import { Button } from '../ui/button';

const DISMISS_KEY = 'jeyrun.install_dismissed_at';
const DISMISS_DAYS = 7;

// Chrome / Edge / Samsung fire this before the browser's own install UI.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // Already installed / running standalone → nothing to do.
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((window.navigator as any).standalone === true) return;

    // Dismissed recently?
    try {
      const t = Number(localStorage.getItem(DISMISS_KEY));
      if (t && Date.now() - t < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;
    } catch {}

    // iOS Safari: no programmatic install; show a hint instead.
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    if (iOS && isSafari) {
      setIsIos(true);
      setVisible(true);
      return;
    }
    if (iOS) return; // Chrome/Firefox on iOS can't install PWAs anyway.

    // Android / desktop Chrome / Edge — wait for the event.
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Hide bar if the user completes install from browser UI.
    const installed = () => setVisible(false);
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  }

  async function install() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') setVisible(false);
    } catch {}
    setDeferred(null);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="نصب اپلیکیشن"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md shadow-2xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-md shadow-brand-500/25">
          <Download className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">نصب اپلیکیشن جیران</div>
          <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {isIos ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                روی
                <Share className="size-3.5" />
                در پایین سافاری بزن و «Add to Home Screen» را انتخاب کن.
              </span>
            ) : (
              'دسترسی سریع از صفحه‌ی اصلی موبایل، بدون باز کردن مرورگر.'
            )}
          </div>
        </div>
        {!isIos && (
          <Button size="sm" onClick={install}>نصب</Button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
          aria-label="بستن"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
