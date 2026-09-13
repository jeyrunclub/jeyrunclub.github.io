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

const pad = (n: number) => faNum(String(n).padStart(2, '0'));

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

  const clock = `${pad(left.hours)}:${pad(left.minutes)}:${pad(left.seconds)}`;
  return (
    <span className={cn('figures tabular-nums', className)}>
      {left.days > 0 && <span className="font-sans">{faNum(left.days)} روز و </span>}
      <span dir="ltr">{clock}</span>
    </span>
  );
}
