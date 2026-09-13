// The phone bar.
//
// The top-right corner of a phone is the hardest place to reach one-handed,
// and that is where this app's navigation used to live — for something people
// open at 5am holding a water bottle. Below sm the destinations move to the
// thumb; above it the top bar keeps them and this is not rendered.
//
// It also buys back the room the top bar had run out of: labels are full
// length here, where the header had to shorten «اطلاعیه‌ها» to «اخبار» to fit
// a 360px screen.

import { useState } from 'react';
import { linksFor, useNavState, useIsPhone } from './nav';
import { cn } from '../../lib/utils';

export function BottomNav({ isCoach = false }: { isCoach?: boolean }) {
  const { path, unread } = useNavState();
  const phone = useIsPhone();
  const links = linksFor(isCoach);
  // The tap lights the tab up now, not when the page finishes arriving. Even
  // a fast navigation has a gap, and a bar that does not react reads as a
  // missed press — so people press it again.
  const [pending, setPending] = useState<string | null>(null);

  if (!phone) return null;

  return (
    <nav
      aria-label="ناوبری"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/90 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-md items-stretch">
        {links.map((l) => {
          const active = (pending ?? path) === l.href;
          return (
            <a
              key={l.href}
              href={l.href}
              data-astro-prefetch="viewport"
              onClick={() => setPending(l.href)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span className="relative">
                <l.Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                {l.feed && unread && !active && (
                  <span
                    aria-label="اطلاعیه‌ی جدید"
                    className="absolute -end-1 -top-1 size-2 rounded-full bg-primary ring-2 ring-background"
                  />
                )}
              </span>
              <span className={cn('text-[0.68rem]', active && 'font-bold')}>{l.label}</span>
              {active && (
                <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" />
              )}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
