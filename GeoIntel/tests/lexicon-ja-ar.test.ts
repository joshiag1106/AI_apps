// tests/lexicon-ja-ar.test.ts
import { describe, it, expect } from 'vitest';
import { evidencedDomain } from '@/lib/analyze/score';

/**
 * Japanese and Arabic framing vocabulary. Until 2026-09-24 the lexicon read only 5% of Japanese and 4% of
 * Arabic topic-search reports, so Language Lens could not say how either language framed anything. A word
 * is added only if the language it is compared with in Lens counts its counterpart. Since the shared concept
 * list (data/concepts.ts) these are ordinary concepts; the guards below still hold.
 *
 * Headlines are real ones from the corpus unless marked otherwise.
 */
const cases: [string, string, ReturnType<typeof evidencedDomain>][] = [
  // Japanese, compared with Chinese in China–Taiwan: only counterparts of the Chinese line.
  ['ja', '中国軍、台湾海峡で２日間の実弾射撃演習の予定公表…台湾有事を想定した演習か', 'Military'],
  ['ja', '【分析】中国共産党軍の粛清続く 台湾包囲演習で衝突リスク高まる', 'Military'],
  ['ja', '中国空母「福建」が台湾海峡航行 動向を「綿密に監視」、画像公開', 'Maritime'],
  ['ja', '台湾の頼清徳総統、日本の超党派「台湾海峡の平和考える議員の会」訪問団と会談', 'Diplomatic'],
  ['ja', '台湾の政府機関にサイバー攻撃', 'Cyber'], // constructed
  ['ja', '日本産水産物の輸入停止、関税引き上げも', 'Economic'], // constructed
  // Arabic, compared with English in the Middle East: only counterparts of the English line and LEXICON.
  ['ar', '10 قتلى بينهم عائلة كاملة في تصعيد الغارات الإسرائيلية جنوب لبنان', 'Military'],
  ['ar', 'تصعيد إسرائيلي متواصل في جنوب سوريا.. توغلات ومداهمات وإطلاق نار', 'Military'],
  ['ar', 'بعد تهديدات نتنياهو.. رد إيراني صادم: النووي هو الحل لردع إسرائيل', 'Nuclear'],
  ['ar', 'قطر تحذر من انفجار إقليمي بسبب مضيق هرمز.. وتتهم إسرائيل باستغلال التصعيد', 'Maritime'],
  ['ar', '"مستعد لإفلاسهم".. سفير أمريكا لدى إسرائيل يكشف عن تصعيد جديد في سياسة', 'Diplomatic'],
  ['ar', 'لبنان في زمن انتخابات إسرائيل.. هل يصبح التصعيد "عين العقل"؟', 'Internal'],
  ['ar', 'الصحف العالمية اليوم: تصعيد جديد من ترامب في حرب الجمارك الكندية', 'Economic'],
];

describe('Japanese and Arabic framing vocabulary', () => {
  it.each(cases)('%s: %s → %s', (_lang, headline, domain) => {
    expect(evidencedDomain(headline)).toBe(domain);
  });

  // The Arabic search asks for تصعيد (escalation) itself, so it is in most Arabic reports; and 台湾有事
  // ("a Taiwan contingency") recurs in Japanese. Neither says WHICH kind of pressure, so neither frames.
  it('reads no framing into "escalation" or "contingency" alone', () => {
    expect(evidencedDomain('تصعيد إيراني إسرائيلي')).toBeNull();
    expect(evidencedDomain('台湾有事って？')).toBeNull();
  });

  // 通信 would be "telecom", but the corpus meets it almost only inside 時事通信, a news agency whose name
  // aggregators append to headlines; and حدود ("borders") is mostly figurative ("limits on escalation").
  // With one shared concept list the pairwise rule is no longer needed: English now counts strikes,
  // missiles and negotiations too, so Arabic can.
  it('reads strikes, missiles and negotiations the same way in Arabic and English', () => {
    expect(evidencedDomain('ضربات أمريكية على إيران')).toBe(evidencedDomain('US strikes on Iran'));
    expect(evidencedDomain('صواريخ إيران وحزب الله')).toBe(evidencedDomain('Missiles from Iran and Hezbollah'));
    expect(evidencedDomain('إيران تضع 7 شروط لبدء المفاوضات')).toBe(evidencedDomain('Iran sets seven conditions for negotiations'));
  });

  it('does not frame an outlet tag or a figurative "border"', () => {
    expect(evidencedDomain('（時事通信）')).toBeNull();
    expect(evidencedDomain('تركيا ليست إيران.. كيف تفرض أنقرة حدودًا على التصعيد الإسرائيلي؟')).toBeNull();
  });
});
