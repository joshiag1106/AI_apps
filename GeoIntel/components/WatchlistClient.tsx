'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

/**
 * The device-local watchlist, for readers who have not signed in.
 *
 * Kept exactly as it was on purpose. The dashboard tells these readers the list "is not
 * tied to an account and does not leave the device", and that promise stays true for them:
 * nothing here reaches the server. Signing in is the moment someone opts into having their
 * pins follow them, and only then does the account-bound path in Watchlist.tsx take over.
 */
export const KEY = 'kautilya.watchlist.v1';

export interface WatchItem { kind: 'country' | 'dyad'; id: string; label: string }

function read(): WatchItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => x?.kind && x?.id && x?.label) : [];
  } catch {
    // Private windows and blocked site data both throw here; an empty watchlist is fine.
    return [];
  }
}

function write(items: WatchItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* nothing to do */ }
}

/** Pin/unpin control for a signed-out reader. Writes only to this browser. */
export function LocalWatchToggle({ item }: { item: WatchItem }) {
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOn(read().some((w) => w.kind === item.kind && w.id === item.id));
    setReady(true);
  }, [item.kind, item.id]);

  const toggle = useCallback(() => {
    const items = read();
    const has = items.some((w) => w.kind === item.kind && w.id === item.id);
    const next = has
      ? items.filter((w) => !(w.kind === item.kind && w.id === item.id))
      : [...items, item].slice(-24);
    write(next);
    setOn(!has);
  }, [item]);

  // Render nothing until localStorage has been read, so the button never flips on load.
  if (!ready) return <span className="inline-block h-[26px] w-[92px]" aria-hidden />;

  return (
    <button onClick={toggle}
      aria-pressed={on}
      className={`rounded-md border px-2.5 py-1 text-[11.5px] transition-colors ${
        on
          ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent)]'
          : 'border-[color:var(--color-line)] text-muted hover:border-[color:var(--color-accent-dim)]'}`}>
      {on ? '★ Watching' : '☆ Watch'}
    </button>
  );
}

/** The dashboard panel for a signed-out reader. */
export function LocalWatchlistPanel() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => { setItems(read()); setReady(true); }, []);

  const remove = (it: WatchItem) => {
    const next = read().filter((w) => !(w.kind === it.kind && w.id === it.id));
    write(next);
    setItems(next);
  };

  if (!ready) return null;

  return (
    <div className="panel p-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-faint">Pinned on this device</div>
          <h2 className="mt-0.5 text-[15px] font-semibold tracking-tight">Watchlist</h2>
        </div>
        {items.length > 0 && (
          <button onClick={() => { write([]); setItems([]); }}
            className="text-[10.5px] text-faint hover:text-[color:var(--color-high)]">Clear all</button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
          Nothing pinned yet. Open a{' '}
          <Link href="/country/IND" className="text-[color:var(--color-accent)] hover:underline">country</Link> or{' '}
          <Link href="/dyad/IND-CHN" className="text-[color:var(--color-accent)] hover:underline">relationship</Link>{' '}
          and press Watch. The list is stored in this browser only — it is not tied to an account
          and does not leave the device.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span key={`${it.kind}:${it.id}`}
              className="group inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-line)] py-1 pl-2.5 pr-1.5 text-[11.5px]">
              <Link href={it.kind === 'country' ? `/country/${it.id}` : `/dyad/${it.id}`}
                className="text-text hover:text-[color:var(--color-accent)]">
                {it.label}
              </Link>
              <button onClick={() => remove(it)} aria-label={`Unpin ${it.label}`}
                className="rounded-full px-1 text-faint hover:text-[color:var(--color-high)]">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Hands pins made before signing in over to the account, once.
 *
 * localStorage is only readable in the browser, so the adoption cannot happen on the
 * server at sign-in — this runs when a signed-in page first renders, posts whatever the
 * device was holding, and clears the local key so it cannot be adopted twice or linger
 * after the reader signs out. Adopting is idempotent server-side regardless.
 */
export function WatchlistAdopter({ adopt }: { adopt: (items: WatchItem[]) => Promise<void> }) {
  useEffect(() => {
    const items = read();
    if (!items.length) return;
    adopt(items)
      .then(() => { try { localStorage.removeItem(KEY); } catch { /* nothing to do */ } })
      // A failed adoption leaves the local list intact so the next load can retry, which
      // is the right way round: a duplicate merge is harmless, a lost watchlist is not.
      .catch(() => {});
  }, [adopt]);
  return null;
}
