// Read-only rendering of a week's plan_days, shared by the student page and
// the coach's preview.
//
// Workout text mixes Persian and Latin ("۸ تا ۴۰۰ متر" next to "8*(6min @3:30)"),
// so every line gets its own dir="auto" — line breaks are the only structure
// the coach's text has and they carry the meaning.

import { DAYS_FA, faDateShort, addDays, dayIsEmpty } from '../../lib/plan.js';

export type Day = { workout: string; note: string };

export function DayLines({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {text.replace(/\r\n/g, '\n').split('\n').map((line, i) =>
        line.trim() ? (
          <p key={i} dir="auto" className="text-[0.95rem] leading-7">{line.trim()}</p>
        ) : (
          <div key={i} className="h-2" />
        ),
      )}
    </div>
  );
}

// One day, as shown in the weekly list and under the day strip.
export function DayBlock({
  day, index, weekStart, isToday,
}: { day: Day; index: number; weekStart: string; isToday?: boolean }) {
  const empty = dayIsEmpty(day);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <h3 className={isToday ? 'text-base font-extrabold text-primary' : 'text-base font-extrabold'}>
          {DAYS_FA[index]}
        </h3>
        <span className="text-xs text-muted-foreground">
          {faDateShort(addDays(weekStart, index))}
        </span>
        {isToday && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[0.68rem] font-bold text-primary">
            امروز
          </span>
        )}
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <>
          <DayLines text={day.workout} />
          {day.note.trim() && (
            <div className="mt-1 rounded-lg border-s-2 border-primary/40 bg-secondary/60 px-3 py-2">
              <DayLines text={day.note} className="text-muted-foreground" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// The whole week, one block per day.
export function WeekList({ days, weekStart, todayIndex }: {
  days: Day[]; weekStart: string; todayIndex: number;
}) {
  return (
    <div className="divide-y divide-border">
      {days.map((d, i) => (
        <div key={i} className="py-4 first:pt-0 last:pb-0">
          <DayBlock day={d} index={i} weekStart={weekStart} isToday={i === todayIndex} />
        </div>
      ))}
    </div>
  );
}
