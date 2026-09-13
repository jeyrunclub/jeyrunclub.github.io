import { useEffect, useState } from 'react';
import { LogOut, Globe } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

// Salar has no plan of his own here — /app redirects him to the panel anyway,
// so offering him "برنامه‌ی من" was a link to a bounce.
const links = [
  { href: '/app',             label: 'برنامه‌ی من',  studentOnly: true },
  { href: '/app/coach',       label: 'پنل مربی',     coachOnly: true },
  { href: '/app/leaderboard', label: 'رتبه‌بندی' },
];

export function AppHeader({ isCoach = false, hideNav = false }: { isCoach?: boolean; hideNav?: boolean }) {
  const [path, setPath] = useState('/');
  useEffect(() => {
    setPath(window.location.pathname.replace(/\/$/, '') || '/');
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.replace('/app/login');
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-2.5">
        <a href="/app" className="group flex items-center gap-2.5 font-bold text-foreground">
          <span className="nib-sm flex size-9 items-center justify-center bg-primary shadow-sm shadow-brand-600/30">
            <img src="/images/logo.png" alt="" className="h-4.5 w-6 object-contain brightness-0 invert" />
          </span>
          <span className="display text-lg transition-colors group-hover:text-primary">پنل جیران</span>
        </a>
        {!hideNav && (
          <nav className="flex items-center gap-1">
            {links
              .filter((l) => (!l.coachOnly || isCoach) && (!l.studentOnly || !isCoach))
              .map((l) => (
              <a
                key={l.href}
                href={l.href}
                className={cn(
                  'nib-pill px-3.5 py-1.5 text-sm font-medium transition-colors',
                  path === l.href
                    ? 'bg-accent font-bold text-accent-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                {l.label}
              </a>
            ))}
            {/* Back out to the public site — there was no way across from
                inside the app except the browser's back button. */}
            <a
              href="/"
              title="سایت جیران"
              aria-label="رفتن به سایت جیران"
              className="ms-1 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Globe className="size-4" />
            </a>
            <Button variant="ghost" size="icon" onClick={signOut} title="خروج" aria-label="خروج" className="size-9 text-muted-foreground hover:text-destructive">
              <LogOut className="size-4" />
            </Button>
          </nav>
        )}
      </div>
    </header>
  );
}
