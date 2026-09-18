'use client';

import { useEffect } from 'react';

/**
 * Records that this visitor has reached the real dashboard, so app/page.tsx's pre-paint
 * script never shows them the splash again — not only for someone who clicked Enter there,
 * but for anyone who reaches /board at all: a bookmark, a shared link, typing the URL.
 * All of those mean the same thing — this reader has seen the app — so all of them count.
 *
 * A dedicated Client Component rather than an onClick on the splash's Enter link, because
 * the splash is a Server Component and a Server Component cannot hand a function to an
 * element it renders — see tests/splash.test.ts for the outage that taught this.
 *
 * Renders nothing. Wrapped in try/catch because localStorage throws outright in some
 * privacy modes, and failing to remember "already entered" there costs that visitor one
 * extra splash screen next time, never a crash.
 */
export function MarkEntered() {
  useEffect(() => {
    try {
      localStorage.setItem('kautilya-entered', '1');
    } catch {
      /* privacy mode: fine, they just see the splash once more */
    }
  }, []);
  return null;
}
