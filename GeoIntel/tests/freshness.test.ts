import { describe, it, expect } from 'vitest';
import { googleNewsUrl, countryQueries, BEATS, withRecency, QUERY_WINDOW_DAYS } from '@/data/feeds';
import { expiredArticleIds, CORPUS_RETENTION_DAYS } from '@/lib/ingest/pipeline';
import { TREND_SERIES_DAYS } from '@/lib/risk';
import type { Article } from '@/lib/types';


/**
 * Google News search is relevance-ranked over all time, not recency-ranked. Left
 * unconstrained, a `台海 军演` query returns a corpus whose median item is 242 days old
 * and whose oldest predates 2010 — measured against the live feed, not assumed. Those
 * articles cannot corroborate anything, because two reports only group into one event
 * if they fall inside the 60-hour clustering window. Archival results therefore inflate
 * the corpus while suppressing the corroboration the product is built on.
 */
describe('aggregator query recency', () => {
  const q = (url: string) => decodeURIComponent(new URL(url).searchParams.get('q') ?? '');

  it('constrains every aggregator query to a recent window', () => {
    expect(q(googleNewsUrl('India China border LAC', 'en-IN'))).toMatch(/\bwhen:\d+d\b/);
  });

  it('keeps the window at or under two weeks, so results can still corroborate', () => {
    const m = q(googleNewsUrl('x', 'en-US')).match(/\bwhen:(\d+)d\b/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(14);
  });

  it('leaves the window wider than the 60h clustering window, to absorb feed lag', () => {
    expect(QUERY_WINDOW_DAYS * 24).toBeGreaterThan(60);
  });

  it('preserves the original query terms alongside the constraint', () => {
    expect(q(googleNewsUrl('中印边境', 'zh-CN'))).toContain('中印边境');
  });

  it('does not double-apply a constraint a query already carries', () => {
    expect(withRecency('台海 军演 when:3d')).toBe('台海 军演 when:3d');
    expect(q(googleNewsUrl('台海 军演 when:3d', 'zh-CN')).match(/when:/g)).toHaveLength(1);
  });

  it('constrains country queries too, not just beat queries', () => {
    for (const { locale, q: query } of countryQueries('Nepal', '尼泊尔')) {
      expect(q(googleNewsUrl(query, locale))).toMatch(/\bwhen:\d+d\b/);
    }
  });

  it('constrains every query of every configured beat', () => {
    for (const beat of BEATS) {
      for (const { locale, q: query } of beat.queries) {
        expect(q(googleNewsUrl(query, locale)), `${beat.id}: ${query}`).toMatch(/\bwhen:\d+d\b/);
      }
    }
  });
});

/**
 * Constraining intake is only half the fix. `runIngest` re-clusters the whole stored
 * corpus each run and pruned only on relevance, never on age, so archives already in
 * the database stayed there and kept suppressing corroboration. The corpus needs a
 * bound at both ends.
 */
describe('corpus retention', () => {
  const DAY = 86_400_000;
  const now = Date.parse('2026-08-30T12:00:00.000Z');
  const aged = (days: number, id: string) =>
    ({ id, publishedAt: new Date(now - days * DAY).toISOString() }) as Article;

  it('never prunes inside the window the trend series still reads', () => {
    // dyadTension builds a TREND_SERIES_DAYS-long daily series; retention must outlive it
    // or the chart silently flattens as its early buckets lose their events.
    expect(CORPUS_RETENTION_DAYS).toBeGreaterThanOrEqual(TREND_SERIES_DAYS);
  });

  it('keeps an article the trend chart still needs', () => {
    expect(expiredArticleIds([aged(TREND_SERIES_DAYS - 1, 'keep')], now)).toEqual([]);
  });

  it('drops articles past the retention horizon', () => {
    expect(expiredArticleIds([aged(CORPUS_RETENTION_DAYS + 1, 'drop')], now)).toEqual(['drop']);
  });

  it('drops the deep archive that caused the 23-year corpus span', () => {
    const ids = expiredArticleIds([aged(8328, 'sina2003'), aged(2, 'today')], now);
    expect(ids).toEqual(['sina2003']);
  });

  it('keeps an article with an unparseable date rather than silently deleting it', () => {
    // A bad date is a parser bug to investigate, not licence to destroy the row.
    expect(expiredArticleIds([{ id: 'weird', publishedAt: 'not-a-date' } as Article], now)).toEqual([]);
  });
});
