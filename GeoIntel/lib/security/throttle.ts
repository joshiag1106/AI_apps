import 'server-only';
import { getDb } from '@/lib/db';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

/**
 * Failed-login throttle, keyed by the submitted email.
 *
 * Deliberately counts failures rather than attempts, so a person typing one password
 * wrong twice is unaffected while a script working through a list is stopped. Keyed on
 * the email rather than the IP because an attacker controls their source address far
 * more easily than they control which account they are trying to break into.
 */
export function isThrottled(subject: string, now = Date.now()): boolean {
  const row = getDb()
    .prepare('SELECT count, window_start FROM login_attempts WHERE subject = ?')
    .get(subject.toLowerCase()) as { count: number; window_start: string } | undefined;
  if (!row) return false;
  if (now - Date.parse(row.window_start) > WINDOW_MS) return false;
  return row.count >= MAX_FAILURES;
}

export function recordFailure(subject: string, now = Date.now()) {
  const db = getDb();
  const key = subject.toLowerCase();
  const row = db.prepare('SELECT count, window_start FROM login_attempts WHERE subject = ?')
    .get(key) as { count: number; window_start: string } | undefined;

  const fresh = !row || now - Date.parse(row.window_start) > WINDOW_MS;
  db.prepare('INSERT OR REPLACE INTO login_attempts (subject, count, window_start) VALUES (?,?,?)')
    .run(key, fresh ? 1 : row!.count + 1, fresh ? new Date(now).toISOString() : row!.window_start);
}

/** A successful sign-in clears the counter for that account. */
export function clearFailures(subject: string) {
  getDb().prepare('DELETE FROM login_attempts WHERE subject = ?').run(subject.toLowerCase());
}
