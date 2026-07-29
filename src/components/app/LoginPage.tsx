import { useEffect, useRef, useState } from 'react';
import { Mail, User, Phone, Lock, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { AppHeader } from './AppHeader';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';

// Cloudflare Turnstile site key. Paste the site key you generate in the
// Cloudflare dashboard (challenges.cloudflare.com). Leave empty to disable
// captcha in local dev. Also enable Turnstile in Supabase → Authentication →
// Attack Protection, and paste the matching SECRET key there.
const TURNSTILE_SITE_KEY = '0x4AAAAAAEAp3e5SLFmcLK5R';

type Tab = 'signin' | 'signup';
type Msg = { kind: 'ok' | 'error' | 'info'; text: string } | null;

export function LoginPage() {
  const [tab, setTab] = useState<Tab>('signin');
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [signinMsg, setSigninMsg] = useState<Msg>(null);
  const [signinCaptcha, setSigninCaptcha] = useState('');
  const [signinResetKey, setSigninResetKey] = useState(0);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPw, setShowSignupPw] = useState(false);
  const [signupMsg, setSignupMsg] = useState<Msg>(null);
  const [signupCaptcha, setSignupCaptcha] = useState('');
  const [signupResetKey, setSignupResetKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace('/app');
    });
  }, []);

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (TURNSTILE_SITE_KEY && !signinCaptcha) {
      setSigninMsg({ kind: 'error', text: 'لطفاً کپچا را کامل کن.' });
      return;
    }
    setBusy(true);
    setSigninMsg({ kind: 'info', text: 'در حال ورود...' });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: signinCaptcha ? { captchaToken: signinCaptcha } : undefined,
    });
    setBusy(false);
    setSigninResetKey((k) => k + 1); // one token, one use — remount for next attempt
    setSigninCaptcha('');
    if (error) {
      const bad = /invalid.*(credential|login|password)/i.test(error.message);
      setSigninMsg({
        kind: 'error',
        text: bad
          ? 'ایمیل یا رمز عبور اشتباه است.'
          : `خطا: ${error.message}`,
      });
      return;
    }
    if (data.session) {
      window.location.replace('/app');
    } else {
      setSigninMsg({ kind: 'error', text: 'ورود انجام نشد. دوباره تلاش کن.' });
    }
  }

  async function onSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !signupEmail.trim() || !signupPassword) return;
    if (signupPassword.length < 8) {
      setSignupMsg({ kind: 'error', text: 'رمز عبور باید حداقل ۸ کاراکتر باشد.' });
      return;
    }
    if (TURNSTILE_SITE_KEY && !signupCaptcha) {
      setSignupMsg({ kind: 'error', text: 'لطفاً کپچا را کامل کن.' });
      return;
    }

    setBusy(true);
    setSignupMsg({ kind: 'info', text: 'در حال ثبت‌نام...' });
    try { localStorage.setItem('jeyrun.pending_full_name', name.trim()); } catch {}

    const { data, error } = await supabase.auth.signUp({
      email: signupEmail.trim(),
      password: signupPassword,
      options: {
        data: { full_name: name.trim(), phone: phone.trim() || null },
        emailRedirectTo: `${window.location.origin}/app`,
        ...(signupCaptcha ? { captchaToken: signupCaptcha } : {}),
      },
    });
    setBusy(false);
    setSignupResetKey((k) => k + 1);
    setSignupCaptcha('');

    if (error) {
      const exists = /already.*(registered|exist)|user.*exists/i.test(error.message);
      setSignupMsg({
        kind: 'error',
        text: exists
          ? 'این ایمیل قبلاً ثبت شده. از تب «ورود» استفاده کن.'
          : `خطا: ${error.message}`,
      });
      return;
    }

    // With "Confirm email" OFF in Supabase → session is returned immediately.
    if (data.session) {
      window.location.replace('/app');
      return;
    }
    // With confirm ON → user gets an email. Keep this branch as a graceful fallback.
    if (data.user) {
      setSignupMsg({
        kind: 'ok',
        text: 'ثبت‌نام انجام شد. حالا از تب «ورود» با همین ایمیل و رمز وارد شو.',
      });
    } else {
      setSignupMsg({ kind: 'error', text: 'ثبت‌نام انجام نشد. دوباره تلاش کن.' });
    }
  }

  async function onForgotPassword() {
    if (!email.trim()) {
      setSigninMsg({ kind: 'error', text: 'اول ایمیلت را در کادر بالا وارد کن.' });
      return;
    }
    if (TURNSTILE_SITE_KEY && !signinCaptcha) {
      setSigninMsg({ kind: 'error', text: 'اول کپچا را کامل کن، بعد روی این لینک بزن.' });
      return;
    }
    setBusy(true);
    setSigninMsg({ kind: 'info', text: 'در حال ارسال لینک بازیابی...' });
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/app`,
      captchaToken: signinCaptcha || undefined,
    } as any);
    setBusy(false);
    setSigninResetKey((k) => k + 1);
    setSigninCaptcha('');
    if (error) setSigninMsg({ kind: 'error', text: `خطا: ${error.message}` });
    else setSigninMsg({ kind: 'ok', text: 'اگر این ایمیل ثبت شده باشد، لینک بازیابی ارسال شد.' });
  }

  return (
    <div className="min-h-screen">
      <AppHeader hideNav />
      <main className="mx-auto flex max-w-md flex-col gap-6 px-5 pb-16 pt-10">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">ورود اعضا</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            وارد پنل تمرین جیران شو یا اگر تازه پیوسته‌ای، ثبت‌نام کن.
          </p>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">
          {(['signin', 'signup'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'rounded-full px-4 py-2.5 text-sm font-semibold transition-all',
                tab === t
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'signin' ? 'ورود' : 'ثبت‌نام'}
            </button>
          ))}
        </div>

        <Card className="p-6">
          {tab === 'signin' ? (
            <form onSubmit={onSignIn} className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                با ایمیل و رمز عبور خود وارد شو.
              </p>

              <div className="space-y-2">
                <Label htmlFor="signin-email">ایمیل</Label>
                <IconInputWrapper icon={<Mail className="size-4" />}>
                  <Input
                    id="signin-email"
                    type="email"
                    required
                    dir="ltr"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pr-10 text-start"
                  />
                </IconInputWrapper>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signin-password">رمز عبور</Label>
                <PasswordField
                  id="signin-password"
                  autoComplete="current-password"
                  value={password}
                  onChange={setPassword}
                  show={showPw}
                  toggle={() => setShowPw((v) => !v)}
                />
              </div>

              <TurnstileWidget onToken={setSigninCaptcha} resetKey={signinResetKey} />

              {signinMsg && <Message msg={signinMsg} />}

              <Button
                type="submit"
                size="lg"
                disabled={busy || !email.trim() || !password || (!!TURNSTILE_SITE_KEY && !signinCaptcha)}
                className="w-full"
              >
                ورود
              </Button>

              <button
                type="button"
                onClick={onForgotPassword}
                disabled={busy}
                className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
              >
                رمز عبورت را فراموش کرده‌ای؟
              </button>
            </form>
          ) : (
            <form onSubmit={onSignUp} className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                تازه می‌خواهی به جیران بپیوندی؟ نام، ایمیل و یک رمز عبور انتخاب کن. بعد از تأیید سالار،
                برنامه‌ی تمرینت را می‌بینی.
              </p>

              <div className="space-y-2">
                <Label htmlFor="signup-name">نام و نام خانوادگی</Label>
                <IconInputWrapper icon={<User className="size-4" />}>
                  <Input
                    id="signup-name"
                    required
                    autoComplete="name"
                    placeholder="مثلاً: علی رضایی"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pr-10"
                  />
                </IconInputWrapper>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-phone">
                  شماره همراه <span className="font-normal text-muted-foreground">(اختیاری)</span>
                </Label>
                <IconInputWrapper icon={<Phone className="size-4" />}>
                  <Input
                    id="signup-phone"
                    type="tel"
                    dir="ltr"
                    autoComplete="tel"
                    placeholder="09xxxxxxxxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pr-10 text-start"
                  />
                </IconInputWrapper>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-email">ایمیل</Label>
                <IconInputWrapper icon={<Mail className="size-4" />}>
                  <Input
                    id="signup-email"
                    type="email"
                    required
                    dir="ltr"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="pr-10 text-start"
                  />
                </IconInputWrapper>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-password">
                  رمز عبور <span className="font-normal text-muted-foreground">(حداقل ۸ کاراکتر)</span>
                </Label>
                <PasswordField
                  id="signup-password"
                  autoComplete="new-password"
                  value={signupPassword}
                  onChange={setSignupPassword}
                  show={showSignupPw}
                  toggle={() => setShowSignupPw((v) => !v)}
                  minLength={8}
                />
              </div>

              <TurnstileWidget onToken={setSignupCaptcha} resetKey={signupResetKey} />

              {signupMsg && <Message msg={signupMsg} />}

              <Button
                type="submit"
                size="lg"
                disabled={
                  busy ||
                  !name.trim() ||
                  !signupEmail.trim() ||
                  signupPassword.length < 8 ||
                  (!!TURNSTILE_SITE_KEY && !signupCaptcha)
                }
                className="w-full"
              >
                ثبت‌نام
              </Button>
            </form>
          )}
        </Card>

        <a href="/" className="mx-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="size-3.5" />
          بازگشت به سایت جیران
        </a>
      </main>
    </div>
  );
}

// ---------- shared bits ----------

function IconInputWrapper({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
        {icon}
      </span>
      {children}
    </div>
  );
}

function PasswordField({
  id,
  autoComplete,
  value,
  onChange,
  show,
  toggle,
  minLength,
}: {
  id: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  toggle: () => void;
  minLength?: number;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
        <Lock className="size-4" />
      </span>
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        required
        dir="ltr"
        autoComplete={autoComplete}
        placeholder="••••••••"
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10 pl-10 text-start"
      />
      <button
        type="button"
        onClick={toggle}
        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        aria-label={show ? 'مخفی کردن رمز' : 'نمایش رمز'}
        tabIndex={-1}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function Message({ msg }: { msg: NonNullable<Msg> }) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed',
        msg.kind === 'ok' && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        msg.kind === 'error' && 'border-destructive/25 bg-destructive/10 text-destructive',
        msg.kind === 'info' && 'border-border bg-secondary text-muted-foreground',
      )}
    >
      {msg.text}
    </div>
  );
}

// ---------- Turnstile ----------

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

function TurnstileWidget({
  onToken,
  resetKey,
}: {
  onToken: (token: string) => void;
  resetKey: number;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  // Load Cloudflare's script once (idempotent).
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    if (!document.querySelector(`script[src="${TURNSTILE_SRC}"]`)) {
      const s = document.createElement('script');
      s.src = TURNSTILE_SRC;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  }, []);

  // (Re-)render the widget whenever this instance mounts or resetKey bumps.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    if (!boxRef.current) return;

    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return;
      const ts = (window as any).turnstile;
      if (!ts || !boxRef.current) {
        setTimeout(tryRender, 200);
        return;
      }
      // Widget already there from a previous render → reset it.
      if (widgetId.current !== null) {
        try { ts.reset(widgetId.current); } catch {}
        return;
      }
      widgetId.current = ts.render(boxRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'auto',
        language: 'fa',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    };
    tryRender();

    return () => {
      cancelled = true;
      const ts = (window as any).turnstile;
      if (ts && widgetId.current !== null) {
        try { ts.remove(widgetId.current); } catch {}
      }
      widgetId.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <div className="flex justify-center pt-1">
      <div ref={boxRef} />
    </div>
  );
}
