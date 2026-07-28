import { useEffect, useState } from 'react';
import { Mail, User, Phone, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { AppHeader } from './AppHeader';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';

type Tab = 'signin' | 'signup';
type Msg = { kind: 'ok' | 'error' | 'info'; text: string } | null;

export function LoginPage() {
  const [tab, setTab] = useState<Tab>('signin');
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [signinMsg, setSigninMsg] = useState<Msg>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupMsg, setSignupMsg] = useState<Msg>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace('/app');
    });
  }, []);

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setSigninMsg({ kind: 'info', text: 'در حال ارسال...' });
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        shouldCreateUser: false,
      },
    });
    setBusy(false);
    if (error) {
      const notFound = /not.*(found|exist)|invalid/i.test(error.message) || (error as any).status === 400;
      setSigninMsg({
        kind: 'error',
        text: notFound
          ? 'حسابی با این ایمیل پیدا نشد. از تب «ثبت‌نام» شروع کن.'
          : `خطا: ${error.message}`,
      });
    } else {
      setSigninMsg({ kind: 'ok', text: `لینک ورود به ${email.trim()} ارسال شد. ایمیلت را چک کن.` });
    }
  }

  async function onSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !signupEmail.trim()) return;
    setBusy(true);
    setSignupMsg({ kind: 'info', text: 'در حال ارسال...' });
    try { localStorage.setItem('jeyrun.pending_full_name', name.trim()); } catch {}
    const { error } = await supabase.auth.signInWithOtp({
      email: signupEmail.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        shouldCreateUser: true,
        data: { full_name: name.trim(), phone: phone.trim() || null },
      },
    });
    setBusy(false);
    if (error) setSignupMsg({ kind: 'error', text: `خطا: ${error.message}` });
    else setSignupMsg({ kind: 'ok', text: `لینک ثبت‌نام به ${signupEmail.trim()} ارسال شد. ایمیلت را چک کن.` });
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
                اگر قبلاً ثبت‌نام کرده‌ای، فقط ایمیلت را وارد کن. لینک ورود برایت ارسال می‌شود.
              </p>

              <div className="space-y-2">
                <Label htmlFor="signin-email">ایمیل</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="signin-email"
                    type="email"
                    required
                    dir="ltr"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pe-10 text-start"
                  />
                </div>
              </div>

              {signinMsg && <Message msg={signinMsg} />}

              <Button type="submit" size="lg" disabled={busy || !email.trim()} className="w-full">
                ارسال لینک ورود
              </Button>
            </form>
          ) : (
            <form onSubmit={onSignUp} className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                تازه می‌خواهی به جیران بپیوندی؟ نام و ایمیلت را وارد کن. بعد از تأیید سالار، برنامه‌ی
                تمرینت را می‌بینی.
              </p>

              <div className="space-y-2">
                <Label htmlFor="signup-name">نام و نام خانوادگی</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="signup-name"
                    required
                    autoComplete="name"
                    placeholder="مثلاً: علی رضایی"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pe-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-phone">
                  شماره همراه <span className="font-normal text-muted-foreground">(اختیاری)</span>
                </Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="signup-phone"
                    type="tel"
                    dir="ltr"
                    autoComplete="tel"
                    placeholder="09xxxxxxxxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pe-10 text-start"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-email">ایمیل</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="signup-email"
                    type="email"
                    required
                    dir="ltr"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="pe-10 text-start"
                  />
                </div>
              </div>

              {signupMsg && <Message msg={signupMsg} />}

              <Button type="submit" size="lg" disabled={busy || !name.trim() || !signupEmail.trim()} className="w-full">
                ثبت‌نام و ارسال لینک
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
