import { getDb } from '@/lib/db';

/**
 * The one-time exit survey.
 *
 * Every account is asked once, on its way out, and never again — whether it answers or
 * skips. Asking on every sign-out would train a regular into dreading the sign-out button;
 * `survey_done` on the account is what makes "once ever" durable across future sessions
 * rather than just for the current one.
 *
 * `survey_done` is guarded with try/catch because the `users` table predates this feature
 * and SQLite has no `ADD COLUMN IF NOT EXISTS` — see lib/alerts/state.ts for the same shape.
 */
function ensure() {
  try {
    getDb().exec('ALTER TABLE users ADD COLUMN survey_done INTEGER DEFAULT 0');
  } catch {
    // Already present.
  }
}

export type LikedFeature = 'map' | 'board' | 'lens' | 'ask' | 'demo' | 'other';

export const FEATURE_LABELS: Record<LikedFeature, string> = {
  map: 'The threat map',
  board: 'The threat board',
  lens: 'Language Lens',
  ask: 'Ask',
  demo: 'The demo tour',
  other: 'Something else',
};

export interface FeedbackInput {
  rating: number; // 1-5
  likedFeature: LikedFeature;
  missingText: string;
  featureRequestText: string;
}

export function needsSurvey(userId: string): boolean {
  ensure();
  const row = getDb().prepare('SELECT survey_done AS d FROM users WHERE id = ?')
    .get(userId) as { d?: number } | undefined;
  return !row?.d;
}

function markDone(userId: string) {
  getDb().prepare('UPDATE users SET survey_done = 1 WHERE id = ?').run(userId);
}

export function submitFeedback(userId: string, input: FeedbackInput) {
  ensure();
  getDb().prepare(`
    INSERT INTO feedback (user_id, rating, liked_feature, missing_text, feature_request_text, skipped, created_at)
    VALUES (?,?,?,?,?,0,?)
  `).run(userId, input.rating, input.likedFeature, input.missingText, input.featureRequestText, new Date().toISOString());
  markDone(userId);
}

export function skipFeedback(userId: string) {
  ensure();
  getDb().prepare('INSERT INTO feedback (user_id, skipped, created_at) VALUES (?, 1, ?)')
    .run(userId, new Date().toISOString());
  markDone(userId);
}

export interface FeedbackSummary {
  responses: number;
  skipped: number;
  avgRating: number | null;
  byFeature: Record<string, number>;
  recent: {
    rating: number | null; likedFeature: string | null;
    missingText: string | null; featureRequestText: string | null; createdAt: string;
  }[];
}

interface FeedbackRow {
  rating: number | null; liked_feature: string | null;
  missing_text: string | null; feature_request_text: string | null;
  skipped: number; created_at: string;
}

export function feedbackSummary(limit = 50): FeedbackSummary {
  ensure();
  const rows = getDb().prepare('SELECT * FROM feedback ORDER BY created_at DESC')
    .all() as unknown as FeedbackRow[];
  const answered = rows.filter((r) => !r.skipped);
  const byFeature: Record<string, number> = {};
  for (const r of answered) {
    if (r.liked_feature) byFeature[r.liked_feature] = (byFeature[r.liked_feature] ?? 0) + 1;
  }
  return {
    responses: answered.length,
    skipped: rows.length - answered.length,
    avgRating: answered.length
      ? answered.reduce((s, r) => s + (r.rating ?? 0), 0) / answered.length
      : null,
    byFeature,
    recent: rows.slice(0, limit).map((r) => ({
      rating: r.rating ?? null,
      likedFeature: r.liked_feature ?? null,
      missingText: r.missing_text ?? null,
      featureRequestText: r.feature_request_text ?? null,
      createdAt: r.created_at,
    })),
  };
}
