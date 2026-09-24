// tests/demo-select-lens.test.ts
import { describe, it, expect } from 'vitest';
import { selectLens } from '@/lib/demo/select';
import { describeSharpest, type BeatLens, type LensColumn } from '@/lib/lens/compare';
import { input } from './fixtures/demo-fixtures';

const CASINO = '众赢国际手机版_体育_8·15日本政要又“拜鬼”，中方严正交涉强烈抗议';

const col = (p: Partial<LensColumn> = {}): LensColumn => ({
  language: 'en', articles: 300, outlets: 90, classified: 200,
  asked: [{ q: 'India Pakistan border', en: null }],
  framing: [{ key: 'Diplomatic', count: 150, share: 0.75 }, { key: 'Military', count: 50, share: 0.25 }],
  others: [],
  latest: [{ id: 'a1', title: 'Talks resume at the border', titleEn: null, outlet: 'The Hindu', publishedAt: '2026-09-19T00:00:00.000Z', eventId: null }],
  ...p,
});

const topic = (p: Partial<BeatLens> = {}): BeatLens => ({
  id: 'ind-pak', label: 'India–Pakistan', dyad: ['IND', 'PAK'],
  since: '2026-06-20T00:00:00.000Z', until: '2026-09-20T00:00:00.000Z',
  columns: [col({ language: 'hi' }), col({ language: 'zh' })],
  sharpest: { domain: 'Military', high: { language: 'zh', share: 0.95 }, low: { language: 'hi', share: 0.25 }, z: 9 },
  ...p,
});

describe('chapter 3 — Language Lens', () => {
  it('takes the topic with the widest gap, and puts the language that frames it more first', () => {
    const narrow = topic({ id: 'chn-usa', label: 'China–United States',
      sharpest: { domain: 'Technology', high: { language: 'en', share: 0.39 }, low: { language: 'zh', share: 0.04 }, z: 12 } });
    const d = selectLens(input({ lens: [narrow, topic()] }))!;
    expect(d.topic).toBe('India–Pakistan');
    expect(d.domain).toBe('Military');
    expect(d.high.language).toBe('zh');
    expect(d.low.language).toBe('hi');
  });

  it('breaks a tie in width by the stronger test', () => {
    const weak = topic({ id: 'weak', label: 'Weak', sharpest: { domain: 'Military', high: { language: 'zh', share: 0.95 }, low: { language: 'hi', share: 0.25 }, z: 3 } });
    expect(selectLens(input({ lens: [weak, topic()] }))!.topic).toBe('India–Pakistan');
  });

  it('prints the same sentence the Lens page prints', () => {
    const t = topic();
    expect(selectLens(input({ lens: [t] }))!.sentence).toBe(describeSharpest(t.sharpest!));
  });

  // Lens calls out a difference only when it passes its own test; a topic without one has nothing to show.
  it('is null when no topic has a difference that passed the test, or there are no topics', () => {
    expect(selectLens(input({ lens: [topic({ sharpest: null })] }))).toBeNull();
    expect(selectLens(input({ lens: [] }))).toBeNull();
  });

  it('shows at most three framings a side, always including the one that differs', () => {
    const many = col({ language: 'hi', framing: [
      { key: 'Diplomatic', count: 40, share: 0.4 }, { key: 'Economic', count: 20, share: 0.2 },
      { key: 'Internal', count: 10, share: 0.1 }, { key: 'Cyber', count: 5, share: 0.05 },
      { key: 'Military', count: 4, share: 0.04 },
    ] });
    const d = selectLens(input({ lens: [topic({ columns: [many, col({ language: 'zh' })] })] }))!;
    expect(d.low.framing.map((f) => f.key)).toEqual(['Diplomatic', 'Economic', 'Military']);
  });

  it('carries each side\'s size, what it was asked, and its newest headline', () => {
    const d = selectLens(input({ lens: [topic({ columns: [
      col({ language: 'hi', articles: 120, classified: 80, asked: [{ q: 'भारत पाकिस्तान', en: 'India Pakistan' }, { q: 'second', en: null }] }),
      col({ language: 'zh', latest: [{ id: 'z1', title: '印巴冲突', titleEn: 'India–Pakistan conflict', outlet: '环球网', publishedAt: '2026-09-18T00:00:00.000Z', eventId: 'e1' }] }),
    ] })] }))!;
    expect(d.low).toMatchObject({ articles: 120, classified: 80, asked: { q: 'भारत पाकिस्तान', en: 'India Pakistan' } });
    expect(d.high.headline).toEqual({ title: '印巴冲突', english: 'India–Pakistan conflict', outlet: '环球网' });
  });

  // Chapter 2 refuses to animate the word-by-word dictionary join as if it were a translation, and so does
  // this one: the English line is the stored key terms, or the curated Japanese glossary, or nothing.
  it('gives a headline only an English line it can stand behind', () => {
    const h = (title: string, titleEn: string | null) =>
      [{ id: title, title, titleEn, outlet: 'O', publishedAt: '2026-09-18T00:00:00.000Z', eventId: null }];
    const d = selectLens(input({ lens: [topic({
      columns: [col({ language: 'hi', latest: h('भारत पाकिस्तान तनाव', null) }), col({ language: 'zh', latest: h('中方回应印巴局势', null) })],
    })] }))!;
    expect(d.high.headline!.english).toBeNull();
    expect(d.low.headline!.english).toBeNull();

    const ja = selectLens(input({ lens: [topic({
      columns: [col({ language: 'hi' }), col({ language: 'ja', latest: h('日中首脳会談で台湾問題', null) })],
      sharpest: { domain: 'Military', high: { language: 'ja', share: 0.9 }, low: { language: 'hi', share: 0.25 }, z: 9 },
    })] }))!;
    expect(ja.high.headline!.english).toBe('Japan–China · summit · Taiwan');
  });

  it('skips a junk headline for the next one, and shows none rather than junk', () => {
    const junk = { id: 'j', title: CASINO, titleEn: null, outlet: 'Spam', publishedAt: '2026-09-19T00:00:00.000Z', eventId: null };
    const real = { id: 'r', title: '中方回应印巴局势', titleEn: null, outlet: '新华网', publishedAt: '2026-09-17T00:00:00.000Z', eventId: null };
    const d = selectLens(input({ lens: [topic({ columns: [col({ language: 'hi', latest: [junk] }), col({ language: 'zh', latest: [junk, real] })] })] }))!;
    expect(d.high.headline!.title).toBe('中方回应印巴局势');
    expect(d.low.headline).toBeNull();
  });

  it('has no search to show for a side whose reports all came back from another language\'s search', () => {
    const d = selectLens(input({ lens: [topic({ columns: [col({ language: 'hi', asked: [] }), col({ language: 'zh' })] })] }))!;
    expect(d.low.asked).toBeNull();
  });
});
