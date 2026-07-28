import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const links = [
  { href: '/app',             label: 'برنامه‌ی من' },
  { href: '/app/leaderboard', label: 'قهرمانان' },
  { href: '/app/coach',       label: 'پنل مربی', coachOnly: true },
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
    <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
        <a href="/app" className="flex items-center gap-2.5 font-bold text-foreground hover:text-primary transition-colors">
          <img src="/images/logo.png" alt="جیران" className="h-7 w-9 object-contain" />
          <span className="text-sm">پنل جیران</span>
        </a>
        {!hideNav && (
          <nav className="flex items-center gap-1">
            {links.filter((l) => !l.coachOnly || isCoach).map((l) => (
              <a
                key={l.href}
                href={l.href}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                  path === l.href
                    ? 'bg-accent text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {l.label}
              </a>
            ))}
            <Button variant="outline" size="icon" onClick={signOut} title="خروج" aria-label="خروج" className="ms-1 h-9 w-9">
              <LogOut className="size-4" />
            </Button>
          </nav>
        )}
      </div>
    </header>
  );
}
