import { useEffect, useState } from 'react';
import { LogOut, Globe } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { fetchFeed, lastSeen } from '../../lib/feed.js';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

// Salar has no plan of his own here — /app redirects him to the panel anyway,
// so offering him "برنامه‌ی من" was a link to a bounce.
// `short` is what a phone shows. Three links plus two icons do not fit 360px
// at full length — the sign-out button was pushed off the edge.
const links = [
  { href: '/app',             label: 'برنامه‌ی من', short: 'برنامه', studentOnly: true },
  { href: '/app/coach',       label: 'پنل مربی',    short: 'مربی',   coachOnly: true },
  { href: '/app/leaderboard', label: 'امتیازات',    short: 'امتیازات' },
  { href: '/app/news',        label: 'اطلاعیه‌ها',  short: 'اخبار', feed: true },
];

export function AppHeader({ isCoach = false, hideNav = false }: { isCoach?: boolean; hideNav?: boolean }) {
  const [path, setPath] = useState('/');
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    setPath(window.location.pathname.replace(/\/$/, '') || '/');
  }, []);

  // A dot on the news link is the only signal there is that something was
  // posted — there are no push notifications, so without it an announcement
  // waits until someone happens to look.
  useEffect(() => {
    if (hideNav) return;
    let alive = true;
    fetchFeed(supabase, 1).then(({ posts }) => {
      if (alive && posts.length) setUnread(posts[0].created_at > lastSeen());
    });
    return () => { alive = false; };
  }, [hideNav]);

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
          {/* On a phone the mark carries the identity on its own: with the
              words in, the row could not fit the links and every label broke
              across two lines. */}
          <span className="display hidden whitespace-nowrap text-lg transition-colors group-hover:text-primary sm:inline">
            پنل جیران
          </span>
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
                  'nib-pill relative whitespace-nowrap px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3',
                  path === l.href
                    ? 'bg-accent font-bold text-accent-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <span className="sm:hidden">{l.short}</span>
                <span className="hidden sm:inline">{l.label}</span>
                {l.feed && unread && path !== l.href && (
                  <span
                    aria-label="اطلاعیه‌ی جدید"
                    className="absolute -end-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-background"
                  />
                )}
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
