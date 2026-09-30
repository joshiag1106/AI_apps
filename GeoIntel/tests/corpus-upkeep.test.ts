import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Article, GeoEvent } from '@/lib/types';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-upkeep-')), 'test.db');

// Building and clustering eight thousand rows takes a few seconds, more under a parallel run.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const DAY = 86_400_000;
const NOW = Date.now();

/** A token no other synthetic headline shares, so recent rows stay singletons and cluster fast. */
function tag(i: number): string {
  let s = '';
  do { s = String.fromCharCode(97 + (i % 26)) + s; i = Math.floor(i / 26); } while (i > 0);
  return `zq${s}`;
}

let n = 0;
function art(title: string, publishedMs: number, p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `u${String(n).padStart(6, '0')}`, url: `https://x/upkeep/${n}`,
    title, outlet: `Outlet ${n % 7}`,
    publishedAt: new Date(publishedMs).toISOString(), snippet: '', imageUrl: null, language: 'en',
    beatId: null, localeKey: null, sourceCountry: 'IND', ownership: 'independent', tier: 2,
    isPrimary: false, actors: ['IND', 'PAK'], people: [], hotspots: [], domain: 'Military',
    escalation: 0, framing: 0, ladderRung: null, ladderZh: null, ladderEn: null,
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}

/**
 * The ingest used to read only the newest 8,000 stored articles when it re-checked, expired
 * and clustered the corpus (risk R1). Past that size, nothing failed: the oldest rows were
 * simply never looked at, so rows past the retention limit were never deleted and rows
 * within it never reached an event, a risk index or the 90-day trend.
 */
describe('corpus upkeep sees every stored article', () => {
  let events: GeoEvent[];
  let olderIds: string[];
  let remaining: Article[];
  let retentionDays: number;

  beforeAll(async () => {
    const db = await import('@/lib/db');
    const pipeline = await import('@/lib/ingest/pipeline');
    retentionDays = pipeline.CORPUS_RETENTION_DAYS;

    // 8,000 recent reports fill the old read window completely.
    const recent = Array.from({ length: 8000 }, (_, i) =>
      art(`${tag(i)} ${tag(i + 100_000)} briefing`, NOW - (i % 5) * DAY - i * 1000));

    // Ten corroborated stories from 60 days ago: inside retention, but older than every
    // recent row, so they rank 8,001st to 8,020th.
    const older = Array.from({ length: 10 }, (_, s) => {
      const t = NOW - 60 * DAY - s * 3 * DAY;
      const title = `${tag(200_000 + s)} ${tag(300_000 + s)} ${tag(400_000 + s)} standoff`;
      return [art(title, t, { outlet: 'Wire A' }), art(title, t + 3_600_000, { outlet: 'Wire B', sourceCountry: 'PAK' })];
    }).flat();
    olderIds = older.map((a) => a.id);

    // Thirty reports past the retention limit.
    const expired = Array.from({ length: 30 }, (_, i) =>
      art(`${tag(500_000 + i)} ${tag(600_000 + i)} archive`, NOW - (retentionDays + 10) * DAY - i * DAY));

    db.upsertArticles([...recent, ...older, ...expired]);

    ({ events } = pipeline.maintainCorpus());
    remaining = db.allArticles(1_000_000);
  });

  it('deletes every article past the retention limit, however many newer ones there are', () => {
    const cutoff = NOW - retentionDays * DAY;
    const overdue = remaining.filter((a) => Date.parse(a.publishedAt) < cutoff);
    expect(overdue).toHaveLength(0);
  });

  it('clusters articles older than the newest 8,000 into events', () => {
    const clustered = new Set(events.flatMap((e) => e.articleIds));
    expect(olderIds.filter((id) => !clustered.has(id))).toEqual([]);
  });
});

/**
 * A stored report's escalation is computed once, when it is stored, and most reports are never
 * fetched again — so a lexicon fix (R11: "coup" no longer fires in "couple") would reach only new
 * reports, and the Board would mix two scorings for 90 days. The upkeep already re-scores every
 * stored row to re-check relevance; it now keeps the corrected escalation too.
 */
describe('corpus upkeep brings stored escalation up to date', () => {
  it('rewrites a stored score the current lexicon no longer gives', async () => {
    const db = await import('@/lib/db');
    const { maintainCorpus } = await import('@/lib/ingest/pipeline');
    const { scoreText } = await import('@/lib/analyze/score');

    const title = `${tag(700_000)} couple wins coupon draw`;
    // 14 is what the old substring matcher gave: "coup" (+9) found in "couple", scaled by 1.6.
    const stale = art(title, NOW - DAY, { escalation: 14 });
    db.upsertArticles([stale]);

    maintainCorpus();

    const stored = db.articlesByIds([stale.id])[0];
    expect(stored.escalation).toBe(scoreText(title).escalation);
    expect(stored.escalation).toBe(0);
  });
});
