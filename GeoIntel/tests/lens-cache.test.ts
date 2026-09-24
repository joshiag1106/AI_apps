// tests/lens-cache.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { art } from './fixtures/demo-fixtures';
import { MIN_ARTICLES } from '@/lib/lens/compare';

/**
 * lensData scores every topic-search report's wording — hundreds of milliseconds on the real corpus,
 * paid by /lens and /demo on every request. Its inputs change only when an ingest runs, and an ingest
 * stamps `last_ingest` after its last write, so the result is kept until that stamp moves.
 */
describe('lensData', () => {
  let db: typeof import('@/lib/db');
  let queries: typeof import('@/lib/queries');
  const reports = (language: string, n = MIN_ARTICLES) =>
    Array.from({ length: n }, () => art({ language, beatId: 'ind-chn', ladderRung: null, title: `India China border talks ${language}` }));

  beforeAll(async () => {
    process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-lens-cache-')), 'test.db');
    db = await import('@/lib/db');
    queries = await import('@/lib/queries');
    db.upsertArticles([...reports('en'), ...reports('zh')]);
    db.setMeta('last_ingest', '2026-09-24T10:00:00.000Z');
  });

  it('computes the topics from the stored reports', () => {
    const beat = queries.lensData().find((b) => b.id === 'ind-chn');
    expect(beat?.columns.map((c) => c.language).sort()).toEqual(['en', 'zh']);
  });

  it('keeps its result while the last ingest has not moved, even if the table has', () => {
    const first = queries.lensData();
    db.upsertArticles(reports('hi'));
    expect(queries.lensData()).toBe(first);
  });

  it('recomputes once an ingest stamps a new time', () => {
    db.setMeta('last_ingest', '2026-09-24T11:00:00.000Z');
    const beat = queries.lensData().find((b) => b.id === 'ind-chn');
    expect(beat?.columns.map((c) => c.language).sort()).toEqual(['en', 'hi', 'zh']);
  });
});
