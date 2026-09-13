// The record day, on the page people already open.
//
// /app/event has no room in the bottom bar — it is at four and five is the
// ceiling — and an event is temporary anyway. So it announces itself here,
// on the plan, and disappears again when there is nothing coming.

import { useEffect, useState } from 'react';
import { Trophy, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { swr } from '../../lib/cache.js';
import { faDateLong } from '../../lib/plan.js';
import {
  fetchEvents, currentEvent, countdownLabel, daysUntil, distanceLabel,
} from '../../lib/events.js';
import { cn } from '../../lib/utils';

type Ev = {
  id: string; title: string; event_date: string; start_time: string | null;
  place: string | null; distances: number[];
};

export function EventCard({ isCoach }: { isCoach?: boolean }) {
  const [ev, setEv] = useState<Ev | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const pick = (list: Ev[]) => {
      const e = currentEvent(list || []);
      // Stays up for a week afterwards so the results get read.
      if (!alive) return;
      setEv(e && daysUntil(e.event_date) >= -7 ? e : null);
      setLoaded(true);
    };
    swr('events', () => fetchEvents(supabase), { maxAge: 60000, onFresh: pick })
      .then((list: Ev[]) => pick(list));
    return () => { alive = false; };
  }, []);

  // Salar always gets a way in: with nothing scheduled this is how the first
  // one gets made. Members see nothing until there is something to see.
  if (!ev) {
    if (!isCoach || !loaded) return null;
    return (
      <a
        href="/app/event"
        data-astro-prefetch="tap"
        className="nib group flex items-center gap-3 border border-dashed border-border bg-card/60 p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Trophy className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-sm">رکوردگیری</b>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            روزی برای رکورد زدن اعلام کن؛ همه هدفشان را ثبت می‌کنند.
          </span>
        </span>
        <ChevronLeft className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
      </a>
    );
  }

  const soon = daysUntil(ev.event_date) >= 0;

  return (
    <a
      href="/app/event"
      data-astro-prefetch="tap"
      className="rise nib group flex items-center gap-3 border border-primary/30 bg-accent/50 p-4 transition-colors hover:bg-accent"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
        <Trophy className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="truncate text-sm">{ev.title}</b>
          <span className={cn(
            'nib-pill px-2 py-0.5 text-[0.62rem] font-bold',
            soon ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
          )}>
            {countdownLabel(ev.event_date)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {faDateLong(ev.event_date)}
          {ev.distances?.length ? ` — ${ev.distances.map(distanceLabel).join('، ')}` : ''}
        </span>
        <span className="mt-1 block text-xs font-bold text-primary">
          {soon ? 'هدفت را ثبت کن' : 'نتیجه‌ها را ببین'}
        </span>
      </span>
      <ChevronLeft className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
    </a>
  );
}
