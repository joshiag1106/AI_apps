'use client';

import { useEffect } from 'react';
import { swapPalette } from '@/lib/demo/palette';
import { useStill } from './StageState';

/**
 * Switches the whole page to the colour-blind-safe palette at `atMs` and back at `backMs`, so a
 * viewer watches every mark recolour at once. It draws nothing itself. DOM only (see swapPalette),
 * and restored on every exit path — the effect's cleanup runs on unmount, on a chapter change and
 * on replay. Skipped entirely under reduced motion.
 */
export function PaletteMorph({ atMs, backMs }: { atMs: number; backMs: number }) {
  const still = useStill();
  useEffect(() => {
    // Skipped while the tour is stopped on a scene that has not started: the page must not recolour on
    // a timer with the clock frozen. `still` is a dependency, so Play schedules the swap from then.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || still) return;
    let restore: (() => void) | null = null;
    const t1 = setTimeout(() => { restore = swapPalette(document.documentElement, 'accessible'); }, atMs);
    const t2 = setTimeout(() => { restore?.(); restore = null; }, backMs);
    return () => { clearTimeout(t1); clearTimeout(t2); restore?.(); };
  }, [atMs, backMs, still]);
  return null;
}
