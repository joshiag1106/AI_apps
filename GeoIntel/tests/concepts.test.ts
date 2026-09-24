import { describe, it, expect } from 'vitest';
import { CONCEPTS, NEUTRAL, REQUIRED_LANGS } from '@/data/concepts';
import { matchConcepts, topDomain } from '@/lib/analyze/concepts';
import type { Domain } from '@/data/lexicon';

const kind = (t: string) => topDomain(matchConcepts(t));

describe('the concept table', () => {
  it('gives every concept a word in every required language, or a stated reason why not', () => {
    const missing = CONCEPTS.flatMap((c) => REQUIRED_LANGS
      .filter((l) => !(c.terms[l]?.length) && !c.gaps?.[l])
      .map((l) => `${c.id}: ${l}`));
    expect(missing).toEqual([]);
  });

  it('never gives a stated gap AND words for the same language', () => {
    const both = CONCEPTS.flatMap((c) => Object.keys(c.gaps ?? {}).filter((l) => (c.terms as Record<string, string[] | undefined>)[l]?.length).map((l) => `${c.id}: ${l}`));
    expect(both).toEqual([]);
  });

  it('never puts one word in two concepts', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const c of CONCEPTS) for (const list of Object.values(c.terms)) for (const t of list ?? []) {
      const k = t.toLowerCase();
      const prev = owner.get(k);
      if (prev && prev !== c.id) clashes.push(`${k}: ${prev} / ${c.id}`);
      owner.set(k, c.id);
    }
    expect(clashes).toEqual([]);
  });

  it('has unique ids', () => {
    expect(new Set(CONCEPTS.map((c) => c.id)).size).toBe(CONCEPTS.length);
  });

  // A neutral phrase exists to mask a concept word inside it; one that contains none does nothing.
  it('keeps only neutral phrases that contain a concept word', () => {
    const words = CONCEPTS.flatMap((c) => Object.values(c.terms).flat()).map((t) => t!.toLowerCase());
    expect(NEUTRAL.filter((n) => !words.some((w) => n.toLowerCase().includes(w)))).toEqual([]);
  });
});

/**
 * Every word that counted before 2026-09-24 (DOMAIN_HINTS, and LEXICON entries that carried a domain) still
 * counts for the same kind — unless retired below with the reason.
 */
const LEGACY: Record<Domain, string[]> = {
  Military: ['army', 'troops', 'soldier', 'border', 'brigade', 'artillery', 'drone strike', 'battalion', '军', '边境', '部队', 'सेना', 'सैनिक',
    '軍', '国境', '部隊', 'جيش', 'قوات', 'جنود', 'حدودي', 'اجتياح', 'توغل', 'اشتباك', 'غارات', 'تعبئة', 'مناورات',
    'invasion', 'airstrike', 'missile strike', 'incursion', 'troops killed', 'casualties', 'clash', 'skirmish', 'standoff', 'mobilisation',
    'mobilization', 'troop buildup', 'ceasefire violation', 'infiltration', 'airspace violation', 'live-fire', 'military exercise', 'war game',
    'scrambled jets', 'disengagement', 'troop withdrawal', 'घुसपैठ', 'हमला', 'झड़प', 'सीमा विवाद', 'наступление', 'обстрел', 'удар', 'мобилизация',
    'حملہ', 'غارة'],
  Maritime: ['navy', 'naval', 'warship', 'submarine', 'shoal', 'strait', 'vessel', '海军', '军舰', '航母', 'नौसेना', '海軍', '軍艦', '空母',
    'مضيق', 'بحري', 'سفينة', 'سفن', 'غواصة', 'حاملة طائرات', 'خفر السواحل', 'حصار', 'blockade', 'freedom of navigation', 'water cannon', 'coast guard'],
  Cyber: ['cyber', 'hacker', 'malware', 'phishing', 'apt group', 'network intrusion', '网络攻击', '黑客', 'साइबर', 'サイバー攻撃', 'ハッカー',
    'سيبراني', 'قراصنة', 'تجسس', 'cyberattack', 'data breach', 'ransomware', 'espionage', 'spyware', 'critical infrastructure', 'disinformation'],
  Economic: ['trade', 'tariff', 'export', 'import', 'investment', 'currency', 'gdp', '贸易', '关税', 'व्यापार', '貿易', '関税',
    'تجارة', 'تجاري', 'جمارك', 'جمركية', 'صادرات', 'واردات', 'استثمار', 'sanctions', 'trade war', 'embargo', 'rare earth', 'trade deal',
    'sanctions lifted', 'санкции', 'عقوبات', 'تحریم'],
  Energy: ['oil', 'gas', 'lng', 'refinery', 'pipeline', 'crude', 'nuclear plant', '石油', '天然气', 'तेल', '天然ガス', 'نفط', 'الغاز', 'أنابيب',
    'مصفاة', 'oil supply', 'strait closure'],
  Space: ['satellite', 'orbit', 'launch vehicle', 'space station', 'isro', '卫星', 'उपग्रह', '衛星', 'قمر صناعي', 'أقمار صناعية', 'anti-satellite',
    'satellite jamming'],
  Nuclear: ['nuclear', 'warhead', 'icbm', 'uranium', 'iaea', 'परमाणु', 'نووي', 'نووى', 'يورانيوم', 'تخصيب', 'nuclear test', 'ballistic missile',
    'hypersonic', 'enrichment'],
  Diplomatic: ['summit', 'ambassador', 'foreign minister', 'treaty', 'communique', 'visit', '外交', '会晤', 'राजनयिक', '会談', 'هدنة', 'قمة', 'سفير',
    'وزير الخارجية', 'معاهدة', 'زيارة', 'expelled diplomat', 'recalled ambassador', 'summoned envoy', 'ceasefire', 'peace talks', 'de-escalation',
    'agreement signed', 'resumed flights', 'normalisation', 'normalization', 'bilateral talks', 'prisoner exchange', 'युद्धविराम', 'वार्ता', 'समझौता',
    'перемирие', 'переговоры', 'جنگ بندی', 'مذاکرات', 'وقف إطلاق النار'],
  Internal: ['riot', 'election', 'militant', 'separatist', 'crackdown', 'curfew', '骚乱', 'विद्रोह', '暴動', 'انتخابات', 'احتجاجات', 'انقلاب',
    'هجوم إرهابي', 'شغب', 'قمع', 'حظر تجول', 'terror attack', 'insurgency', 'coup', 'unrest', 'आतंकी'],
  Technology: ['semiconductor', 'chip', 'ai model', '5g', 'huawei', 'telecom', '半导体', '芯片', '半導体', 'أشباه الموصلات', 'رقائق', 'هواوي',
    'export controls', 'entity list', 'chip ban'],
};
const RETIRED: Record<string, string> = {
  carrier: 'mobile and airline carriers; aircraft carrier and carrier group carry the meaning',
  '核': 'inside 核心 ("core"), in every "core interests"; the nuclear compounds (核武, 核试验…) carry it',
  protest: 'also a diplomatic protest; protester and mass protest carry the street meaning',
  'तनाव': '"tension" names no kind of pressure (like تصعيد), and it is the Hindi India–Pakistan search word',
  'کشیدگی': '"tension" names no kind of pressure, and it is the Urdu India–Pakistan search word',
  'تنش': '"tension" names no kind of pressure',
};

describe('the words that counted before', () => {
  for (const [domain, words] of Object.entries(LEGACY) as [Domain, string[]][]) {
    it(`still count for ${domain}`, () => {
      const wrong = words.filter((w) => kind(`report: ${w}`) !== domain).map((w) => `${w} → ${kind(`report: ${w}`)}`);
      expect(wrong).toEqual([]);
    });
  }

  it('are retired only with a reason, and then no longer count', () => {
    for (const w of Object.keys(RETIRED)) expect(kind(`report: ${w}`), w).toBeNull();
  });
});

describe('real headlines, every required language', () => {
  const cases: [string, Domain | null][] = [
    ['Israeli airstrikes hit southern Lebanon', 'Military'],
    ['US, China trade war deepens as new tariffs bite', 'Economic'],
    ['Taiwan used as a bargaining chip in US–China talks', 'Diplomatic'],
    ['Seoul hosts summit; foreign ministers sign pact', 'Diplomatic'],
    ['中国海警船在仁爱礁使用水炮', 'Maritime'],
    ['中方坚定维护核心利益', null],
    ['中国女排夺得世界冠军', null],
    ['भारत-चीन सीमा पर सैनिकों की तैनाती घटी', 'Military'],
    ['तेलंगाना में चुनाव की तैयारी', 'Internal'],
    ['ウランバートルで日モンゴル首脳会談', 'Diplomatic'],
    ['中国軍、台湾海峡で実弾演習', 'Military'],
    ['قطر تحذر من انفجار إقليمي بسبب مضيق هرمز', 'Maritime'],
    ['ضربات أمريكية على إيران', 'Military'],
    ['Россия и Украина провели переговоры о перемирии', 'Diplomatic'],
    ['ВСУ нанесли удар по позициям армии', 'Military'],
    // Systematic errors found by reading 30 classified headlines per language (2026-09-24):
    // border talks are talks; ending a war is peace-making; a war of words or a tariff war is not a war.
    ['Ajit Doval Reaches Beijing for Key India-China Border Talks: What to Watch', 'Diplomatic'],
    ['भारत-चीन सीमा वार्ता के लिए बीजिंग पहुंचे अजीत डोभाल', 'Diplomatic'],
    ['中印举行边界问题特别代表会晤', 'Diplomatic'],
    ['США и Россия обсудили новые возможности завершения войны в Украине', 'Diplomatic'],
    ['Papal envoy backs US bid to end the war in Ukraine', 'Diplomatic'],
    ['War of words between China and Philippines over South China Sea claims', null],
    ["U.S.-China 'Tariff War Truce' Extended Through January", 'Economic'],
    ['حرب اقتصادية أميركية على إيران', 'Economic'],
    ['US export curbs hit Chinese chipmakers', 'Technology'],
    ['美国AI公司发布有关报告，外交部：反对歪曲事实、对中国进行攻击抹黑', 'Diplomatic'],
    ['मोदी-जिनपिंग मुलाकात से क्या भारत-चीन संबंधों में आ पायेगी नई ऊर्जा?', null],
    ['維新・馬場前代表「台湾海峡の平和は極めて重要」台北で頼総統と会談', 'Diplomatic'],
    // Hindi सीमा is both "border" and "boundary"; English counted only "border", so one story split in two.
    ['India Rejects Pakistan-China Boundary Joint Commission', 'Military'],
  ];
  it.each(cases)('%s → %s', (headline, domain) => {
    expect(kind(headline)).toBe(domain);
  });
});
