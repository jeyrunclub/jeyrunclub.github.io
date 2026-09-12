// Read-only rendering of a week's plan_days, shared by the student page and
// the coach's preview.
//
// Workout text mixes Persian and Latin ("۸ تا ۴۰۰ متر" next to "8*(6min @3:30)"),
// so every line gets its own dir="auto" — line breaks are the only structure
// the coach's text has and they carry the meaning. Alignment stays right even
// on Latin-only lines, so a workout reads as one column under its day. Each day is coloured by the
// kind of session it looks like, which is what makes a week readable at a glance.

import { DAYS_FA, faDateShort, addDays, dayIsEmpty } from '../../lib/plan.js';
import { sessionType, typeClasses } from '../../lib/session-type.js';
import { cn } from '../../lib/utils';

export type Day = { workout: string; note: string };

export function DayLines({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {text.replace(/\r\n/g, '\n').split('\n').map((line, i) =>
        line.trim() ? (
          <p key={i} dir="auto" className="figures text-right text-[0.95rem] leading-7">
            {line.trim()}
          </p>
        ) : (
          <div key={i} className="h-2" />
        ),
      )}
    </div>
  );
}

export function TypeBadge({ workout, className }: { workout: string; className?: string }) {
  const type = sessionType(workout);
  if (!type) return null;
  const c = typeClasses(type);
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-bold',
      c.bg, c.text, className,
    )}>
      <span className={cn('size-1.5 rounded-full', c.dot)} />
      {type.label}
    </span>
  );
}

function Note({ text }: { text: string }) {
  return (
    <div className="nib-sm mt-3 bg-secondary/70 px-3.5 py-3">
      <div className="mb-1 text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
        یادداشت
      </div>
      <DayLines text={text} className="text-muted-foreground" />
    </div>
  );
}

// The big card under the day strip — one day, given room to breathe.
export function DayCard({ day, index, weekStart, isToday }: {
  day: Day; index: number; weekStart: string; isToday?: boolean;
}) {
  const empty = dayIsEmpty(day);
  const c = typeClasses(sessionType(day.workout));

  return (
    <div className="nib relative overflow-hidden border border-border bg-card shadow-sm">
      {!empty && <span className={cn('absolute inset-y-0 start-0 w-1.5', c.rail)} />}
      <div className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="display text-2xl">{DAYS_FA[index]}</h2>
          <span className="figures text-sm text-muted-foreground">
            {faDateShort(addDays(weekStart, index))}
          </span>
          {isToday && (
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-[0.68rem] font-bold text-primary-foreground">
              امروز
            </span>
          )}
          {!empty && <TypeBadge workout={day.workout} className="ms-auto" />}
        </div>

        {empty ? (
          <p className="mt-5 text-sm text-muted-foreground">
            برای این روز چیزی نوشته نشده.
          </p>
        ) : (
          <div className="mt-4">
            <DayLines text={day.workout} />
            {day.note.trim() && <Note text={day.note} />}
          </div>
        )}
      </div>
    </div>
  );
}

// One row of the weekly view: a coloured rail, the day, then the workout.
export function DayRow({ day, index, weekStart, isToday }: {
  day: Day; index: number; weekStart: string; isToday?: boolean;
}) {
  const empty = dayIsEmpty(day);
  const c = typeClasses(sessionType(day.workout));

  return (
    <div className={cn(
      'relative flex gap-4 rounded-xl px-4 py-4 transition-colors',
      isToday && 'bg-accent/50',
    )}>
      <span className={cn(
        'mt-1 w-1 shrink-0 rounded-full',
        empty ? 'bg-border' : c.rail,
      )} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn('display text-lg', isToday && 'text-primary')}>
            {DAYS_FA[index]}
          </h3>
          <span className="figures text-xs text-muted-foreground">
            {faDateShort(addDays(weekStart, index))}
          </span>
          {isToday && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[0.63rem] font-bold text-primary-foreground">
              امروز
            </span>
          )}
          {!empty && <TypeBadge workout={day.workout} className="ms-auto" />}
        </div>
        {empty ? (
          <p className="mt-1 text-sm text-muted-foreground">—</p>
        ) : (
          <div className="mt-1.5">
            <DayLines text={day.workout} />
            {day.note.trim() && <Note text={day.note} />}
          </div>
        )}
      </div>
    </div>
  );
}

// The whole week, one row per day.
export function WeekList({ days, weekStart, todayIndex }: {
  days: Day[]; weekStart: string; todayIndex: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      {days.map((d, i) => (
        <DayRow key={i} day={d} index={i} weekStart={weekStart} isToday={i === todayIndex} />
      ))}
    </div>
  );
}
