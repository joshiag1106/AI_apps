'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * The star on a Watch toggle, popping once when it turns ON. Shared by the
 * signed-in path (Watchlist.tsx, whose `on` prop only changes across a full
 * server-action round-trip) and the signed-out one (WatchlistClient.tsx, plain
 * client state) — either way, this only sees `on` change value, not how.
 *
 * Never pops on the initial render (prevRef starts equal to `on`, so a page that
 * loads already-watched stays silent) and never pops when turning OFF — unpinning
 * something is not the moment to celebrate.
 */
export function WatchStar({ on }: { on: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevRef = useRef(on);

  useLayoutEffect(() => {
    const wasOn = prevRef.current;
    prevRef.current = on;
    if (wasOn === on || !on) return;

    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    el.classList.remove('star-pop');
    void el.offsetWidth; // force a reflow so a rapid re-toggle restarts the animation
    el.classList.add('star-pop');
  }, [on]);

  return <span ref={ref} aria-hidden>{on ? '★' : '☆'}</span>;
}
