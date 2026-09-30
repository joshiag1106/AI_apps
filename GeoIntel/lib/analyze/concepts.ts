import type { Domain } from '@/data/lexicon';
import { CONCEPTS, DOMAIN_ORDER, NEUTRAL, type Concept } from '@/data/concepts';
import { compileTerms } from '@/lib/analyze/terms';

/**
 * Reads which concepts a text mentions, under the shared matching rules in lib/analyze/terms (whole
 * Latin words with one inflection, longest match first, overlaps dropped). NEUTRAL phrases take part in
 * the masking but count for nothing, and a concept counts once, however many of its words appear.
 *
 * Bump MATCHER_VERSION whenever those rules change: it is part of the vocabulary fingerprint
 * (lib/analyze/rescore), so stored reports are re-scored.
 */
export const MATCHER_VERSION = 1;

export interface ConceptMatcher { match(text: string): Concept[] }

export function compileMatcher(concepts: readonly Concept[], neutral: readonly string[] = []): ConceptMatcher {
  const entries: { text: string; value: Concept | null }[] = [];
  const seen = new Set<string>();
  const add = (raw: string, concept: Concept | null) => {
    const key = `${concept?.id ?? '·neutral'}|${raw.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ text: raw, value: concept });
  };
  for (const c of concepts) for (const list of Object.values(c.terms)) for (const t of list ?? []) add(t, c);
  for (const t of neutral) add(t, null);
  return compileTerms(entries);
}

/** The domain with the most distinct concepts; ties go to the earlier domain in DOMAIN_ORDER. */
export function topDomain(concepts: readonly Concept[]): Domain | null {
  const counts = new Map<Domain, number>();
  for (const c of concepts) counts.set(c.domain, (counts.get(c.domain) ?? 0) + 1);
  let best: Domain | null = null;
  let bestN = 0;
  for (const d of DOMAIN_ORDER) {
    const n = counts.get(d) ?? 0;
    if (n > bestN) { best = d; bestN = n; }
  }
  return best;
}

const DEFAULT = compileMatcher(CONCEPTS, NEUTRAL);
/** The concepts a text mentions, read with the project's own table. */
export function matchConcepts(text: string): Concept[] {
  return DEFAULT.match(text);
}
