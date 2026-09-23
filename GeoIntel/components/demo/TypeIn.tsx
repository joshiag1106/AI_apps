'use client';

import { useLayoutEffect, useState } from 'react';
import { useStill } from './StageState';

/** Text that types itself. Renders whole on the server, without JavaScript, and under reduced motion. */
export function TypeIn({ text, startMs = 300, perCharMs = 45 }: { text: string; startMs?: number; perCharMs?: number }) {
  const [n, setN] = useState(text.length);

  const still = useStill();

  useLayoutEffect(() => {
    // Reduced motion, or the tour is stopped on a scene that has not started: show the whole text.
    // `still` is a dependency, so Play on a still scene clears it and types it out.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || still) { setN(text.length); return; }
    setN(0);
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      i += 1;
      setN(i);
      if (i < text.length) timer = setTimeout(step, perCharMs);
    };
    timer = setTimeout(step, startMs);
    return () => clearTimeout(timer);
  }, [text, startMs, perCharMs, still]);

  return <span>{text.slice(0, n)}</span>;
}
