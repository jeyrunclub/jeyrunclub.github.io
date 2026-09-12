// Where a password recovery link lands.
//
// This page is the reason the flow works at all: resetPasswordForEmail() only
// emails a link that signs the user in — it never sets a password. Without a
// page that calls updateUser({ password }), the link behaves as a magic link
// and the old password stays in force.
//
// The client uses the implicit flow, so the recovery token arrives in the URL
// fragment and detectSessionInUrl turns it into a session before we render.

import { useEffect, useState } from 'react';
import { Lock, Eye, EyeOff, Check, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { AppHeader } from './AppHeader';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';

const MIN = 8;

export function ResetPage() {
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    // The session may land either before this runs or a moment after, as the
    // client parses the fragment — so check once and also listen.
    let alive = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (session) { setReady(true); setEmail(session.user.email || ''); setChecking(false); }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return;
      if (session) { setReady(true); setEmail(session.user.email || ''); }
      setChecking(false);
    });

    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN) {
      setError(`رمز عبور باید حداقل ${MIN} کاراکتر باشد.`);
      return;
    }
    if (password !== confirm) {
      setError('دو رمز یکسان نیستند.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(`خطا: ${err.message}`); return; }
    setDone(true);
    setTimeout(() => window.location.replace('/app'), 1600);
  }

  return (
    <div className="min-h-screen">
      <AppHeader hideNav />
      <main className="mx-auto w-full max-w-md px-5 py-12">
        <h1 className="display text-4xl">رمز عبور تازه</h1>

        {checking ? (
          <Card className="mt-6 flex justify-center p-10">
            <div className="size-7 animate-spin rounded-full border-4 border-secondary border-t-primary" />
          </Card>
        ) : !ready ? (
          <Card className="mt-6 p-6">
            <p className="text-sm leading-relaxed text-muted-foreground">
              این لینک معتبر نیست یا منقضی شده. از صفحه‌ی ورود دوباره
              «رمز عبورت را فراموش کرده‌ای؟» را بزن تا لینک تازه بیاید.
            </p>
            <Button asChild variant="outline" className="mt-4 w-full">
              <a href="/app/login">
                <ArrowLeft className="size-4" />
                برگشت به ورود
              </a>
            </Button>
          </Card>
        ) : done ? (
          <Card className="mt-6 p-6 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-easy/15 text-easy">
              <Check className="size-7" />
            </div>
            <h2 className="display mt-3 text-2xl">رمز عوض شد</h2>
            <p className="mt-1 text-sm text-muted-foreground">در حال رفتن به برنامه‌ات…</p>
          </Card>
        ) : (
          <form onSubmit={submit}>
            {/* Hidden identifier: password managers need to know which account
                this new password belongs to before they will offer to update it. */}
            <input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              readOnly
              hidden
            />
            <Card className="mt-6 space-y-4 p-6">
              <p className="text-sm text-muted-foreground">
                یک رمز تازه انتخاب کن. بعد از این با همین رمز وارد می‌شوی.
              </p>

              <div>
                <Label className="mb-1.5 block">رمز عبور تازه</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={show ? 'text' : 'password'}
                    name="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    autoComplete="new-password"
                    className="pe-10 ps-10 text-right"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'}
                    className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className={cn(
                  'mt-1.5 text-xs',
                  password && password.length < MIN ? 'text-destructive' : 'text-muted-foreground',
                )}>
                  حداقل ۸ کاراکتر.
                </p>
              </div>

              <div>
                <Label className="mb-1.5 block">تکرار رمز</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={show ? 'text' : 'password'}
                    name="confirm-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    dir="ltr"
                    autoComplete="new-password"
                    className="pe-10 text-right"
                  />
                </div>
              </div>

              {error && (
                <div className="nib-sm border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={busy || !password || !confirm}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                ذخیره‌ی رمز تازه
              </Button>
            </Card>
          </form>
        )}
      </main>
    </div>
  );
}
