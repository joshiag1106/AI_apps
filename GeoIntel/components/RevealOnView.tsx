'use client';

import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

const REVEAL_MS = 900;

/**
 * Reveals a panel's data marks the first time it scrolls into view, instead of
 * rendering the finished picture immediately. Runs once per mount: scrolling past a
 * panel again does nothing, so it never fights a reader scanning up and down the
 * page. `className="contents"` by default so the wrapper div takes no part in
 * layout — these charts are laid out by their parent (a flex row, a grid cell) and a
 * wrapper that introduced its own box would break that.
 *
 * Three opt-in surfaces, chosen by what the mark already is rather than a
 * caller-supplied mode:
 * - `<path>` / `<line>` draw in via stroke-dashoffset, using each one's own real
 *   length (sparklines, the Mandala's spokes, the network graph's edges). Skips
 *   anything that already carries its own CSS animation — the network graph's "you
 *   just walked this edge" highlight, for one — so the two never fight over the
 *   same property.
 * - `.reveal-scale` scales in from its own centre (the risk radar's polygon).
 * - `[data-reveal-bar]` grows its width from 0 to whatever the caller already set
 *   it to (confidence and ladder-severity bars, category bars).
 */
export function RevealOnView({ children, className = 'contents' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // Layout effect, not a plain effect: the hidden starting state (dasharray, scale(0),
  // width 0) has to land before the browser paints, or the reader sees the finished
  // picture flash for a frame and then snap back to hidden right before it re-grows.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // The wrapper itself is usually `display: contents` (see className below), which
    // gives IT a zero-size box — IntersectionObserver never reports a zero-size target
    // as intersecting, no matter where it scrolls to. Its first child has real
    // geometry, so that is what gets observed.
    const target = el.firstElementChild;
    if (!target) return;

    const strokes = [...el.querySelectorAll<SVGGeometryElement>('path, line')]
      .filter((m) => getComputedStyle(m).animationName === 'none');
    const scales = [...el.querySelectorAll<HTMLElement | SVGElement>('.reveal-scale')];
    const bars = [...el.querySelectorAll<HTMLElement>('[data-reveal-bar]')];
    if (!strokes.length && !scales.length && !bars.length) return;

    const strokeLengths = strokes.map((m) => {
      try { return m.getTotalLength(); } catch { return 0; }
    });
    strokes.forEach((m, i) => {
      m.style.strokeDasharray = `${strokeLengths[i]}`;
      m.style.strokeDashoffset = `${strokeLengths[i]}`;
    });

    scales.forEach((s) => {
      s.style.transformBox = 'fill-box';
      s.style.transformOrigin = 'center';
      s.style.transform = 'scale(0)';
    });

    // The bar's target width is whatever the caller already rendered — read it back
    // before overwriting, so this component never needs to know what value it means.
    const barWidths = bars.map((b) => b.style.width);
    bars.forEach((b) => { b.style.width = '0%'; });

    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      strokes.forEach((m) => {
        m.style.transition = `stroke-dashoffset ${REVEAL_MS}ms ease-out`;
        m.style.strokeDashoffset = '0';
      });
      scales.forEach((s) => {
        s.style.transition = `transform ${REVEAL_MS}ms ease-out`;
        s.style.transform = 'scale(1)';
      });
      bars.forEach((b, i) => {
        b.style.transition = `width ${REVEAL_MS}ms ease-out`;
        b.style.width = barWidths[i];
      });
      io.disconnect();
    }, { threshold: 0.2 });
    io.observe(target);
    return () => io.disconnect();
  }, []);

  return <div ref={ref} className={className}>{children}</div>;
}
