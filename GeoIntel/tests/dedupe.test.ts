import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dedupe } from '@/lib/ingest/pipeline';
import type { Article } from '@/lib/types';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-dedupe-')), 'test.db');

let n = 0;
function art(title: string, p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `d${String(n).padStart(4, '0')}`, url: `https://x/dedupe/${n}`,
    title, outlet: 'Test Outlet',
    publishedAt: '2026-09-30T10:00:00.000Z', snippet: '', imageUrl: null, language: 'en',
    beatId: null, localeKey: null, sourceCountry: 'IND', ownership: 'independent', tier: 2,
    isPrimary: false, actors: ['IND', 'PAK'], people: [], hotspots: [], domain: 'Military',
    escalation: 0, framing: 0, ladderRung: null, ladderZh: null, ladderEn: null,
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}

/**
 * The same-outlet headline key used to keep only ASCII letters, digits and Chinese
 * characters, so a Hindi, Russian or Arabic headline reduced to nothing and every such
 * headline from one outlet shared one empty key: the first survived, the rest were dropped
 * as "repeats". One live fetch of all 99 feeds lost 45 relevant reports a cycle this way
 * (risk R10) — on exactly the languages the product exists to read.
 */
describe('dedupe keeps distinct headlines in every script', () => {
  it.each([
    ['Hindi', 'hi', 'भारत ने पाकिस्तान को दी कड़ी चेतावनी', 'सीमा पर सेना की तैनाती बढ़ाई गई'],
    ['Russian', 'ru', 'Москва выслала польских дипломатов', 'НАТО начало учения у границ Белоруссии'],
    ['Arabic', 'ar', 'إيران تهدد بإغلاق مضيق هرمز', 'غارات إسرائيلية على جنوب لبنان'],
    ['Korean', 'ko', '북한, 동해상으로 탄도미사일 발사', '한미 연합훈련 오늘부터 시작'],
    ['Persian', 'fa', 'سپاه پاسداران رزمایش دریایی برگزار کرد', 'مذاکرات هسته‌ای در وین از سر گرفته شد'],
    ['Hebrew', 'he', 'צה"ל תקף מטרות בדרום לבנון', 'שר הביטחון נפגש עם עמיתו האמריקני'],
    ['Ukrainian', 'uk', 'Сили ППО збили російські дрони над Києвом', 'Зеленський зустрівся з прем’єром Польщі'],
  ])('%s: two different headlines from one outlet are both kept', (_script, language, a, b) => {
    const out = dedupe([art(a, { language }), art(b, { language })]);
    expect(out.map((x) => x.title)).toEqual([a, b]);
  });

  it('keeps Devanagari vowel signs, which carry meaning ("attack" vs "attacks")', () => {
    // हमला and हमले differ only in a combining vowel sign; drop the marks and they merge.
    const out = dedupe([art('सीमा पर आतंकी हमला', { language: 'hi' }), art('सीमा पर आतंकी हमले', { language: 'hi' })]);
    expect(out).toHaveLength(2);
  });
});

describe('dedupe still drops real repeats', () => {
  it('drops a same-outlet headline that differs only in case and punctuation', () => {
    const out = dedupe([art('India, China hold border talks'), art('India–China hold border talks!')]);
    expect(out).toHaveLength(1);
  });

  it('drops a same-outlet Hindi headline that differs only in punctuation', () => {
    const out = dedupe([
      art('भारत ने पाकिस्तान को दी कड़ी चेतावनी', { language: 'hi' }),
      art('भारत ने पाकिस्तान को दी कड़ी चेतावनी।', { language: 'hi' }),
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops an exact URL repeat', () => {
    const first = art('One report');
    const out = dedupe([first, art('Same report, retitled', { url: first.url })]);
    expect(out).toEqual([first]);
  });

  it('keeps the same headline from two different outlets', () => {
    const out = dedupe([art('Talks resume in Geneva'), art('Talks resume in Geneva', { outlet: 'Other Outlet' })]);
    expect(out).toHaveLength(2);
  });
});
