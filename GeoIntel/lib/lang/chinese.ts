import {
  GLOSSARY_BY_LENGTH, LADDER_BY_LENGTH, type GlossaryTerm, type LadderRung,
} from '@/data/glossary.zh';

export interface GlossResult {
  terms: GlossaryTerm[];
  /** Sum of term weights. Negative means the vocabulary is de-escalatory. */
  escalationScore: number;
  /** Weight carried specifically by framing/exonym vocabulary. */
  framingScore: number;
  /** English rendering of the recognised terms, in order of appearance. */
  glossed: string[];
}

/**
 * Extract known geopolitical vocabulary from Chinese text.
 *
 * Longest-match-first, and each term counts once per article: an outlet repeating
 * a word six times is one editorial choice, not six independent signals.
 */
export function glossArticle(text: string): GlossResult {
  const found: GlossaryTerm[] = [];
  let remaining = text;

  for (const term of GLOSSARY_BY_LENGTH) {
    if (!remaining.includes(term.zh)) continue;
    found.push(term);
    // Blank out the match so shorter substrings of it cannot also fire.
    remaining = remaining.split(term.zh).join(' '.repeat(term.zh.length));
  }

  const ordered = found.sort((a, b) => text.indexOf(a.zh) - text.indexOf(b.zh));
  return {
    terms: ordered,
    escalationScore: ordered.reduce((s, t) => s + (t.weight ?? 0), 0),
    framingScore: ordered.filter((t) => t.category === 'framing')
      .reduce((s, t) => s + (t.weight ?? 0), 0),
    glossed: ordered.map((t) => t.en),
  };
}

/**
 * Find PRC official escalation formulae. Longest-match-first is essential: rung 4
 * contains rung 3 as a substring, and rung 5 contains a shorter form too. Matching
 * the short version would systematically understate Beijing's stated position.
 */
export function detectLadder(text: string): LadderRung[] {
  const hits: LadderRung[] = [];
  let remaining = text;
  for (const rung of LADDER_BY_LENGTH) {
    if (!remaining.includes(rung.zh)) continue;
    hits.push(rung);
    remaining = remaining.split(rung.zh).join(' '.repeat(rung.zh.length));
  }
  return hits.sort((a, b) => b.severity - a.severity);
}

/** The rung that matters is the highest one present. */
export function highestRung(text: string): LadderRung | null {
  return detectLadder(text)[0] ?? null;
}
