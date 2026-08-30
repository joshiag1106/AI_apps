'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps the page current without a reload.
 *
 * It polls a heartbeat for the corpus version and, when that moves, asks Next to
 * re-render the server components in place. Polling rather than a socket because the
 * thing being watched changes every half hour at most — a persistent connection would be
 * machinery for an event that is rarer than most users' sessions.
 *
 * The indicator is not decoration. A page that silently rewrites itself is unsettling and
 * it hides the thing an analyst most needs to know: how old the reporting in front of
 * them is.
 */
const POLL_MS = 60_000;

export function LivePulse({ initialVersion }: { initialVersion: string }) {
  const router = useRouter();
  const [version, setVersion] = useState(initialVersion);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [live, setLive] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch('/api/pulse', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const data: { version: string } = await res.json();
        if (cancelled) return;
        setLive(true);
        if (data.version !== version) {
          setVersion(data.version);
          setUpdatedAt(Date.now());
          // Re-fetches the server components for the current route; no full reload, so
          // scroll position and any open state survive.
          router.refresh();
        }
      } catch {
        // A failed poll means the dev server is restarting or the machine slept. Say so
        // rather than showing a "live" badge that is quietly lying.
        if (!cancelled) setLive(false);
      }
    }

    const id = setInterval(check, POLL_MS);
    // Catch up immediately when a backgrounded tab returns, instead of waiting a minute.
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [version, router]);

  const justUpdated = updatedAt != null && Date.now() - updatedAt < 30_000;

  return (
    <span className="hidden items-center gap-1.5 text-[10.5px] text-faint sm:inline-flex"
      title={live
        ? 'Watching for corpus refreshes. The page updates itself when new reporting lands.'
        : 'Cannot reach the server; the reporting below may be out of date.'}>
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: live ? 'var(--color-verified)' : 'var(--color-severe)',
          boxShadow: justUpdated ? '0 0 0 3px color-mix(in srgb, var(--color-verified) 30%, transparent)' : undefined,
        }}
      />
      {live ? (justUpdated ? 'Updated just now' : 'Live') : 'Offline'}
    </span>
  );
}
