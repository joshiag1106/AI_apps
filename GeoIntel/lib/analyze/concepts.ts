import type { Domain } from '@/data/lexicon';
import { CONCEPTS, DOMAIN_ORDER, NEUTRAL, type Concept } from '@/data/concepts';

/**
 * Reads which concepts a text mentions. Bump MATCHER_VERSION whenever the matching rules change: it is
 * part of the vocabulary fingerprint (lib/analyze/rescore), so stored reports are re-scored.
 *
 * - Latin-script terms match whole words, optionally with one inflection (s, es, d, ed, ing): "war" finds
 *   "wars" but not "award", "software" or "warn".
 * - Other scripts match as substrings: Chinese and Japanese have no spaces, and Arabic, Hindi and Russian
 *   stems carry affixes. Everything is lower-cased first, which matters for Cyrillic.
 * - Longest match first, and a hit overlapping an accepted one is dropped, so "trade war" does not also
 *   count "war". NEUTRAL phrases take part in that masking but count for nothing.
 * - A concept counts once, however many of its words appear.
 */
export const MATCHER_VERSION = 1;

const LATIN = /^[\x20-\x7F]+$/;
const ASCII_TEXT = /^[\x00-\x7F]*$/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Term { text: string; concept: Concept | null; re: RegExp | null }
interface Hit { start: number; end: number; concept: Concept | null }

export interface ConceptMatcher { match(text: string): Concept[] }

export function compileMatcher(concepts: readonly Concept[], neutral: readonly string[] = []): ConceptMatcher {
  const terms: Term[] = [];
  const seen = new Set<string>();
  const add = (raw: string, concept: Concept | null) => {
    const text = raw.toLowerCase();
    const key = `${concept?.id ?? '·neutral'}|${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    const re = LATIN.test(text)
      ? new RegExp(`(?<![\\p{L}\\p{N}])${escape(text)}(?:s|es|d|ed|ing)?(?![\\p{L}\\p{N}])`, 'gu')
      : null;
    terms.push({ text, concept, re });
  };
  for (const c of concepts) for (const list of Object.values(c.terms)) for (const t of list ?? []) add(t, c);
  for (const t of neutral) add(t, null);

  return {
    match(input: string): Concept[] {
      const text = input.toLowerCase();
      const asciiOnly = ASCII_TEXT.test(text);
      const hits: Hit[] = [];
      for (const t of terms) {
        if (t.re) {
          t.re.lastIndex = 0;
          for (let m = t.re.exec(text); m; m = t.re.exec(text)) hits.push({ start: m.index, end: m.index + m[0].length, concept: t.concept });
        } else if (!asciiOnly) {
          for (let i = text.indexOf(t.text); i !== -1; i = text.indexOf(t.text, i + 1)) {
            hits.push({ start: i, end: i + t.text.length, concept: t.concept });
          }
        }
      }
      hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
      const taken: Hit[] = [];
      const found = new Set<Concept>();
      for (const h of hits) {
        if (taken.some((t) => h.start < t.end && t.start < h.end)) continue;
        taken.push(h);
        if (h.concept) found.add(h.concept);
      }
      return [...found];
    },
  };
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
