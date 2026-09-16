'use client';

import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { markSeen } from '@/lib/newness';

const FLASH_MS = 1600;

/**
 * Highlights list items that are new since the last render — specifically, since
 * LivePulse's router.refresh() swapped in fresh data. The first render never
 * flashes anything: seenRef is seeded with every id already on screen rather than
 * run through markSeen, so a normal page load is silent and only a genuinely new
 * event — one that arrives after someone has already been looking at the page —
 * gets the highlight. Children must carry `data-item-id` for this to find them.
 */
export function FlashNewItems({ ids, children }: { ids: string[]; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string> | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (seenRef.current === null) {
      seenRef.current = new Set(ids);
      return;
    }

    const fresh = markSeen(seenRef.current, ids);
    if (!fresh.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    for (const id of fresh) {
      const node = el.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`);
      if (!node) continue;
      node.classList.add('flash-new');
      setTimeout(() => node.classList.remove('flash-new'), FLASH_MS);
    }
  }, [ids]);

  return <div ref={ref} className="contents">{children}</div>;
}
