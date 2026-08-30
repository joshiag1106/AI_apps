// Multilingual escalation / de-escalation lexicon.
// Weights are contributions to an event's escalation score (-10 .. +10).
// Negative terms matter as much as positive ones: a model that only counts threats
// will report a crisis during a peace summit.

export type Domain =
  | 'Military' | 'Maritime' | 'Cyber' | 'Economic' | 'Energy'
  | 'Space' | 'Nuclear' | 'Diplomatic' | 'Internal' | 'Technology';

export interface LexEntry {
  term: string;
  lang: string;
  weight: number;
  domain?: Domain;
}

export const LEXICON: LexEntry[] = [
  // English — escalatory
  { term: 'invasion', lang: 'en', weight: 10, domain: 'Military' },
  { term: 'airstrike', lang: 'en', weight: 9, domain: 'Military' },
  { term: 'missile strike', lang: 'en', weight: 9, domain: 'Military' },
  { term: 'incursion', lang: 'en', weight: 8, domain: 'Military' },
  { term: 'troops killed', lang: 'en', weight: 9, domain: 'Military' },
  { term: 'casualties', lang: 'en', weight: 7, domain: 'Military' },
  { term: 'clash', lang: 'en', weight: 8, domain: 'Military' },
  { term: 'skirmish', lang: 'en', weight: 7, domain: 'Military' },
  { term: 'standoff', lang: 'en', weight: 6, domain: 'Military' },
  { term: 'mobilisation', lang: 'en', weight: 8, domain: 'Military' },
  { term: 'mobilization', lang: 'en', weight: 8, domain: 'Military' },
  { term: 'troop buildup', lang: 'en', weight: 7, domain: 'Military' },
  { term: 'ceasefire violation', lang: 'en', weight: 8, domain: 'Military' },
  { term: 'infiltration', lang: 'en', weight: 7, domain: 'Military' },
  { term: 'airspace violation', lang: 'en', weight: 7, domain: 'Military' },
  { term: 'live-fire', lang: 'en', weight: 6, domain: 'Military' },
  { term: 'military exercise', lang: 'en', weight: 4, domain: 'Military' },
  { term: 'war game', lang: 'en', weight: 4, domain: 'Military' },
  { term: 'scrambled jets', lang: 'en', weight: 6, domain: 'Military' },
  { term: 'nuclear test', lang: 'en', weight: 10, domain: 'Nuclear' },
  { term: 'ballistic missile', lang: 'en', weight: 8, domain: 'Nuclear' },
  { term: 'hypersonic', lang: 'en', weight: 6, domain: 'Nuclear' },
  { term: 'enrichment', lang: 'en', weight: 7, domain: 'Nuclear' },
  { term: 'cyberattack', lang: 'en', weight: 7, domain: 'Cyber' },
  { term: 'data breach', lang: 'en', weight: 5, domain: 'Cyber' },
  { term: 'ransomware', lang: 'en', weight: 5, domain: 'Cyber' },
  { term: 'espionage', lang: 'en', weight: 7, domain: 'Cyber' },
  { term: 'spyware', lang: 'en', weight: 5, domain: 'Cyber' },
  { term: 'critical infrastructure', lang: 'en', weight: 6, domain: 'Cyber' },
  { term: 'disinformation', lang: 'en', weight: 5, domain: 'Cyber' },
  { term: 'sanctions', lang: 'en', weight: 6, domain: 'Economic' },
  { term: 'export controls', lang: 'en', weight: 6, domain: 'Technology' },
  { term: 'entity list', lang: 'en', weight: 6, domain: 'Technology' },
  { term: 'tariff', lang: 'en', weight: 5, domain: 'Economic' },
  { term: 'trade war', lang: 'en', weight: 6, domain: 'Economic' },
  { term: 'embargo', lang: 'en', weight: 7, domain: 'Economic' },
  { term: 'blockade', lang: 'en', weight: 9, domain: 'Maritime' },
  { term: 'rare earth', lang: 'en', weight: 6, domain: 'Economic' },
  { term: 'chip ban', lang: 'en', weight: 6, domain: 'Technology' },
  { term: 'pipeline', lang: 'en', weight: 4, domain: 'Energy' },
  { term: 'oil supply', lang: 'en', weight: 4, domain: 'Energy' },
  { term: 'strait closure', lang: 'en', weight: 8, domain: 'Energy' },
  { term: 'freedom of navigation', lang: 'en', weight: 5, domain: 'Maritime' },
  { term: 'water cannon', lang: 'en', weight: 6, domain: 'Maritime' },
  { term: 'coast guard', lang: 'en', weight: 4, domain: 'Maritime' },
  { term: 'anti-satellite', lang: 'en', weight: 8, domain: 'Space' },
  { term: 'satellite jamming', lang: 'en', weight: 6, domain: 'Space' },
  { term: 'expelled diplomat', lang: 'en', weight: 6, domain: 'Diplomatic' },
  { term: 'recalled ambassador', lang: 'en', weight: 7, domain: 'Diplomatic' },
  { term: 'summoned envoy', lang: 'en', weight: 5, domain: 'Diplomatic' },
  { term: 'terror attack', lang: 'en', weight: 9, domain: 'Internal' },
  { term: 'insurgency', lang: 'en', weight: 7, domain: 'Internal' },
  { term: 'coup', lang: 'en', weight: 9, domain: 'Internal' },
  { term: 'unrest', lang: 'en', weight: 5, domain: 'Internal' },
  { term: 'protest', lang: 'en', weight: 3, domain: 'Internal' },
  // English — de-escalatory
  { term: 'ceasefire', lang: 'en', weight: -7, domain: 'Diplomatic' },
  { term: 'peace talks', lang: 'en', weight: -7, domain: 'Diplomatic' },
  { term: 'disengagement', lang: 'en', weight: -7, domain: 'Military' },
  { term: 'de-escalation', lang: 'en', weight: -7, domain: 'Diplomatic' },
  { term: 'agreement signed', lang: 'en', weight: -6, domain: 'Diplomatic' },
  { term: 'troop withdrawal', lang: 'en', weight: -6, domain: 'Military' },
  { term: 'resumed flights', lang: 'en', weight: -4, domain: 'Diplomatic' },
  { term: 'trade deal', lang: 'en', weight: -4, domain: 'Economic' },
  { term: 'normalisation', lang: 'en', weight: -5, domain: 'Diplomatic' },
  { term: 'normalization', lang: 'en', weight: -5, domain: 'Diplomatic' },
  { term: 'bilateral talks', lang: 'en', weight: -4, domain: 'Diplomatic' },
  { term: 'sanctions lifted', lang: 'en', weight: -6, domain: 'Economic' },
  { term: 'prisoner exchange', lang: 'en', weight: -4, domain: 'Diplomatic' },

  // Hindi
  { term: 'घुसपैठ', lang: 'hi', weight: 8, domain: 'Military' },
  { term: 'हमला', lang: 'hi', weight: 9, domain: 'Military' },
  { term: 'झड़प', lang: 'hi', weight: 8, domain: 'Military' },
  { term: 'तनाव', lang: 'hi', weight: 5, domain: 'Diplomatic' },
  { term: 'सीमा विवाद', lang: 'hi', weight: 6, domain: 'Military' },
  { term: 'आतंकी', lang: 'hi', weight: 8, domain: 'Internal' },
  { term: 'युद्धविराम', lang: 'hi', weight: -7, domain: 'Diplomatic' },
  { term: 'वार्ता', lang: 'hi', weight: -4, domain: 'Diplomatic' },
  { term: 'समझौता', lang: 'hi', weight: -5, domain: 'Diplomatic' },

  // Russian
  { term: 'наступление', lang: 'ru', weight: 9, domain: 'Military' },
  { term: 'обстрел', lang: 'ru', weight: 8, domain: 'Military' },
  { term: 'удар', lang: 'ru', weight: 8, domain: 'Military' },
  { term: 'санкции', lang: 'ru', weight: 6, domain: 'Economic' },
  { term: 'мобилизация', lang: 'ru', weight: 8, domain: 'Military' },
  { term: 'перемирие', lang: 'ru', weight: -7, domain: 'Diplomatic' },
  { term: 'переговоры', lang: 'ru', weight: -4, domain: 'Diplomatic' },

  // Urdu
  { term: 'حملہ', lang: 'ur', weight: 9, domain: 'Military' },
  { term: 'کشیدگی', lang: 'ur', weight: 5, domain: 'Diplomatic' },
  { term: 'جنگ بندی', lang: 'ur', weight: -7, domain: 'Diplomatic' },
  { term: 'مذاکرات', lang: 'ur', weight: -4, domain: 'Diplomatic' },

  // Arabic / Persian
  { term: 'غارة', lang: 'ar', weight: 9, domain: 'Military' },
  { term: 'عقوبات', lang: 'ar', weight: 6, domain: 'Economic' },
  { term: 'وقف إطلاق النار', lang: 'ar', weight: -7, domain: 'Diplomatic' },
  { term: 'تنش', lang: 'fa', weight: 5, domain: 'Diplomatic' },
  { term: 'تحریم', lang: 'fa', weight: 6, domain: 'Economic' },
];

/** Keyword hints used to classify an event into a domain when the lexicon is silent. */
export const DOMAIN_HINTS: Record<Domain, string[]> = {
  Military:   ['army', 'troops', 'soldier', 'border', 'brigade', 'artillery', 'drone strike', 'battalion', '军', '边境', '部队', 'सेना', 'सैनिक'],
  Maritime:   ['navy', 'naval', 'warship', 'carrier', 'submarine', 'shoal', 'strait', 'vessel', '海军', '军舰', '航母', 'नौसेना'],
  Cyber:      ['cyber', 'hacker', 'malware', 'phishing', 'apt group', 'network intrusion', '网络攻击', '黑客', 'साइबर'],
  Economic:   ['trade', 'tariff', 'export', 'import', 'investment', 'currency', 'gdp', '贸易', '关税', 'व्यापार'],
  Energy:     ['oil', 'gas', 'lng', 'refinery', 'pipeline', 'crude', 'nuclear plant', '石油', '天然气', 'तेल'],
  Space:      ['satellite', 'orbit', 'launch vehicle', 'space station', 'isro', '卫星', 'उपग्रह'],
  Nuclear:    ['nuclear', 'warhead', 'icbm', 'uranium', 'iaea', '核', 'परमाणु'],
  Diplomatic: ['summit', 'ambassador', 'foreign minister', 'treaty', 'communique', 'visit', '外交', '会晤', 'राजनयिक'],
  Internal:   ['riot', 'election', 'militant', 'separatist', 'crackdown', 'curfew', '骚乱', 'विद्रोह'],
  Technology: ['semiconductor', 'chip', 'ai model', '5g', 'huawei', 'telecom', '半导体', '芯片'],
};
