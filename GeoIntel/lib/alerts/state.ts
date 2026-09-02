import { getDb } from '@/lib/db';

/**
 * What each reader has already been told, and whether they want telling.
 *
 * The high-water mark is per reader as well as per target. Two people watching the same
 * dyad who signed up a week apart have seen different things, and a shared mark would mean
 * whoever was told first silences the alert for everyone else.
 */

function ensure() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_marks (
      user_id TEXT, kind TEXT, target_id TEXT, rung INTEGER, notified_at TEXT,
      PRIMARY KEY (user_id, kind, target_id)
    );
  `);
  // Opting in lives on the account. Guarded because the users table predates this feature
  // and SQLite has no ADD COLUMN IF NOT EXISTS.
  try {
    db.exec("ALTER TABLE users ADD COLUMN alerts_enabled INTEGER DEFAULT 0");
  } catch {
    // Already present.
  }
}

export function alertsEnabled(userId: string): boolean {
  ensure();
  const row = getDb().prepare('SELECT alerts_enabled AS on_ FROM users WHERE id = ?')
    .get(userId) as { on_?: number } | undefined;
  return Boolean(row?.on_);
}

export function setAlertsEnabled(userId: string, on: boolean) {
  ensure();
  getDb().prepare('UPDATE users SET alerts_enabled = ? WHERE id = ?').run(on ? 1 : 0, userId);
}

/** Readers eligible for mail: on the paid plan, and having asked for it. */
export function alertRecipients(): { id: string; email: string }[] {
  ensure();
  return getDb()
    .prepare("SELECT id, email FROM users WHERE plan = 'pro' AND alerts_enabled = 1")
    .all() as unknown as { id: string; email: string }[];
}

export function marksFor(userId: string): Map<string, number> {
  ensure();
  const rows = getDb().prepare('SELECT kind, target_id, rung FROM alert_marks WHERE user_id = ?')
    .all(userId) as unknown as { kind: string; target_id: string; rung: number }[];
  return new Map(rows.map((r) => [`${r.kind}:${r.target_id}`, r.rung]));
}

export function recordMark(userId: string, kind: string, targetId: string, rung: number) {
  ensure();
  getDb().prepare(`
    INSERT INTO alert_marks (user_id, kind, target_id, rung, notified_at) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id, kind, target_id) DO UPDATE SET rung = excluded.rung, notified_at = excluded.notified_at
  `).run(userId, kind, targetId, rung, new Date().toISOString());
}

export function clearMarks(userId: string) {
  ensure();
  getDb().prepare('DELETE FROM alert_marks WHERE user_id = ?').run(userId);
}
