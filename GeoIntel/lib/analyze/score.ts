import { LEXICON, DOMAIN_HINTS, type Domain } from '@/data/lexicon';
import { glossArticle, highestRung } from '@/lib/lang/chinese';

export interface ScoreResult {
  escalation: number;      // -100..100
  framing: number;
  domain: Domain;
  matchedTerms: string[];
  glossed: string[];
  ladderRung: number | null;
  ladderZh: string | null;
  ladderEn: string | null;
}

const LATIN = /^[\x20-\x7F]+$/;

function hasTerm(term: string, lower: string, raw: string): boolean {
  return LATIN.test(term) ? lower.includes(term.toLowerCase()) : raw.includes(term);
}

function classifyDomain(lower: string, raw: string, lexDomains: Domain[]): Domain {
  const tally = new Map<Domain, number>();
  for (const d of lexDomains) tally.set(d, (tally.get(d) ?? 0) + 2);
  for (const [domain, hints] of Object.entries(DOMAIN_HINTS) as [Domain, string[]][]) {
    for (const h of hints) {
      if (hasTerm(h, lower, raw)) tally.set(domain, (tally.get(domain) ?? 0) + 1);
    }
  }
  let best: Domain = 'Diplomatic';
  let bestN = 0;
  for (const [d, n] of tally) if (n > bestN) { best = d; bestN = n; }
  return best;
}

/**
 * Escalation score for one article.
 *
 * Three inputs: the multilingual lexicon, the Chinese glossary, and the PRC official
 * ladder. The ladder dominates deliberately — a formal rung-9 statement outweighs any
 * quantity of adjectives, because it is a stated government position rather than an
 * editorial choice of words.
 */
export function scoreText(title: string, snippet = ''): ScoreResult {
  const raw = `${title} ${snippet}`;
  const lower = raw.toLowerCase();

  let score = 0;
  const matched: string[] = [];
  const lexDomains: Domain[] = [];
  for (const e of LEXICON) {
    if (!hasTerm(e.term, lower, raw)) continue;
    score += e.weight;
    matched.push(e.term);
    if (e.domain) lexDomains.push(e.domain);
  }

  const gloss = glossArticle(raw);
  score += gloss.escalationScore;

  const rung = highestRung(raw);
  if (rung) score += rung.severity * 0.5;

  return {
    // tanh-style squash keeps a long article from running away with the score.
    escalation: Math.round(Math.max(-100, Math.min(100, score * 1.6))),
    framing: gloss.framingScore,
    domain: classifyDomain(lower, raw, lexDomains),
    matchedTerms: matched,
    glossed: gloss.glossed,
    ladderRung: rung?.rung ?? null,
    ladderZh: rung?.zh ?? null,
    ladderEn: rung?.en ?? null,
  };
}

/** English gloss of a non-English headline, assembled from recognised terms. */
export function glossHeadline(title: string, language: string): string | null {
  if (language !== 'zh') return null;
  const g = glossArticle(title);
  return g.glossed.length ? g.glossed.join(' · ') : null;
}
