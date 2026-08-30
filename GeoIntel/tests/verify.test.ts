import { describe, it, expect } from 'vitest';
import { clusterArticles } from '@/lib/verify/cluster';
import { scoreConfidence } from '@/lib/verify/confidence';
import type { Article } from '@/lib/types';

let n = 0;
function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `a${n}`, url: `https://x/${n}`, title: 'Border talks held', outlet: 'Reuters',
    publishedAt: '2026-08-29T10:00:00.000Z', snippet: '', imageUrl: null, language: 'en',
    beatId: null, localeKey: null, sourceCountry: 'GBR', ownership: 'independent', tier: 1,
    isPrimary: false, actors: ['IND', 'CHN'], hotspots: [], domain: 'Diplomatic',
    escalation: 0, framing: 0, ladderRung: null, ladderZh: null, ladderEn: null,
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}

describe('clustering', () => {
  it('groups articles about the same incident', () => {
    const ev = clusterArticles([
      art({ title: 'Indian and Chinese troops clash at Galwan', hotspots: ['lac'], domain: 'Military' }),
      art({ title: 'Troops clash in Galwan Valley, says army', hotspots: ['lac'], domain: 'Military' }),
    ]);
    expect(ev).toHaveLength(1);
    expect(ev[0].articleIds).toHaveLength(2);
  });

  it('keeps unrelated dyads apart', () => {
    const ev = clusterArticles([
      art({ title: 'India China border talks', actors: ['IND', 'CHN'] }),
      art({ title: 'Russia Ukraine front line shifts', actors: ['RUS', 'UKR'], domain: 'Military' }),
    ]);
    expect(ev).toHaveLength(2);
  });

  it('merges a Chinese and an English report of one event via glossed terms', () => {
    const ev = clusterArticles([
      art({ title: 'China lodges solemn representations with India over border', domain: 'Diplomatic',
            glossed: ['makes solemn representations', 'Line of Actual Control (LAC)'] }),
      art({ title: '中方就边界问题向印方提出严正交涉', language: 'zh', outlet: 'Xinhua',
            sourceCountry: 'CHN', ownership: 'state', domain: 'Diplomatic',
            glossed: ['makes solemn representations', 'Line of Actual Control (LAC)'] }),
    ]);
    expect(ev).toHaveLength(1);
    expect(ev[0].languages).toEqual(expect.arrayContaining(['en', 'zh']));
  });

  it('does not merge across a long time gap', () => {
    const ev = clusterArticles([
      art({ title: 'Border talks held', publishedAt: '2026-08-01T10:00:00.000Z' }),
      art({ title: 'Border talks held', publishedAt: '2026-08-29T10:00:00.000Z' }),
    ]);
    expect(ev).toHaveLength(2);
  });
});

describe('confidence scoring', () => {
  it('scores a single source low and flags it', () => {
    const r = scoreConfidence([art()]);
    expect(r.confidence).toBeLessThan(40);
    expect(r.flags).toContain('single_source');
  });

  it('rewards independent corroboration across countries and languages', () => {
    const r = scoreConfidence([
      art({ outlet: 'Reuters', sourceCountry: 'GBR', ownership: 'independent', tier: 1 }),
      art({ outlet: 'The Hindu', sourceCountry: 'IND', ownership: 'independent', tier: 1 }),
      art({ outlet: 'Lianhe Zaobao', sourceCountry: 'SGP', ownership: 'independent', tier: 1, language: 'zh' }),
      art({ outlet: 'NHK', sourceCountry: 'JPN', ownership: 'independent', tier: 1, language: 'ja' }),
    ]);
    expect(r.confidence).toBeGreaterThan(70);
    expect(r.flags).not.toContain('single_source');
  });

  it('refuses to treat one state’s outlets as corroboration', () => {
    const stateOnly = scoreConfidence([
      art({ outlet: 'Xinhua', sourceCountry: 'CHN', ownership: 'state', tier: 2, language: 'zh' }),
      art({ outlet: 'Global Times', sourceCountry: 'CHN', ownership: 'state_affiliated', tier: 3, language: 'zh' }),
      art({ outlet: 'CCTV', sourceCountry: 'CHN', ownership: 'state', tier: 2, language: 'zh' }),
      art({ outlet: 'China Daily', sourceCountry: 'CHN', ownership: 'state', tier: 2, language: 'en' }),
    ]);
    const mixed = scoreConfidence([
      art({ outlet: 'Reuters', sourceCountry: 'GBR', ownership: 'independent', tier: 1 }),
      art({ outlet: 'The Hindu', sourceCountry: 'IND', ownership: 'independent', tier: 1 }),
    ]);
    expect(stateOnly.flags).toContain('state_media_only');
    expect(stateOnly.confidence).toBeLessThan(mixed.confidence);
  });

  it('credits an official primary source', () => {
    const withPrimary = scoreConfidence([
      art({ outlet: 'PIB', sourceCountry: 'IND', ownership: 'state', tier: 2, isPrimary: true }),
      art({ outlet: 'Reuters', sourceCountry: 'GBR', ownership: 'independent', tier: 1 }),
    ]);
    const without = scoreConfidence([
      art({ outlet: 'NDTV', sourceCountry: 'IND', ownership: 'independent', tier: 2 }),
      art({ outlet: 'Reuters', sourceCountry: 'GBR', ownership: 'independent', tier: 1 }),
    ]);
    expect(withPrimary.confidence).toBeGreaterThan(without.confidence);
    expect(withPrimary.flags).toContain('primary_sourced');
  });

  it('flags contradiction when sources deny each other', () => {
    const r = scoreConfidence([
      art({ title: 'India says Chinese troops crossed the LAC', outlet: 'The Hindu', sourceCountry: 'IND' }),
      art({ title: 'China denies any incursion across the LAC', outlet: 'Xinhua', sourceCountry: 'CHN', ownership: 'state', language: 'zh' }),
    ]);
    expect(r.flags).toContain('disputed');
  });

  it('always returns a score inside 0..100 with a signal breakdown', () => {
    const r = scoreConfidence([art()]);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(100);
    expect(r.signals.length).toBeGreaterThan(3);
    for (const s of r.signals) expect(s.points).toBeLessThanOrEqual(s.max);
  });
});

describe('IDF-weighted headline matching', () => {
  const base = { actors: ['NPL', 'CHN'], domain: 'Military' as const, hotspots: [] };

  it('merges paraphrases that share distinctive words', () => {
    const ev = clusterArticles([
      art({ ...base, title: 'Scores dead, hundreds missing in flash floods on Nepal-China border' }),
      art({ ...base, title: 'Nepal floods: dozens killed as rivers burst their banks' }),
    ]);
    expect(ev).toHaveLength(1);
  });

  it('does not merge on ubiquitous words alone', () => {
    // "china" and "border" appear all over the corpus; sharing them proves nothing.
    const filler = Array.from({ length: 60 }, (_, i) =>
      art({ ...base, title: `China border patrol update number ${i}`, publishedAt: '2026-08-29T10:00:00.000Z' }));
    const ev = clusterArticles([
      ...filler,
      art({ ...base, title: 'China border trade figures released' }),
      art({ ...base, title: 'China border tourism reopens' }),
    ]);
    expect(ev.length).toBeGreaterThan(1);
  });
});
