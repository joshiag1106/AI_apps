// Chinese geopolitical glossary and PRC official-rhetoric escalation ladder.
//
// Two jobs. First, translate the vocabulary an English-reading analyst needs.
// Second — and this is the part no English-language monitor does — treat certain
// Chinese formulations as *signals in themselves*. PRC official language is highly
// formulaic: the specific phrase chosen encodes a deliberate position on a known
// ladder. Which rung is used matters far more than how loudly or often.

export type GlossCategory =
  | 'territorial' | 'military' | 'diplomatic' | 'economic' | 'framing' | 'org';

export interface GlossaryTerm {
  zh: string;
  en: string;
  category: GlossCategory;
  /** Why an analyst should care that this exact word was used. */
  note?: string;
  /** Contribution to the escalation score, 0-10. */
  weight?: number;
}

export const ZH_GLOSSARY: GlossaryTerm[] = [
  // ---- Territorial ----
  { zh: '实际控制线', en: 'Line of Actual Control (LAC)', category: 'territorial', weight: 3 },
  { zh: '实控线', en: 'LAC (abbrev.)', category: 'territorial', weight: 3 },
  { zh: '藏南', en: 'Arunachal Pradesh — PRC exonym "Southern Tibet"', category: 'framing', weight: 6,
    note: 'Use of 藏南 rather than a neutral term is itself a sovereignty claim. Its appearance in an official outlet marks a hardened position, not just reporting.' },
  { zh: '阿克赛钦', en: 'Aksai Chin', category: 'territorial', weight: 4 },
  { zh: '达旺', en: 'Tawang', category: 'territorial', weight: 4 },
  { zh: '加勒万', en: 'Galwan Valley', category: 'territorial', weight: 7,
    note: 'Site of the June 2020 fatal clash. Invocation is usually deliberate signalling.' },
  { zh: '班公湖', en: 'Pangong Tso', category: 'territorial', weight: 5 },
  { zh: '德普桑', en: 'Depsang Plains', category: 'territorial', weight: 5 },
  { zh: '洞朗', en: 'Doklam', category: 'territorial', weight: 6 },
  { zh: '克什米尔', en: 'Kashmir', category: 'territorial', weight: 4 },
  { zh: '固有领土', en: 'inherent territory', category: 'framing', weight: 5 },
  { zh: '自古以来', en: 'since ancient times', category: 'framing', weight: 4,
    note: 'Historical-claim boilerplate. Signals the sovereignty register rather than the negotiation register.' },
  { zh: '不可分割的一部分', en: 'inalienable part of', category: 'framing', weight: 5 },
  { zh: '领土完整', en: 'territorial integrity', category: 'diplomatic', weight: 3 },
  { zh: '主权', en: 'sovereignty', category: 'diplomatic', weight: 3 },
  { zh: '南海', en: 'South China Sea', category: 'territorial', weight: 3 },
  { zh: '南沙', en: 'Spratly Islands', category: 'territorial', weight: 4 },
  { zh: '西沙', en: 'Paracel Islands', category: 'territorial', weight: 4 },
  { zh: '仁爱礁', en: 'Second Thomas Shoal', category: 'territorial', weight: 5 },
  { zh: '黄岩岛', en: 'Scarborough Shoal', category: 'territorial', weight: 5 },
  { zh: '钓鱼岛', en: 'Senkaku/Diaoyu Islands', category: 'territorial', weight: 5 },
  { zh: '台海', en: 'Taiwan Strait', category: 'territorial', weight: 4 },
  { zh: '海峡中线', en: 'Taiwan Strait median line', category: 'territorial', weight: 6,
    note: 'PRC formally rejects the median line. Reporting of crossings is a tempo indicator.' },

  // ---- Military ----
  { zh: '解放军', en: "People's Liberation Army (PLA)", category: 'org', weight: 2 },
  { zh: '西部战区', en: 'Western Theater Command', category: 'org', weight: 6,
    note: 'The theatre command responsible for the Indian border. Activity here is India-relevant by definition.' },
  { zh: '东部战区', en: 'Eastern Theater Command', category: 'org', weight: 5,
    note: 'Taiwan-facing command.' },
  { zh: '南部战区', en: 'Southern Theater Command', category: 'org', weight: 4 },
  { zh: '火箭军', en: 'PLA Rocket Force', category: 'org', weight: 6 },
  { zh: '战备巡逻', en: 'combat readiness patrol', category: 'military', weight: 6 },
  { zh: '实战化训练', en: 'combat-realistic training', category: 'military', weight: 5 },
  { zh: '军事演习', en: 'military exercise', category: 'military', weight: 4 },
  { zh: '军演', en: 'military drill', category: 'military', weight: 4 },
  { zh: '联合利剑', en: 'Joint Sword (Taiwan encirclement exercise)', category: 'military', weight: 8 },
  { zh: '环台', en: 'encircling Taiwan', category: 'military', weight: 7 },
  { zh: '对峙', en: 'standoff / confrontation', category: 'military', weight: 6 },
  { zh: '越线', en: 'crossing the line', category: 'military', weight: 6 },
  { zh: '侵犯', en: 'violation / incursion', category: 'military', weight: 6 },
  { zh: '挑衅', en: 'provocation', category: 'military', weight: 6 },
  { zh: '摩擦', en: 'friction', category: 'military', weight: 4 },
  { zh: '增兵', en: 'troop reinforcement', category: 'military', weight: 6 },
  { zh: '换防', en: 'troop rotation', category: 'military', weight: 3 },
  { zh: '边防部队', en: 'border defence forces', category: 'military', weight: 4 },
  { zh: '脱离接触', en: 'disengagement', category: 'military', weight: -4,
    note: 'De-escalatory. Negative weight — this term marks movement away from confrontation.' },
  { zh: '缓冲区', en: 'buffer zone', category: 'military', weight: -2 },
  { zh: '领空', en: 'airspace', category: 'military', weight: 3 },
  { zh: '领海', en: 'territorial waters', category: 'military', weight: 3 },
  { zh: '航行自由', en: 'freedom of navigation', category: 'military', weight: 4 },

  // ---- Diplomatic ----
  { zh: '外交部', en: 'Ministry of Foreign Affairs (MOFA)', category: 'org', weight: 1 },
  { zh: '国防部', en: 'Ministry of National Defense', category: 'org', weight: 2 },
  { zh: '发言人', en: 'spokesperson', category: 'diplomatic', weight: 1 },
  { zh: '特别代表', en: 'Special Representative (India-China boundary talks)', category: 'diplomatic', weight: -3,
    note: 'The SR mechanism is the designated India-China boundary negotiation channel. Meetings are de-escalatory signals.' },
  { zh: '军长级会谈', en: 'Corps Commander Level Talks', category: 'diplomatic', weight: -3 },
  { zh: '边界问题', en: 'the boundary question', category: 'diplomatic', weight: 2 },
  { zh: '内政', en: 'internal affairs', category: 'diplomatic', weight: 3 },
  { zh: '干涉内政', en: 'interference in internal affairs', category: 'framing', weight: 5 },
  { zh: '一个中国原则', en: 'One China principle', category: 'diplomatic', weight: 4 },
  { zh: '台独', en: 'Taiwan independence (pejorative)', category: 'framing', weight: 6 },
  { zh: '分裂', en: 'splittism / secession', category: 'framing', weight: 5 },
  { zh: '核心利益', en: 'core interest', category: 'framing', weight: 7,
    note: 'Designating an issue a "core interest" places it in the category over which Beijing has said it will use force.' },
  { zh: '红线', en: 'red line', category: 'framing', weight: 7 },
  { zh: '底线', en: 'bottom line', category: 'framing', weight: 6 },
  { zh: '触碰', en: 'to touch / cross (a line)', category: 'framing', weight: 5 },

  // ---- Framing ----
  { zh: '冷战思维', en: 'Cold War mentality', category: 'framing', weight: 3,
    note: 'Standard rebuke aimed at US alliance-building. Marks the piece as polemical rather than reportorial.' },
  { zh: '小圈子', en: 'small cliques / exclusive blocs', category: 'framing', weight: 3 },
  { zh: '四方机制', en: 'the Quad', category: 'framing', weight: 4 },
  { zh: '印太战略', en: 'Indo-Pacific Strategy', category: 'framing', weight: 4 },
  { zh: '亚太版北约', en: '"Asian NATO"', category: 'framing', weight: 5 },
  { zh: '遏制', en: 'containment', category: 'framing', weight: 4 },
  { zh: '反华', en: 'anti-China', category: 'framing', weight: 4 },
  { zh: '涉华', en: 'China-related', category: 'framing', weight: 1 },
  { zh: '印方', en: 'the Indian side', category: 'diplomatic', weight: 2 },
  { zh: '中方', en: 'the Chinese side', category: 'diplomatic', weight: 1 },
  { zh: '霸权', en: 'hegemony', category: 'framing', weight: 4 },
  { zh: '双标', en: 'double standards', category: 'framing', weight: 3 },

  // ---- Economic ----
  { zh: '出口管制', en: 'export controls', category: 'economic', weight: 5 },
  { zh: '实体清单', en: 'Entity List', category: 'economic', weight: 5 },
  { zh: '不可靠实体清单', en: 'Unreliable Entity List', category: 'economic', weight: 6 },
  { zh: '反制措施', en: 'countermeasures', category: 'economic', weight: 6 },
  { zh: '制裁', en: 'sanctions', category: 'economic', weight: 5 },
  { zh: '关税', en: 'tariffs', category: 'economic', weight: 4 },
  { zh: '稀土', en: 'rare earths', category: 'economic', weight: 6,
    note: 'Rare-earth export restriction is Beijing’s most-used economic coercion lever.' },
  { zh: '供应链', en: 'supply chain', category: 'economic', weight: 2 },
  { zh: '脱钩', en: 'decoupling', category: 'economic', weight: 4 },
  { zh: '去风险', en: 'de-risking', category: 'economic', weight: 3 },
  { zh: '一带一路', en: 'Belt and Road Initiative', category: 'economic', weight: 3 },
  { zh: '中巴经济走廊', en: 'China-Pakistan Economic Corridor (CPEC)', category: 'economic', weight: 6,
    note: 'CPEC runs through Gilgit-Baltistan, territory India claims. Structurally an India-China-Pakistan issue.' },
  { zh: '芯片', en: 'semiconductor chips', category: 'economic', weight: 4 },
];

/**
 * PRC official escalation ladder.
 *
 * These are set-piece formulae issued by MOFA, MND and People's Daily. They form an
 * ordered sequence, and Beijing moves along it deliberately. Rung, not volume, is the
 * signal — a single 严正交涉 says more than a week of unofficial nationalist commentary.
 */
export interface LadderRung {
  rung: number;
  zh: string;
  en: string;
  gloss: string;
  severity: number; // 0-100
}

export const ESCALATION_LADDER: LadderRung[] = [
  { rung: 1, zh: '表示关切', en: 'expresses concern', severity: 10,
    gloss: 'Lowest formal register. Notice taken, no position hardened.' },
  { rung: 2, zh: '表示不满', en: 'expresses dissatisfaction', severity: 20,
    gloss: 'Displeasure on record. Still routine.' },
  { rung: 3, zh: '交涉', en: 'makes representations', severity: 30,
    gloss: 'Formal diplomatic démarche has been delivered.' },
  { rung: 4, zh: '严正交涉', en: 'makes solemn representations', severity: 45,
    gloss: 'The standard hardened démarche. Marks an issue Beijing has decided to contest openly.' },
  { rung: 5, zh: '强烈不满', en: 'strong dissatisfaction', severity: 50, gloss: 'Paired escalation phrase, usually with 坚决反对.' },
  { rung: 6, zh: '坚决反对', en: 'resolute opposition', severity: 55, gloss: 'Position is now non-negotiable in public.' },
  { rung: 7, zh: '强烈谴责', en: 'strong condemnation', severity: 60, gloss: 'Reserved for acts framed as violations, not disagreements.' },
  { rung: 8, zh: '强烈抗议', en: 'strong protest', severity: 65,
    gloss: 'Formal protest. Historically clusters around incidents involving casualties or sovereignty acts.' },
  { rung: 9, zh: '保留采取进一步措施的权利', en: 'reserves the right to take further measures', severity: 72,
    gloss: 'Explicit reservation of future action. Transition from words to threatened deeds.' },
  { rung: 10, zh: '坚决反制', en: 'will resolutely counter', severity: 78,
    gloss: 'Countermeasures announced as decided, not merely possible.' },
  { rung: 11, zh: '后果自负', en: 'must bear all consequences', severity: 85,
    gloss: 'Responsibility for what follows is publicly transferred to the other party.' },
  { rung: 12, zh: '一切必要措施', en: 'all necessary measures', severity: 90,
    gloss: 'The formula that does not exclude force. Used on Taiwan and on core-interest questions.' },
  { rung: 13, zh: '勿谓言之不预', en: '"do not say you were not forewarned"', severity: 100,
    gloss: 'The most serious warning in the PRC lexicon. Carried by People’s Daily before the 1962 war with India and the 1979 war with Vietnam. Extremely rare; treat any appearance as a priority signal and verify the outlet and date directly.' },
];

/** Longest-match first, so 严正交涉 wins over 交涉 and 强烈不满 over 不满. */
export const LADDER_BY_LENGTH = [...ESCALATION_LADDER].sort((a, b) => b.zh.length - a.zh.length);
export const GLOSSARY_BY_LENGTH = [...ZH_GLOSSARY].sort((a, b) => b.zh.length - a.zh.length);
export const GLOSSARY_MAP = new Map(ZH_GLOSSARY.map((t) => [t.zh, t]));
