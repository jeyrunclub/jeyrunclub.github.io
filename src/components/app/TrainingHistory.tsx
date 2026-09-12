// Twelve weeks of ticks, and the streak they add up to.
//
// The rest of the app only ever shows the current week, so nothing in the
// product knew that someone had trained nine weeks without missing one. That
// number is the whole emotional payload of a training app — it is what gets a
// person out of the door at 5am — and it was sitting in `day_logs` unread.
//
// One square per day, newest week on top. Only the runner's own record is
// drawn: a solid square is a session they ticked, a faint one is a day that
// passed without one. Days that have not happened yet are left blank rather
// than drawn as failures.

import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import {
  loadDoneDays, recentWeeks, weekStreak,
  today, faNum, faDateShort, DAYS_FA,
} from '../../lib/plan.js';
import { Card } from '../ui/card';
import { cn } from '../../lib/utils';

const WEEKS = 12;

export function TrainingHistory({ studentId }: { studentId: string }) {
  const [done, setDone] = useState<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    const weeks = recentWeeks(WEEKS);
    const from = weeks[weeks.length - 1].weekStart;
    const to = weeks[0].days[6];
    loadDoneDays(supabase, studentId, from, to).then((s) => { if (alive) setDone(s); });
    return () => { alive = false; };
  }, [studentId]);

  if (!done) return <div className="h-44 animate-pulse rounded-2xl bg-muted" />;

  const weeks = recentWeeks(WEEKS);
  const streak = weekStreak(done);
  const total = done.size;
  const now = today();

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className={cn(
            'flex size-11 items-center justify-center rounded-full',
            streak > 0 ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground',
          )}>
            <Flame className="size-5" strokeWidth={2.4} />
          </span>
          <div>
            <div className="figures text-2xl font-extrabold leading-none">{faNum(streak)}</div>
            <div className="mt-1 text-[0.7rem] font-semibold text-muted-foreground">
              هفته‌ی پیاپی
            </div>
          </div>
        </div>

        <div className="ms-auto text-end">
          <div className="figures text-2xl font-extrabold leading-none">{faNum(total)}</div>
          <div className="mt-1 text-[0.7rem] font-semibold text-muted-foreground">
            تمرین در ۱۲ هفته
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        {/* Column heads: first letter of each day, Saturday first. In RTL the
            grid already flows right-to-left, so no reversing is needed. */}
        <div className="grid grid-cols-[2.6rem_repeat(7,1fr)] items-center gap-1">
          <span />
          {DAYS_FA.map((d) => (
            <span key={d} className="text-center text-[0.6rem] font-bold text-muted-foreground">
              {d.charAt(0)}
            </span>
          ))}
        </div>

        <div className="mt-1 flex flex-col gap-1">
          {weeks.map((w) => (
            <div key={w.weekStart} className="grid grid-cols-[2.6rem_repeat(7,1fr)] items-center gap-1">
              <span className="figures truncate text-[0.6rem] text-muted-foreground">
                {faDateShort(w.weekStart).split(' ')[0]}
              </span>
              {w.days.map((iso) => {
                const isDone = done.has(iso);
                const future = iso > now;
                return (
                  <span
                    key={iso}
                    title={faDateShort(iso)}
                    className={cn(
                      'aspect-square w-full rounded-[0.3rem] transition-colors',
                      future
                        ? 'border border-dashed border-border/60'
                        : isDone
                          ? 'bg-easy'
                          : 'bg-muted',
                      iso === now && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {total === 0 && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          هر تمرینی که ثبت کنی اینجا می‌ماند.
        </p>
      )}
    </Card>
  );
}
