'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

const REVEAL_MS = 900;

/**
 * Draws a chart's lines in — growing from nothing to full length — the first time it
 * scrolls into view, instead of appearing all at once. Runs once per mount: scrolling
 * past a panel again does nothing, so it never fights a reader scanning up and down the
 * page. `className="contents"` by default so the wrapper div takes no part in layout —
 * these charts are laid out by their parent (a flex row, a grid cell) and a wrapper that
 * introduced its own box would break that.
 *
 * Skips any line or path that already carries its own CSS animation — the network
 * graph's "you just walked this edge" highlight, for one — so the two never fight over
 * the same stroke-dashoffset.
 */
export function RevealOnView({ children, className = 'contents' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // The wrapper itself is usually `display: contents` (see className below), which
    // gives IT a zero-size box — IntersectionObserver never reports a zero-size target
    // as intersecting, no matter where it scrolls to. Its first child (the svg this
    // component always wraps) has real geometry, so that is what gets observed.
    const target = el.firstElementChild;
    if (!target) return;

    const marks = [...el.querySelectorAll<SVGGeometryElement>('path, line')]
      .filter((m) => getComputedStyle(m).animationName === 'none');
    if (!marks.length) return;

    const lengths = marks.map((m) => {
      try { return m.getTotalLength(); } catch { return 0; }
    });
    marks.forEach((m, i) => {
      m.style.strokeDasharray = `${lengths[i]}`;
      m.style.strokeDashoffset = `${lengths[i]}`;
    });

    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      marks.forEach((m) => {
        m.style.transition = `stroke-dashoffset ${REVEAL_MS}ms ease-out`;
        m.style.strokeDashoffset = '0';
      });
      io.disconnect();
    }, { threshold: 0.2 });
    io.observe(target);
    return () => io.disconnect();
  }, []);

  return <div ref={ref} className={className}>{children}</div>;
}
