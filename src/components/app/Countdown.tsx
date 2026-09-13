// The clock running down to the gun.
//
// Days alone were too coarse the week of an event — on the morning itself it
// read "امروز" and stopped meaning anything. It ticks now, and stops ticking
// the moment the event starts rather than counting up.

import { useEffect, useState } from 'react';
import { faNum } from '../../lib/plan.js';
import { countdownParts, countdownLabel } from '../../lib/events.js';
import { cn } from '../../lib/utils';

type Ev = { event_date: string; start_time: string | null };

export function Countdown({ event, className }: { event: Ev; className?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // One timer, and only while there is something to count.
    if (!countdownParts(event, Date.now())) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [event.event_date, event.start_time]);

  const left = countdownParts(event, now);
  if (!left) return <span className={className}>{countdownLabel(event.event_date)}</span>;

  // Spelled out rather than a clock: «۱۰ روز و ۱۰ ساعت و ۵ دقیقه و ۴ ثانیه».
  // A zero unit is dropped — «۱۰ روز و ۰ ساعت» is noise — but the seconds
  // always stay, since watching them move is the point of a countdown.
  const parts: string[] = [];
  if (left.days) parts.push(`${faNum(left.days)} روز`);
  if (left.hours) parts.push(`${faNum(left.hours)} ساعت`);
  if (left.minutes) parts.push(`${faNum(left.minutes)} دقیقه`);
  parts.push(`${faNum(left.seconds)} ثانیه`);

  return <span className={cn('tabular-nums', className)}>{parts.join(' و ')}</span>;
}
