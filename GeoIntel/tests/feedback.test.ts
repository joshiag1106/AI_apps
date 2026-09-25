import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The one-time exit survey: asked once ever per account, whether answered or skipped, and
 * never blocking sign-out — Josh's call was skippable, once ever.
 */
type Store = typeof import('@/lib/feedback/store');
let s: Store;

async function makeUser(id: string, email: string) {
  const { getDb } = await import('@/lib/db');
  getDb().prepare(
    "INSERT INTO users (id, email, password_hash, plan, created_at) VALUES (?,?,'h','free',?)",
  ).run(id, email, new Date().toISOString());
}

beforeAll(async () => {
  process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-feedback-')), 'test.db');
  s = await import('@/lib/feedback/store');
  await makeUser('u1', 'a@x.example');
  await makeUser('u2', 'b@x.example');
  await makeUser('u3', 'c@x.example');
});

describe('exit survey', () => {
  it('needs the survey before an account has answered or skipped it', () => {
    expect(s.needsSurvey('u1')).toBe(true);
  });

  it('stops asking once a user submits an answer', () => {
    s.submitFeedback('u1', { rating: 5, likedFeature: 'lens', missingText: 'nothing', featureRequestText: '' });
    expect(s.needsSurvey('u1')).toBe(false);
  });

  it('stops asking once a user skips — skipping still counts as "once ever"', () => {
    expect(s.needsSurvey('u2')).toBe(true);
    s.skipFeedback('u2');
    expect(s.needsSurvey('u2')).toBe(false);
  });

  it('keeps one account’s answer out of another’s "needs survey" state', () => {
    expect(s.needsSurvey('u3')).toBe(true);
  });

  it('summarises answered responses, excluding skips, with an average rating', () => {
    s.submitFeedback('u3', { rating: 3, likedFeature: 'lens', missingText: 'x', featureRequestText: 'y' });
    const summary = s.feedbackSummary();
    expect(summary.responses).toBe(2); // u1 (5) and u3 (3); u2 skipped
    expect(summary.skipped).toBe(1);
    expect(summary.avgRating).toBe(4); // (5 + 3) / 2
    expect(summary.byFeature.lens).toBe(2);
  });
});
