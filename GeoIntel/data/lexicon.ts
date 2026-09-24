// Multilingual escalation / de-escalation lexicon.
// Weights are contributions to an event's escalation score (-10 .. +10).
// Negative terms matter as much as positive ones: a model that only counts threats
// will report a crisis during a peace summit.

export type Domain =
  | 'Military' | 'Maritime' | 'Cyber' | 'Economic' | 'Energy'
  | 'Space' | 'Nuclear' | 'Diplomatic' | 'Internal' | 'Technology';

/**
 * An escalation term: how INTENSE a report reads. Which KIND of pressure it is about comes from
 * data/concepts.ts — until 2026-09-24 these entries also voted on that, mostly in English.
 */
export interface LexEntry {
  term: string;
  lang: string;
  weight: number;
}

export const LEXICON: LexEntry[] = [
  // English — escalatory
  { term: 'invasion', lang: 'en', weight: 10 },
  { term: 'airstrike', lang: 'en', weight: 9 },
  { term: 'missile strike', lang: 'en', weight: 9 },
  { term: 'incursion', lang: 'en', weight: 8 },
  { term: 'troops killed', lang: 'en', weight: 9 },
  { term: 'casualties', lang: 'en', weight: 7 },
  { term: 'clash', lang: 'en', weight: 8 },
  { term: 'skirmish', lang: 'en', weight: 7 },
  { term: 'standoff', lang: 'en', weight: 6 },
  { term: 'mobilisation', lang: 'en', weight: 8 },
  { term: 'mobilization', lang: 'en', weight: 8 },
  { term: 'troop buildup', lang: 'en', weight: 7 },
  { term: 'ceasefire violation', lang: 'en', weight: 8 },
  { term: 'infiltration', lang: 'en', weight: 7 },
  { term: 'airspace violation', lang: 'en', weight: 7 },
  { term: 'live-fire', lang: 'en', weight: 6 },
  { term: 'military exercise', lang: 'en', weight: 4 },
  { term: 'war game', lang: 'en', weight: 4 },
  { term: 'scrambled jets', lang: 'en', weight: 6 },
  { term: 'nuclear test', lang: 'en', weight: 10 },
  { term: 'ballistic missile', lang: 'en', weight: 8 },
  { term: 'hypersonic', lang: 'en', weight: 6 },
  { term: 'enrichment', lang: 'en', weight: 7 },
  { term: 'cyberattack', lang: 'en', weight: 7 },
  { term: 'data breach', lang: 'en', weight: 5 },
  { term: 'ransomware', lang: 'en', weight: 5 },
  { term: 'espionage', lang: 'en', weight: 7 },
  { term: 'spyware', lang: 'en', weight: 5 },
  { term: 'critical infrastructure', lang: 'en', weight: 6 },
  { term: 'disinformation', lang: 'en', weight: 5 },
  { term: 'sanctions', lang: 'en', weight: 6 },
  { term: 'export controls', lang: 'en', weight: 6 },
  { term: 'entity list', lang: 'en', weight: 6 },
  { term: 'tariff', lang: 'en', weight: 5 },
  { term: 'trade war', lang: 'en', weight: 6 },
  { term: 'embargo', lang: 'en', weight: 7 },
  { term: 'blockade', lang: 'en', weight: 9 },
  { term: 'rare earth', lang: 'en', weight: 6 },
  { term: 'chip ban', lang: 'en', weight: 6 },
  { term: 'pipeline', lang: 'en', weight: 4 },
  { term: 'oil supply', lang: 'en', weight: 4 },
  { term: 'strait closure', lang: 'en', weight: 8 },
  { term: 'freedom of navigation', lang: 'en', weight: 5 },
  { term: 'water cannon', lang: 'en', weight: 6 },
  { term: 'coast guard', lang: 'en', weight: 4 },
  { term: 'anti-satellite', lang: 'en', weight: 8 },
  { term: 'satellite jamming', lang: 'en', weight: 6 },
  { term: 'expelled diplomat', lang: 'en', weight: 6 },
  { term: 'recalled ambassador', lang: 'en', weight: 7 },
  { term: 'summoned envoy', lang: 'en', weight: 5 },
  { term: 'terror attack', lang: 'en', weight: 9 },
  { term: 'insurgency', lang: 'en', weight: 7 },
  { term: 'coup', lang: 'en', weight: 9 },
  { term: 'unrest', lang: 'en', weight: 5 },
  { term: 'protest', lang: 'en', weight: 3 },
  // English — de-escalatory
  { term: 'ceasefire', lang: 'en', weight: -7 },
  { term: 'peace talks', lang: 'en', weight: -7 },
  { term: 'disengagement', lang: 'en', weight: -7 },
  { term: 'de-escalation', lang: 'en', weight: -7 },
  { term: 'agreement signed', lang: 'en', weight: -6 },
  { term: 'troop withdrawal', lang: 'en', weight: -6 },
  { term: 'resumed flights', lang: 'en', weight: -4 },
  { term: 'trade deal', lang: 'en', weight: -4 },
  { term: 'normalisation', lang: 'en', weight: -5 },
  { term: 'normalization', lang: 'en', weight: -5 },
  { term: 'bilateral talks', lang: 'en', weight: -4 },
  { term: 'sanctions lifted', lang: 'en', weight: -6 },
  { term: 'prisoner exchange', lang: 'en', weight: -4 },

  // Hindi
  { term: 'घुसपैठ', lang: 'hi', weight: 8 },
  { term: 'हमला', lang: 'hi', weight: 9 },
  { term: 'झड़प', lang: 'hi', weight: 8 },
  { term: 'तनाव', lang: 'hi', weight: 5 },
  { term: 'सीमा विवाद', lang: 'hi', weight: 6 },
  { term: 'आतंकी', lang: 'hi', weight: 8 },
  { term: 'युद्धविराम', lang: 'hi', weight: -7 },
  { term: 'वार्ता', lang: 'hi', weight: -4 },
  { term: 'समझौता', lang: 'hi', weight: -5 },

  // Russian
  { term: 'наступление', lang: 'ru', weight: 9 },
  { term: 'обстрел', lang: 'ru', weight: 8 },
  { term: 'удар', lang: 'ru', weight: 8 },
  { term: 'санкции', lang: 'ru', weight: 6 },
  { term: 'мобилизация', lang: 'ru', weight: 8 },
  { term: 'перемирие', lang: 'ru', weight: -7 },
  { term: 'переговоры', lang: 'ru', weight: -4 },

  // Urdu
  { term: 'حملہ', lang: 'ur', weight: 9 },
  { term: 'کشیدگی', lang: 'ur', weight: 5 },
  { term: 'جنگ بندی', lang: 'ur', weight: -7 },
  { term: 'مذاکرات', lang: 'ur', weight: -4 },

  // Arabic / Persian
  { term: 'غارة', lang: 'ar', weight: 9 },
  { term: 'عقوبات', lang: 'ar', weight: 6 },
  { term: 'وقف إطلاق النار', lang: 'ar', weight: -7 },
  { term: 'تنش', lang: 'fa', weight: 5 },
  { term: 'تحریم', lang: 'fa', weight: 6 },
];
