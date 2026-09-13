// A line across the top while a page is on its way.
//
// With the destinations prefetched most switches land in a few dozen
// milliseconds, and a bar that flashed on every one of those would read as
// jitter rather than feedback. So it waits: if the page arrives before the
// bar would have been useful, it never appears at all. What it is for is the
// slow switch — a cold chunk, a bad minute on the network — where without it
// nothing happens and the tap looks ignored.

import { useEffect, useState } from 'react';

const SHOW_AFTER = 140;   // below this, the page beats the indicator

export function RouteProgress() {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');

  useEffect(() => {
    let show: number | undefined;
    let clear: number | undefined;

    const start = () => {
      window.clearTimeout(clear);
      show = window.setTimeout(() => setState('loading'), SHOW_AFTER);
    };

    const finish = () => {
      window.clearTimeout(show);
      // Only run the finishing animation if the bar was ever on screen.
      setState((s) => (s === 'loading' ? 'done' : 'idle'));
      clear = window.setTimeout(() => setState('idle'), 400);
    };

    document.addEventListener('astro:before-preparation', start);
    document.addEventListener('astro:page-load', finish);
    // A navigation that fails still has to put the bar away.
    window.addEventListener('pagehide', finish);

    return () => {
      document.removeEventListener('astro:before-preparation', start);
      document.removeEventListener('astro:page-load', finish);
      window.removeEventListener('pagehide', finish);
      window.clearTimeout(show);
      window.clearTimeout(clear);
    };
  }, []);

  if (state === 'idle') return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5"
    >
      <div
        className={state === 'loading' ? 'route-bar' : 'route-bar route-bar--done'}
      />
    </div>
  );
}
