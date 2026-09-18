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
    isPrimary: false, actors: ['CHN'], people: [], hotspots: [], domain: 'Diplomatic',
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

describe('outlets the live corpus could not place', () => {
  /*
   * Measured on the production database 2026-09-18: 387 DISTINCT outlets resolved to ZZZ.
   * That is not cosmetic. lib/verify/confidence.ts deliberately excludes ZZZ from the
   * independent-country count, so every article from an unplaced outlet contributes NOTHING
   * to the corroboration score — the number this whole product rests on. Placing a real
   * publisher is therefore a direct, immediate improvement to scoring across the corpus.
   *
   * Only outlets identifiable with confidence are added. The rest stay ZZZ on purpose:
   * aggregators and social hosts (Head Topics, facebook.com, Yahoo!ニュース) must NEVER be
   * placed, because they republish. Placing them as `independent` would manufacture
   * corroboration out of the same story echoed — precisely the failure the ownership column
   * exists to prevent. Unplaced already means "does not count", which is the right answer
   * for them.
   */
  it.each([
    ['Patrika News', 'IND'],
    ['tv9hindi.com', 'IND'],
    ['newindianexpress.com', 'IND'],
    ['Rediff', 'IND'],
    ['theweek.in', 'IND'],
    ['prabhatkhabar.com', 'IND'],
    ['bhaskarhindi.com', 'IND'],
    ['Ynetnews', 'ISR'],
    ['The Times of Israel', 'ISR'],
    ['The Kyiv Independent', 'UKR'],
    ['united24media.com', 'UKR'],
    ['Taipei Times', 'TWN'],
    ['三立新聞', 'TWN'],
    ['on.cc東網', 'HKG'],
    ['星島頭條', 'HKG'],
    ['chinanews.com.cn', 'CHN'],
    ['朝鮮日報中文版', 'KOR'],
    ['아시아경제', 'KOR'],
    ['매일경제', 'KOR'],
    ['Sin Chew Daily', 'MYS'],
    ['orientaldaily.com.my', 'MYS'],
    ['Vietnam.vn', 'VNM'],
    ['PBS', 'USA'],
    ['The Independent', 'GBR'],
  ])('places %s in %s', (outlet, iso) => {
    expect(resolveSource(outlet).country).toBe(iso);
  });

  it('records government outlets as state, not independent', () => {
    // These are primary government sources. Counting them as independent corroboration
    // would let a ministry corroborate itself.
    expect(resolveSource('ddnews.gov.in').ownership).toBe('state');
    expect(resolveSource('US Department of Defense').ownership).toBe('state');
    expect(resolveSource('chinanews.com.cn').ownership).toBe('state');
    expect(resolveSource('Vietnam.vn').ownership).toBe('state');
  });

  it('leaves aggregators and social hosts unplaced, because they republish', () => {
    // The whole point of the ZZZ bucket. An aggregator carrying a wire story is not a
    // second witness to it, and placing one would inflate every cluster it touches.
    expect(resolveSource('Head Topics').country).toBe('ZZZ');
    expect(resolveSource('facebook.com').country).toBe('ZZZ');
    expect(resolveSource('Yahoo!ニュース').country).toBe('ZZZ');
  });

  it('does not let The Kyiv Independent collide with The Independent', () => {
    // "the kyiv independent" contains "independent". A short match key here would place a
    // Ukrainian outlet in Britain, and the two would then corroborate each other as though
    // they were separate countries.
    expect(resolveSource('The Kyiv Independent').country).toBe('UKR');
    expect(resolveSource('The Independent').country).toBe('GBR');
  });

  it('places Iran International where it operates, not where it broadcasts to', () => {
    // London-based and Persian-language. Placing it in IRN would be wrong twice over: it is
    // not Iranian state media, and treating it as an Iranian domestic source would make it
    // corroborate Tehran's own outlets on the country count.
    expect(resolveSource('Iran International').country).toBe('GBR');
    expect(resolveSource('Iran International').ownership).not.toBe('state');
  });
});

describe('outlet names that arrive as bare hostnames', () => {
  /*
   * A whole CLASS of unplaced outlet, found 2026-09-18 while placing the long tail: feeds
   * sometimes give the outlet as a hostname rather than a masthead, and a name-shaped match
   * key cannot see it. "times of india" does not appear in "timesofindia.indiatimes.com" —
   * the spaces are gone — and neither does "toi". So the single largest Indian daily was
   * resolving to ZZZ and contributing nothing to corroboration, despite having been
   * registered in this table since the beginning.
   *
   * Fixed by ALSO comparing with punctuation and whitespace stripped from both sides, as an
   * additional pass rather than a replacement — it can only add matches, never remove one.
   */
  it('places a registered masthead given as a hostname', () => {
    expect(resolveSource('timesofindia.indiatimes.com').country).toBe('IND');
    expect(resolveSource('timesofindia.indiatimes.com').name).toBe('The Times of India');
  });

  it('still does not confuse two mastheads that share a word', () => {
    // The collision this normalisation could plausibly introduce. Stripping spaces makes
    // "the independent" into "theindependent", which must still not be found inside
    // "thekyivindependent".
    expect(resolveSource('The Kyiv Independent').country).toBe('UKR');
    expect(resolveSource('The Independent').country).toBe('GBR');
  });

  it('does not start placing aggregators by accident', () => {
    expect(resolveSource('Head Topics').country).toBe('ZZZ');
    expect(resolveSource('facebook.com').country).toBe('ZZZ');
  });
});
