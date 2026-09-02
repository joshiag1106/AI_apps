import { describe, it, expect } from 'vitest';
import { clusterArticles } from '@/lib/verify/cluster';
import type { Article } from '@/lib/types';

/**
 * Chaining is the failure mode this file exists to prevent.
 *
 * Union-find merges on a single related pair, so A-B and B-C put A and C in one event even
 * when they have nothing to do with each other. That is survivable in a small corpus and
 * not in a large one: at 3,336 articles it produced a 393-article "event" holding 11.8% of
 * all reporting and 41 of 65 tracked states — Nepal floods, Xi in Egypt, strikes on
 * Ukraine and a Leipzig drone incident in one cluster, with a confidence score of 71
 * feeding all 41 of those countries' risk vectors.
 *
 * Two threshold tweaks were tried first and both failed; they are kept in
 * docs/experiments/. The fix has to be a cohesion rule: an article joins a cluster by
 * matching the cluster, not by matching one member of it.
 */

let n = 0;
function art(title: string, p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `c${n}`, url: `https://x/${n}`, title, outlet: 'Reuters',
    publishedAt: '2026-09-02T10:00:00.000Z', snippet: '', imageUrl: null, language: 'en',
    beatId: null, localeKey: null, sourceCountry: 'GBR', ownership: 'independent', tier: 1,
    isPrimary: false, actors: ['CHN'], hotspots: [], domain: 'Diplomatic',
    escalation: 0, framing: 0, ladderRung: null, ladderZh: null, ladderEn: null,
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}

const sizes = (arts: Article[]) =>
  clusterArticles(arts).map((e) => e.articleIds.length).sort((a, b) => b - a);

describe('cluster cohesion', () => {
  it('keeps a genuinely cohesive story in one event', () => {
    // Every headline carries the same two distinctive terms, so every pair is related.
    const story = ['tremors', 'rescue', 'toll', 'relief', 'survivors'].map((w) =>
      art(`glacier collapse ${w} reported`));
    expect(sizes(story)).toEqual([5]);
  });

  it('refuses an article that matches only one member of a cluster', () => {
    // The chain: five mutually-related reports, plus an outsider that shares distinctive
    // words with exactly one of them and nothing with the rest. Union-find alone admits it
    // and the cluster becomes six; matching the cluster rather than a member keeps it out.
    const story = ['tremors', 'rescue', 'toll', 'relief'].map((w) =>
      art(`glacier collapse ${w} reported`));
    story.push(art('glacier collapse bridge tariff quota'));
    const outsider = art('bridge tariff quota dispute widens');

    const result = sizes([...story, outsider]);
    expect(result[0]).toBeLessThanOrEqual(5);
    expect(result).toContain(1);
  });

  it('reunites a story that seeded as two clusters', () => {
    // Assignment alone cannot do this: a report joins one cluster and never bridges two,
    // so a heavily-covered story can come apart. The merge pass puts it back together —
    // justified across all of both clusters, not by the single pair that found them.
    const wave = ['tremors', 'rescue', 'toll', 'relief', 'survivors', 'shelter'].map((w) =>
      art(`glacier collapse ${w} reported`));
    expect(sizes(wave)).toEqual([6]);
  });

  it('does not let one loose article weld two unrelated stories together', () => {
    // The 393-article blob in miniature: two real stories and a headline that happens to
    // touch both. Whichever it joins, the two stories must not become one event.
    const flood = ['tremors', 'rescue', 'toll'].map((w) => art(`glacier collapse ${w} reported`));
    const trade = ['tariff', 'quota', 'levy'].map((w) => art(`semiconductor export ${w} widens`));
    const bridge = art('glacier collapse semiconductor export');

    const result = sizes([...flood, ...trade, bridge]);
    expect(result[0]).toBeLessThanOrEqual(4);
  });
});
