import { useEffect, useState } from 'react';
import { Hourglass, XCircle, MessageCircle, LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { AppHeader } from './AppHeader';
import { Card } from '../ui/card';
import { Button } from '../ui/button';

type View = 'loading' | 'pending' | 'rejected';

export function PendingPage() {
  const [view, setView] = useState<View>('loading');
  const [email, setEmail] = useState<string>('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.replace('/app/login'); return; }

      const { data: profile } = await supabase
        .from('profiles').select('status').eq('id', session.user.id).single();

      if (profile?.status === 'approved') { window.location.replace('/app'); return; }

      if (profile?.status === 'rejected') {
        setView('rejected');
      } else {
        setEmail(session.user.email ?? '');
        setView('pending');
      }
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.replace('/app/login');
  }

  return (
    <div className="min-h-screen">
      <AppHeader hideNav />
      <main className="mx-auto flex max-w-md flex-col gap-6 px-5 pb-16 pt-10">
        {view === 'loading' && (
          <div className="flex justify-center py-16">
            <div className="size-10 animate-spin rounded-full border-4 border-secondary border-t-primary" />
          </div>
        )}

        {view === 'pending' && (
          <Card className="p-8 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Hourglass className="size-8" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight">در انتظار تأیید</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              ورودت با موفقیت انجام شد. سالار درخواست عضویتت را بررسی می‌کند و
              به‌محض تأیید، برنامه‌ی تمرینت اینجا نمایش داده می‌شود.
            </p>
            {email && (
              <p className="mt-5 text-sm text-muted-foreground" dir="ltr">
                {email}
              </p>
            )}
            <Button variant="outline" onClick={signOut} className="mt-6">
              <LogOut className="size-4" />
              خروج از حساب
            </Button>
          </Card>
        )}

        {view === 'rejected' && (
          <Card className="p-8 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <XCircle className="size-8" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight">درخواست پذیرفته نشد</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              متأسفانه درخواست عضویت شما در جیران پذیرفته نشد. اگر فکر می‌کنی
              اشتباهی رخ داده، از طریق واتس‌اپ با سالار در تماس باش.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <a href="https://wa.me/989128889975" target="_blank" rel="noopener">
                  <MessageCircle className="size-4" />
                  پیام به سالار
                </a>
              </Button>
              <Button variant="outline" onClick={signOut}>
                <LogOut className="size-4" />
                خروج از حساب
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
