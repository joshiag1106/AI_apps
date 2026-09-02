import { getDb } from '@/lib/db';

/**
 * Watchlists for signed-in accounts.
 *
 * Only signed-in users are stored here. Anyone who has not signed in keeps their pins in
 * localStorage, because the dashboard has always told them the list "is not tied to an
 * account and does not leave the device" — and moving anonymous visitors' pins onto the
 * server would quietly make that false. Signing in is the moment a reader opts into having
 * their pins follow them between machines, and so the moment the server may hold them.
 */

export interface WatchItem { kind: 'country' | 'dyad'; id: string; label: string }

/** Matches the cap the device-local list already enforced. */
export const WATCH_LIMIT = 24;

const KINDS = new Set(['country', 'dyad']);

function ensure() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      user_id TEXT, kind TEXT, target_id TEXT, label TEXT, created_at TEXT,
      PRIMARY KEY (user_id, kind, target_id)
    );
    CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
  `);
}

/** Oldest first, matching the order the device list kept. */
export function listWatch(userId: string): WatchItem[] {
  ensure();
  const rows = getDb()
    .prepare('SELECT kind, target_id, label FROM watchlist WHERE user_id = ? ORDER BY created_at, rowid')
    .all(userId) as unknown as { kind: string; target_id: string; label: string }[];
  return rows.map((r) => ({ kind: r.kind as WatchItem['kind'], id: r.target_id, label: r.label }));
}

export function isWatched(userId: string, kind: string, id: string): boolean {
  ensure();
  return Boolean(getDb()
    .prepare('SELECT 1 FROM watchlist WHERE user_id = ? AND kind = ? AND target_id = ? LIMIT 1')
    .get(userId, kind, id));
}

/**
 * Pin one item. Over the cap the oldest is dropped, which is what the device list did by
 * keeping only the last 24 — a watchlist is a working set, not an archive.
 */
export function addWatch(userId: string, item: WatchItem) {
  if (!valid(item)) return;
  ensure();
  const db = getDb();
  db.prepare(`
    INSERT INTO watchlist (user_id, kind, target_id, label, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, kind, target_id) DO UPDATE SET label = excluded.label
  `).run(userId, item.kind, item.id, item.label, new Date().toISOString());

  db.prepare(`
    DELETE FROM watchlist WHERE user_id = ? AND rowid NOT IN (
      SELECT rowid FROM watchlist WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
    )
  `).run(userId, userId, WATCH_LIMIT);
}

export function removeWatch(userId: string, kind: string, id: string) {
  ensure();
  getDb().prepare('DELETE FROM watchlist WHERE user_id = ? AND kind = ? AND target_id = ?')
    .run(userId, kind, id);
}

export function clearWatch(userId: string) {
  ensure();
  getDb().prepare('DELETE FROM watchlist WHERE user_id = ?').run(userId);
}

/**
 * Merge a device list into an account, once, at sign-in.
 *
 * The items come from localStorage in someone's browser, so they are untrusted input in
 * the ordinary sense: anything malformed is dropped rather than allowed to throw and lose
 * the whole merge. Already-pinned items are left alone, so adopting twice is harmless.
 */
export function adoptWatch(userId: string, items: WatchItem[]) {
  if (!Array.isArray(items)) return;
  for (const item of items) if (valid(item)) addWatch(userId, item);
}

function valid(item: WatchItem | null | undefined): item is WatchItem {
  return Boolean(
    item && typeof item === 'object'
    && KINDS.has((item as WatchItem).kind)
    && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 64
    && typeof item.label === 'string' && item.label.length > 0 && item.label.length <= 120,
  );
}
