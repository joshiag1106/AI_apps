import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { listWatch, isWatched, type WatchItem } from '@/lib/watchlist/store';
import { toggleWatchAction, clearWatchAction, adoptWatchAction } from '@/lib/watchlist/actions';
import { LocalWatchToggle, LocalWatchlistPanel, WatchlistAdopter } from '@/components/WatchlistClient';

export type { WatchItem };

/**
 * Watchlists take one of two paths, decided by whether the reader has signed in.
 *
 * Signed in, the list lives on the server and follows them between machines. Signed out,
 * it stays in their browser exactly as before — because the dashboard has always promised
 * that list "is not tied to an account and does not leave the device", and quietly moving
 * anonymous readers' pins onto the server would make that false. Signing in is the moment
 * someone opts into the trade, so it is the moment the server may hold anything.
 *
 * The signed-in path needs no client JavaScript at all: it is forms and server actions.
 */

/** Pin/unpin control. Rendered on country and dyad pages. */
export async function WatchToggle({ item }: { item: WatchItem }) {
  const user = await currentUser();
  if (!user) return <LocalWatchToggle item={item} />;

  const on = isWatched(user.id, item.kind, item.id);
  return (
    <form action={toggleWatchAction.bind(null, item, !on)}>
      <button type="submit" aria-pressed={on}
        className={`rounded-md border px-2.5 py-1 text-[11.5px] transition-colors ${
          on
            ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent)]'
            : 'border-[color:var(--color-line)] text-muted hover:border-[color:var(--color-accent-dim)]'}`}>
        {on ? '★ Watching' : '☆ Watch'}
      </button>
    </form>
  );
}

/** The pinned panel on the dashboard. */
export async function WatchlistPanel() {
  const user = await currentUser();
  if (!user) return <LocalWatchlistPanel />;

  const items = listWatch(user.id);
  return (
    <div className="panel p-4">
      {/* Runs once per signed-in page load and is a no-op with nothing to adopt. */}
      <WatchlistAdopter adopt={adoptWatchAction} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-faint">Pinned to your account</div>
          <h2 className="mt-0.5 text-[15px] font-semibold tracking-tight">Watchlist</h2>
        </div>
        {items.length > 0 && (
          <form action={clearWatchAction}>
            <button type="submit"
              className="text-[10.5px] text-faint hover:text-[color:var(--color-high)]">Clear all</button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
          Nothing pinned yet. Open a{' '}
          <Link href="/country/IND" className="text-[color:var(--color-accent)] hover:underline">country</Link> or{' '}
          <Link href="/dyad/IND-CHN" className="text-[color:var(--color-accent)] hover:underline">relationship</Link>{' '}
          and press Watch. Pinned to your account, so the list follows you to any browser
          you sign in from.
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
              <form action={toggleWatchAction.bind(null, it, false)}>
                <button type="submit" aria-label={`Unpin ${it.label}`}
                  className="rounded-full px-1 text-faint hover:text-[color:var(--color-high)]">×</button>
              </form>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
