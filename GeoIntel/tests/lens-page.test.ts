import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LensBeat } from '@/components/LensBeat';
import type { BeatLens, LensColumn } from '@/lib/lens/compare';

/** One Language Lens section, rendered as the page renders it. */

const col = (p: Partial<LensColumn> = {}): LensColumn => ({
  language: 'en', articles: 300, classified: 280, outlets: 90, asked: [{ q: 'India China border LAC', en: null }],
  framing: [{ key: 'Diplomatic', count: 180, share: 0.6 }, { key: 'Military', count: 100, share: 1 / 3 }],
  others: [{ key: 'PAK', count: 30, share: 0.1 }],
  latest: [{ id: 'a1', title: 'Talks resume', titleEn: null, outlet: 'The Hindu', publishedAt: '2026-09-19T00:00:00.000Z', eventId: 'evt-1' }],
  ...p,
});

const BEAT: BeatLens = {
  id: 'ind-chn', label: 'India–China', dyad: ['IND', 'CHN'],
  since: '2026-06-20T00:00:00.000Z', until: '2026-09-20T00:00:00.000Z',
  columns: [col(), col({
    language: 'zh', asked: [{ q: '中印关系', en: 'China–India relations' }],
    latest: [{ id: 'a2', title: '中印边境', titleEn: 'China–India border', outlet: '环球网', publishedAt: '2026-09-18T00:00:00.000Z', eventId: null }],
  })],
  sharpest: { domain: 'Military', high: { language: 'en', share: 1 / 3 }, low: { language: 'zh', share: 0.18 }, z: 4.3 },
};

const html = (b: BeatLens) => renderToStaticMarkup(createElement(LensBeat, { beat: b, names: { PAK: 'Pakistan' } }));

describe('a Language Lens section', () => {
  const out = html(BEAT);

  it('names the topic and each language', () => {
    expect(out).toContain('India–China');
    expect(out).toContain('English');
    expect(out).toContain('Chinese');
  });

  it('shows what each language was asked, with the English gloss', () => {
    expect(out).toContain('中印关系');
    expect(out).toContain('China–India relations');
  });

  it('states the sharpest difference in plain numbers', () => {
    expect(out).toContain('military framing');
    expect(out).toContain('33%');
    expect(out).toContain('18%');
  });

  it('says so plainly when no difference clears the bar', () => {
    expect(html({ ...BEAT, sharpest: null })).toContain('No framing difference large enough to call out');
  });

  it('names other states by name, not code', () => {
    expect(out).toContain('Pakistan');
  });

  it('links a headline to its event, marks its language, and glosses it', () => {
    expect(out).toContain('href="/events/evt-1"');
    expect(out).toMatch(/lang="zh"[^>]*>中印边境/);
    expect(out).toContain('China–India border');
  });

  it('says how many reports the framing was read from', () => {
    expect(out).toContain('280 of 300');
  });

  it("says plainly when a language's framing cannot be read, instead of showing bars", () => {
    const ja = col({ language: 'ja', articles: 130, classified: 4, framing: [] });
    const page = html({ ...BEAT, columns: [BEAT.columns[0], ja] });
    expect(page).toContain('4 of 130');
    expect(page).toContain('cannot be read');
  });

  it("says where a column's reports came from when no search was in its language", () => {
    expect(html({ ...BEAT, columns: [col({ asked: [] }), BEAT.columns[1]] })).toContain('another language');
  });
});
