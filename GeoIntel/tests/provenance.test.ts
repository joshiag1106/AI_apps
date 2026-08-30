import { describe, it, expect } from 'vitest';
import { resolveSource } from '@/data/sources';
import { scoreConfidence } from '@/lib/verify/confidence';
import { clusterArticles } from '@/lib/verify/cluster';
import type { Article } from '@/lib/types';

let n = 0;
function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `p${n}`, url: `https://x/${n}`, title: 'T', outlet: 'Reuters',
    publishedAt: '2026-08-29T10:00:00.000Z', snippet: '', imageUrl: null, language: 'en',
    beatId: null, localeKey: null, sourceCountry: 'GBR', ownership: 'independent', tier: 1,
    isPrimary: false, actors: ['CHN'], hotspots: [], domain: 'Diplomatic',
    escalation: 0, framing: 0, ladderRung: null, ladderZh: null, ladderEn: null,
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}

describe('source resolution', () => {
  it('does not match outlet names inside an opaque aggregator URL', () => {
    // A real URL from the corpus. Its base64 path contains the literal substring "cnn",
    // which previously resolved Chinese-language articles to US press.
    const url = 'https://news.google.com/rss/articles/CBMiW0FVX3lxTFBZcnZzdEdsU1RsdXhXcDVzYnNvTUE3REZ6cU1YR29KT2FZbEY4MVpWckhoRHFQM2ROZlB2OUJKOFVKbnFMWDB3cnNFc2x1VjhSRw';
    expect(url.toLowerCase()).toContain('cnn');           // the collision is real
    const s = resolveSource('凤凰网科技', url);
    // Resolved from the outlet name, not from a chance substring in the redirect path.
    expect(s.country).toBe('CHN');
    expect(s.name).toBe('Phoenix (Ifeng)');

    // An outlet with no registry entry must stay unplaced rather than inherit the URL's.
    expect(resolveSource('某某网', url).country).toBe('ZZZ');
  });

  it('ignores substrings in the path of even a real publisher URL', () => {
    const s = resolveSource('', 'https://example.invalid/tag/cnn-roundup');
    expect(s.country).toBe('ZZZ');
  });

  it('still resolves from a real publisher domain', () => {
    expect(resolveSource('', 'https://www.reuters.com/world/india/x').name).toBe('Reuters');
    expect(resolveSource('Global Times', '').country).toBe('CHN');
  });

  it('gives unknown outlets the weakest tier and an unknown country', () => {
    const s = resolveSource('Some Blog', 'https://example.invalid/a');
    expect(s.tier).toBe(3);
    expect(s.country).toBe('ZZZ');
  });
});

describe('confidence ignores unknown provenance', () => {
  it('does not count an unknown country toward country diversity', () => {
    const known = scoreConfidence([
      art({ outlet: 'Reuters', sourceCountry: 'GBR' }),
      art({ outlet: 'The Hindu', sourceCountry: 'IND' }),
    ]);
    const unknown = scoreConfidence([
      art({ outlet: 'Reuters', sourceCountry: 'GBR' }),
      art({ outlet: 'Some Blog', sourceCountry: 'ZZZ', tier: 3 }),
    ]);
    const spread = (r: typeof known) => r.signals.find((s) => s.key === 'countries')!.points;
    expect(spread(known)).toBeGreaterThan(spread(unknown));
    expect(spread(unknown)).toBe(0);
  });

  it('never prints the placeholder code in the evidence text', () => {
    const r = scoreConfidence([art({ sourceCountry: 'ZZZ', outlet: 'Blog' })]);
    for (const s of r.signals) expect(s.detail).not.toContain('ZZZ');
  });
});

describe('clustering rejects shallow CJK overlap', () => {
  const base = {
    language: 'zh', sourceCountry: 'CHN', ownership: 'independent' as const,
    actors: ['CHN', 'USA'], domain: 'Diplomatic' as const,
    glossed: ['Ministry of National Defense'],
  };

  it('does not merge different stories that merely share a ministry name', () => {
    // The exact pair that merged in the live corpus: a Taiwan arms purchase and a
    // chip-maker's lawsuit, sharing only 美国 / 国防部 / 回应 and one glossed org term.
    const ev = clusterArticles([
      art({ ...base, title: '台湾地区向美国采购66架全新F-16V战机，国防部回应' }),
      art({ ...base, title: '长鑫存储回应起诉美国国防部' }),
    ]);
    expect(ev).toHaveLength(2);
  });

  it('does not let a bridging duplicate chain two unrelated stories together', () => {
    const ev = clusterArticles([
      art({ ...base, title: '台湾地区向美国采购66架全新F-16V战机，国防部回应' }),
      art({ ...base, title: '长鑫存储回应起诉美国国防部' }),
      art({ ...base, title: '长鑫存储回应起诉美国国防部 捍卫商业权益' }),
    ]);
    expect(ev).toHaveLength(2);
    expect(ev.map((e) => e.articleIds.length).sort()).toEqual([1, 2]);
  });

  it('still merges genuine duplicates of the same Chinese headline', () => {
    const ev = clusterArticles([
      art({ ...base, title: '长鑫存储回应起诉美国国防部' }),
      art({ ...base, title: '长鑫存储回应起诉美国国防部 捍卫商业权益' }),
    ]);
    expect(ev).toHaveLength(1);
  });
});

describe('analysis outlets are not corroboration', () => {
  it('classifies think tanks separately from press', () => {
    expect(resolveSource('CSIS | Center for Strategic and International Studies').ownership).toBe('analysis');
    expect(resolveSource('orfonline.org').ownership).toBe('analysis');
    expect(resolveSource('Reuters').ownership).toBe('independent');
  });

  it('does not let commentary substitute for independent reporting', () => {
    const press = scoreConfidence([
      art({ outlet: 'Reuters', sourceCountry: 'GBR', ownership: 'independent' }),
      art({ outlet: 'The Hindu', sourceCountry: 'IND', ownership: 'independent' }),
    ]);
    const thinkTanks = scoreConfidence([
      art({ outlet: 'Reuters', sourceCountry: 'GBR', ownership: 'independent' }),
      art({ outlet: 'CSIS', sourceCountry: 'USA', ownership: 'analysis' }),
    ]);
    const outlets = (r: typeof press) => r.signals.find((s) => s.key === 'outlets')!.points;
    expect(outlets(thinkTanks)).toBeLessThan(outlets(press));
  });

  it('resolves the Chinese outlets that dominate the corpus', () => {
    expect(resolveSource('美国之音').country).toBe('USA');
    expect(resolveSource('观察者').country).toBe('CHN');
    expect(resolveSource('搜狐网').ownership).toBe('state_affiliated');
    expect(resolveSource('香港01').country).toBe('HKG');
  });
});
