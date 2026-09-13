// The app's destinations, shared by the top bar and the phone bar so the two
// can never drift apart.

import { useEffect, useState } from 'react';
import { CalendarCheck, Trophy, Bell, Users, Flame } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { fetchFeed, lastSeen } from '../../lib/feed.js';
import { swr } from '../../lib/cache.js';

export type NavLink = {
  href: string;
  label: string;
  /** What a narrow top bar shows. The phone bar always has room for `label`. */
  short: string;
  Icon: typeof Bell;
  studentOnly?: boolean;
  coachOnly?: boolean;
  feed?: boolean;
};

// Salar has no plan of his own here — /app redirects him to the panel anyway,
// so offering him "برنامه‌ی من" was a link to a bounce.
export const LINKS: NavLink[] = [
  { href: '/app',             label: 'برنامه‌ی من', short: 'برنامه',   Icon: CalendarCheck, studentOnly: true },
  { href: '/app/coach',       label: 'پنل مربی',    short: 'مربی',     Icon: Users,         coachOnly: true },
  { href: '/app/history',     label: 'استمرار',     short: 'استمرار',  Icon: Flame, studentOnly: true },
  { href: '/app/leaderboard', label: 'قهرمان‌ها',   short: 'قهرمان‌ها', Icon: Trophy },
  { href: '/app/news',        label: 'اطلاعیه‌ها',  short: 'اخبار',    Icon: Bell,  feed: true },
];

export function linksFor(isCoach: boolean) {
  return LINKS.filter((l) => (!l.coachOnly || isCoach) && (!l.studentOnly || !isCoach));
}

// Where we are, and whether anything has been posted since this device looked.
// With no push notifications that dot is the only signal an announcement
// exists at all.
export function useNavState(enabled = true) {
  const [path, setPath] = useState('/');
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    setPath(window.location.pathname.replace(/\/$/, '') || '/');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    // Cached: this fires on every page, and "is there a new post" does not
    // need to be asked again three seconds after it was answered.
    swr('feed_latest', async () => (await fetchFeed(supabase, 1)).posts[0]?.created_at || '',
        { maxAge: 60000, onFresh: (at: string) => setUnread(!!at && at > lastSeen()) })
      .then((at: string) => { if (alive) setUnread(!!at && at > lastSeen()); });
    return () => { alive = false; };
  }, [enabled]);

  return { path, unread };
}

// Phone or not, decided in JavaScript.
//
// Not a `sm:` utility: Tailwind v4 compiles those to `@media (width >= 40rem)`,
// and even a hand-written min-width query is rewritten into that range syntax
// by the CSS minifier — which iOS Safari only understood from 16.4. A bar that
// carries the whole app's navigation should not ride on that. matchMedia is
// evaluated by the browser, so nothing in the build can rewrite it.
export function useIsPhone() {
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const sync = () => setPhone(mq.matches);
    sync();
    if (mq.addEventListener) mq.addEventListener('change', sync);
    else mq.addListener(sync); // Safari < 14
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', sync);
      else mq.removeListener(sync);
    };
  }, []);

  return phone;
}
