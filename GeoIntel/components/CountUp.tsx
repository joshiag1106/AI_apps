'use client';

import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 700;

/**
 * A number that animates to a new value instead of snapping, so that when LivePulse's
 * router.refresh() swaps in fresh corpus stats, the reader sees the figure move rather
 * than silently being a different number than a moment ago.
 *
 * The first render never animates — prevRef starts equal to value, so only a LATER
 * prop change (a real data update) triggers the count. A page that always counted up
 * from zero on load would be decoration; one that only moves when something actually
 * changed is information.
 */
export function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;
    if (from === value) return;

    if (typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }

    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{format ? format(display) : display.toLocaleString()}</>;
}
