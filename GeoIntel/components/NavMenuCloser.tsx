'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Closes the phone menu after a navigation, and on Escape.
 *
 * The menu is a native <details> so it opens with JavaScript off. But the root layout survives a
 * soft navigation, so without this the menu would still be open on the page it just took you to.
 */
export function NavMenuCloser() {
  const ref = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    ref.current?.closest('details')?.removeAttribute('open');
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const menu = ref.current?.closest('details');
      if (e.key !== 'Escape' || !menu?.open) return;
      menu.removeAttribute('open');
      menu.querySelector('summary')?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <span ref={ref} hidden />;
}
