import { extractActors, extractHotspots } from '@/lib/analyze/entities';
import { HOTSPOTS } from '@/data/countries';
import { ESCALATION_LADDER } from '@/data/glossary.zh';
import type { Domain } from '@/data/lexicon';

/**
 * Deterministic reading of a natural-language question.
 *
 * The same gazetteer that resolves actors in a headline resolves them in a question, so
 * 中国 and भारत work here for the same reason they work in the country search: an analyst
 * reading a Chinese source should not have to translate before they can ask about it.
 *
 * This is pattern matching, not understanding, and the interface says so — every answer
 * shows what was actually extracted, so a wrong answer can be traced to a misread question
 * rather than looking like the corpus is empty. When an API key exists the language model
 * writes prose over these results; it never replaces them, because the deterministic path
 * has to keep working with no key at all.
 */

export type AskShape = 'count' | 'compare' | 'why' | 'list' | 'what';

export interface AskIntent {
  /** States the question names directly. Every one of them must be in a matching event. */
  actors: string[];
  /**
   * States a named flashpoint implies. Shown, never required.
   *
   * The South China Sea implicates five states, so requiring all of them would exclude the
   * China-Philippines incidents that are the most common events there. The flashpoint is
   * the constraint; its parties are context.
   */
  impliedActors: string[];
  hotspots: string[];
  domains: Domain[];
  /** Minimum PRC escalation-ladder rung, when the question asks about official formulae. */
  minRung: number | null;
  windowDays: number | null;
  language: string | null;
  minConfidence: number | null;
  shape: AskShape;
  keywords: string[];
}

/**
 * Everyday words for each domain. Analysts say "naval" and "trade war", not "Maritime"
 * and "Economic", and a question layer that only accepts the internal vocabulary is a
 * question layer nobody can use.
 */
const DOMAIN_WORDS: Record<Domain, string[]> = {
  Military: ['military', 'army', 'troops', 'defence', 'defense', 'war', 'exercise', 'drill', 'incursion'],
  Maritime: ['maritime', 'naval', 'navy', 'sea', 'ship', 'vessel', 'coast guard', 'shoal', 'strait'],
  Cyber: ['cyber', 'hacking', 'hacker', 'malware', 'intrusion', 'espionage'],
  Economic: ['economic', 'economy', 'trade', 'tariff', 'sanction', 'export control', 'trade war'],
  Energy: ['energy', 'oil', 'gas', 'pipeline', 'lng', 'crude'],
  Space: ['space', 'satellite', 'orbital', 'launch'],
  Nuclear: ['nuclear', 'warhead', 'enrichment', 'missile test', 'icbm'],
  Diplomatic: ['diplomatic', 'diplomacy', 'talks', 'summit', 'visit', 'negotiation', 'statement'],
  Internal: ['internal', 'protest', 'unrest', 'domestic', 'election'],
  Technology: ['technology', 'tech', 'semiconductor', 'chip', 'ai', 'export ban'],
};

const LANGUAGES: Record<string, string> = {
  chinese: 'zh', mandarin: 'zh', '中文': 'zh', hindi: 'hi', 'हिंदी': 'hi',
  urdu: 'ur', japanese: 'ja', korean: 'ko', russian: 'ru', arabic: 'ar', english: 'en',
};

/** Words that only ever say "recently" and should not survive as search keywords. */
const STOP = new Set([
  'what','whats','why','how','who','when','where','which','is','are','was','were','the','a','an',
  'and','or','of','in','on','at','to','for','with','about','any','anything','happening','happened',
  'going','show','me','tell','list','give','there','this','that','it','its','do','does','did',
  'between','from','over','last','past','recent','recently','news','event','events','report',
  'reports','many','much','count','compare','versus','vs','than','more','most','new','latest',
  'situation','update','updates','status','currently','now','today','week','month','days','day',
]);

function windowFrom(q: string): number | null {
  if (/\btoday\b|\blast 24 hours\b|\bpast 24 hours\b/.test(q)) return 1;
  if (/\bthis week\b|\bpast week\b|\blast week\b/.test(q)) return 7;
  if (/\bthis month\b|\bpast month\b|\blast month\b/.test(q)) return 30;
  const explicit = q.match(/\b(?:last|past|previous)\s+(\d{1,3})\s*(?:days?|d)\b/)
    ?? q.match(/\b(\d{1,3})\s*(?:days?|d)\b/);
  if (explicit) {
    const n = Number(explicit[1]);
    if (n >= 1 && n <= 365) return n;
  }
  return null;
}

/**
 * Ladder threshold, either stated as a rung or implied by naming a formula.
 *
 * "Has Beijing issued a strong protest" is a rung-8 question whether or not the asker
 * knows the ladder exists, so the formulae themselves are matched by their English names.
 */
function rungFrom(q: string): number | null {
  const explicit = q.match(/\brung\s*(\d{1,2})\b/);
  if (explicit) {
    const n = Number(explicit[1]);
    if (n >= 1 && n <= 13) return n;
  }
  for (const r of ESCALATION_LADDER) {
    if (q.includes(r.en.toLowerCase()) || q.includes(r.zh)) return r.rung;
  }
  if (/\bladder\b|\bofficial formula|\bofficial statement/.test(q)) return 1;
  return null;
}

function shapeFrom(q: string): AskShape {
  if (/\bhow many\b|\bhow much\b|\bcount\b|\bnumber of\b/.test(q)) return 'count';
  if (/\bcompare\b|\bversus\b|\bvs\.?\b|\bagainst each other\b/.test(q)) return 'compare';
  if (/\bwhy\b|\bwhat is driving\b|\bwhat's driving\b|\bexplain\b|\breason\b/.test(q)) return 'why';
  if (/\blist\b|\bshow me\b|\bwhich events\b/.test(q)) return 'list';
  return 'what';
}

export function parseQuestion(question: string): AskIntent {
  const q = ` ${question.toLowerCase().trim()} `;
  const hotspots = extractHotspots(question);
  // Flashpoint names are masked before states are extracted, because several contain a
  // country name: "South China Sea" holds "China", and a question about the sea is not a
  // question about the country. Anything named outside the flashpoint still resolves, so
  // "China in the South China Sea" keeps CHN as a direct actor.
  let masked = question;
  for (const id of hotspots) {
    for (const alias of HOTSPOTS.find((h) => h.id === id)?.aliases ?? []) {
      masked = masked.replace(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
    }
  }
  const actors = extractActors(masked);
  const impliedActors = [...new Set(
    hotspots.flatMap((id) => HOTSPOTS.find((h) => h.id === id)?.parties ?? []),
  )].filter((iso) => !actors.includes(iso));

  const domains = (Object.keys(DOMAIN_WORDS) as Domain[])
    .filter((d) => DOMAIN_WORDS[d].some((w) => q.includes(` ${w} `) || q.includes(`${w}s `) || q.includes(` ${w},`)));

  let language: string | null = null;
  for (const [word, code] of Object.entries(LANGUAGES)) {
    if (q.includes(word)) { language = code; break; }
  }

  const minConfidence = /\bcorroborat|\bconfirmed\b|\bverified\b|\breliable\b|\bwell.sourced\b/.test(q)
    ? 50 : null;

  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));

  return {
    actors,
    impliedActors,
    hotspots,
    domains,
    minRung: rungFrom(q),
    windowDays: windowFrom(q),
    language,
    minConfidence,
    shape: shapeFrom(q),
    keywords: [...new Set(keywords)],
  };
}
