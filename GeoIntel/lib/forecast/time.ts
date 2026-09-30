export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
/** How long after a window ends before its question is settled. */
export const GRACE_MS = 72 * HOUR;

/** Monday 00:00 UTC of the week containing `ms`. */
export function mondayStart(ms: number): number {
  const d = new Date(ms);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return midnight - sinceMonday * DAY;
}

/** ISO-8601 week of `ms`, e.g. '2026-W41'. A week belongs to the year of its Thursday. */
export function weekId(ms: number): string {
  const monday = mondayStart(ms);
  const year = new Date(monday + 3 * DAY).getUTCFullYear();
  const weekOne = mondayStart(Date.UTC(year, 0, 4)); // 4 January is always in week 1
  const week = 1 + Math.round((monday - weekOne) / WEEK);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** UTC calendar day of `ms`, 'YYYY-MM-DD'. */
export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
