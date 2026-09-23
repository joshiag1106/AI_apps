'use client';

import { useLayoutEffect, useState } from 'react';
import { useStill } from './StageState';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The number on screen `t` of the way through the count (0 = start, 1 = done). `t` is clamped into
 * [0, 1] and NaN counts as the start: a requestAnimationFrame timestamp can precede the
 * performance.now() taken when the delay timer fired, which makes `t` slightly negative, and
 * `(1 - t) ** 3` would then exceed 1 and flash a negative number for a frame. At the end it returns
 * `value` exactly, so a non-integer value is not rounded away.
 */
export function countAt(t: number, value: number): number {
  const clamped = Number.isNaN(t) ? 0 : Math.min(1, Math.max(0, t));
  if (clamped === 1) return value;
  return Math.round(value * (1 - (1 - clamped) ** 3));
}

/**
 * A number that counts up from zero after a delay, and restarts from zero if `value` changes.
 *
 * components/CountUp only animates a CHANGE, never the first render, which is right for a live
 * refresh and wrong for a scene that must count up when it appears. This starts from the final
 * value — what the server, a no-JavaScript visitor and reduced motion all see — then drops to zero
 * in a layout effect and counts. That reset happens before the first CLIENT-SIDE paint; a hard load
 * of server HTML may show the final number for a frame before hydration. `toLocaleString('en-US')`
 * so server and client agree.
 */
export function CountIn({
  value, delayMs = 600, durationMs = 900, format = (n: number) => n.toLocaleString('en-US'),
}: { value: number; delayMs?: number; durationMs?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);

  const still = useStill();

  useLayoutEffect(() => {
    // Reduced motion, or the tour is stopped on a scene that has not started: show the finished number.
    // `still` is a dependency, so Play on a still scene resets to zero and counts.
    if (reduced() || still) { setShown(value); return; }
    setShown(0);
    let frame = 0;
    const timer = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = (now - start) / durationMs;
        setShown(countAt(t, value));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, delayMs);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [value, delayMs, durationMs, still]);

  return <>{format(shown)}</>;
}
