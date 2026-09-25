import { getDb } from '@/lib/db';

/**
 * How many people have visited Kautilya, now that every visit requires an account.
 *
 * A "visit" is recorded once per session start — every sign-up and every sign-in — not
 * once per page view, because that is the moment the product actually knows who is here.
 * `totalUsers` answers "how many distinct people"; `totalVisits` answers "how many times
 * anyone has come back", which is a different and useful number once revisits are common.
 */

export function recordVisit(userId: string) {
  getDb().prepare('INSERT INTO visits (user_id, created_at) VALUES (?, ?)')
    .run(userId, new Date().toISOString());
}

export interface VisitStats {
  totalUsers: number;
  totalVisits: number;
  last30Days: number;
}

export function visitStats(): VisitStats {
  const db = getDb();
  const totalUsers = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  const totalVisits = (db.prepare('SELECT COUNT(*) AS n FROM visits').get() as { n: number }).n;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const last30Days = (db.prepare('SELECT COUNT(*) AS n FROM visits WHERE created_at > ?').get(since) as { n: number }).n;
  return { totalUsers, totalVisits, last30Days };
}
