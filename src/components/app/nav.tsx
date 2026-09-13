// The app's destinations, shared by the top bar and the phone bar so the two
// can never drift apart.

import { useEffect, useState } from 'react';
import { CalendarDays, Trophy, Megaphone, ClipboardList } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { fetchFeed, lastSeen } from '../../lib/feed.js';

export type NavLink = {
  href: string;
  label: string;
  /** What a narrow top bar shows. The phone bar always has room for `label`. */
  short: string;
  Icon: typeof CalendarDays;
  studentOnly?: boolean;
  coachOnly?: boolean;
  feed?: boolean;
};

// Salar has no plan of his own here — /app redirects him to the panel anyway,
// so offering him "برنامه‌ی من" was a link to a bounce.
export const LINKS: NavLink[] = [
  { href: '/app',             label: 'برنامه‌ی من', short: 'برنامه',   Icon: CalendarDays,   studentOnly: true },
  { href: '/app/coach',       label: 'پنل مربی',    short: 'مربی',     Icon: ClipboardList,  coachOnly: true },
  { href: '/app/leaderboard', label: 'امتیازات',    short: 'امتیازات', Icon: Trophy },
  { href: '/app/news',        label: 'اطلاعیه‌ها',  short: 'اخبار',    Icon: Megaphone, feed: true },
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
    fetchFeed(supabase, 1).then(({ posts }) => {
      if (alive && posts.length) setUnread(posts[0].created_at > lastSeen());
    });
    return () => { alive = false; };
  }, [enabled]);

  return { path, unread };
}
