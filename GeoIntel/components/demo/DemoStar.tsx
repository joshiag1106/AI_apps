'use client';

import { useLayoutEffect, useState } from 'react';
import { WatchStar } from '@/components/WatchStar';
import { useStill } from './StageState';

/**
 * The watch star, switching itself on after a moment so the real pop animation plays. WatchStar
 * only pops on a CHANGE of `on` — never on first render — so it has to start off and be turned on.
 * The server and a no-JavaScript visitor see the unlit star. Under reduced motion there is no pop
 * to wait for (WatchStar suppresses it), so the star is simply lit straight away and no timer runs.
 */
export function DemoStar({ afterMs = 500 }: { afterMs?: number }) {
  const [on, setOn] = useState(false);
  const still = useStill();
  useLayoutEffect(() => {
    // Reduced motion, or the tour is stopped on a scene that has not started: lit, no pop, no timer.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || still) {
      setOn(true);
      return;
    }
    // Off first: WatchStar only pops on a CHANGE, so a star lit while still must be put out before
    // Play can light it again.
    setOn(false);
    const t = setTimeout(() => setOn(true), afterMs);
    return () => clearTimeout(t);
  }, [afterMs, still]);
  return <span className="text-3xl text-[color:var(--color-accent)]"><WatchStar on={on} /></span>;
}
