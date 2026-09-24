import { LEXICON, type Domain } from '@/data/lexicon';
import { matchConcepts, topDomain } from '@/lib/analyze/concepts';
import { glossArticle, highestRung } from '@/lib/lang/chinese';
import { formulaSpeaker, type LadderSpeaker } from '@/lib/lang/speaker';
import { formulaTarget } from '@/lib/lang/target';

export interface ScoreResult {
  escalation: number;      // -100..100
  framing: number;
  domain: Domain;
  matchedTerms: string[];
  glossed: string[];
  ladderRung: number | null;
  ladderZh: string | null;
  ladderEn: string | null;
  /** Who said it — null when there is no formula. See lib/lang/speaker. */
  ladderSpeaker: LadderSpeaker | null;
  /** Whom a Beijing formula is aimed at — null unless the speaker is Beijing and the headline says. */
  ladderTarget: string | null;
}

const LATIN = /^[\x20-\x7F]+$/;

function hasTerm(term: string, lower: string, raw: string): boolean {
  return LATIN.test(term) ? lower.includes(term.toLowerCase()) : raw.includes(term);
}

/**
 * An article's domain ONLY when its own words show one; null otherwise. Read from the shared concept
 * list (data/concepts.ts), the same in every language — see lib/analyze/concepts for the matching rules.
 *
 * Until 2026-09-24 this counted two lists that grew one language at a time (DOMAIN_HINTS, and the
 * domains of LEXICON's escalation terms), so English was read far more closely than the rest and
 * Language Lens partly measured vocabulary. Language Lens counts framing from this, never from the
 * stored 'Diplomatic' fallback, which for a report with no evidence means "unclassified".
 */
export function evidencedDomain(title: string, snippet = ''): Domain | null {
  return topDomain(matchConcepts(`${title} ${snippet}`));
}

/** The stored domain: the evidenced one, or 'Diplomatic' when the words show none. */
export function domainOf(title: string, snippet = ''): Domain {
  return evidencedDomain(title, snippet) ?? 'Diplomatic';
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
  for (const e of LEXICON) {
    if (!hasTerm(e.term, lower, raw)) continue;
    score += e.weight;
    matched.push(e.term);
  }

  const gloss = glossArticle(raw);
  score += gloss.escalationScore;

  const rung = highestRung(raw);
  // The rung adds to escalation whoever says it: another government's formal protest is still
  // tension. Only the surfaces that say "PRC" care whose it is, and they read the speaker.
  if (rung) score += rung.severity * 0.5;
  const speaker = rung ? formulaSpeaker(raw, rung.zh) : null;
  // Only Beijing's formulae have a Beijing target: another government's is not aimed by Beijing.
  const target = rung && speaker === 'prc' ? formulaTarget(raw, rung.zh) : null;

  return {
    // tanh-style squash keeps a long article from running away with the score.
    escalation: Math.round(Math.max(-100, Math.min(100, score * 1.6))),
    framing: gloss.framingScore,
    domain: domainOf(title, snippet),
    matchedTerms: matched,
    glossed: gloss.glossed,
    ladderRung: rung?.rung ?? null,
    ladderZh: rung?.zh ?? null,
    ladderEn: rung?.en ?? null,
    ladderSpeaker: speaker,
    ladderTarget: target,
  };
}

/** English gloss of a non-English headline, assembled from recognised terms. */
export function glossHeadline(title: string, language: string): string | null {
  if (language !== 'zh') return null;
  const g = glossArticle(title);
  return g.glossed.length ? g.glossed.join(' · ') : null;
}
