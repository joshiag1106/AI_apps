/**
 * Reads which terms a text mentions. One set of rules, shared by the concept list (lib/analyze/concepts)
 * and the escalation lexicon (lib/analyze/score). They used to differ: the lexicon compared raw
 * substrings, so "coup" fired in "couple" and "ceasefire violation" also counted "ceasefire" (risk R11).
 *
 * - Latin-script terms match whole words, optionally with one inflection (s, es, d, ed, ing): "war" finds
 *   "wars" but not "award", "software" or "warn".
 * - Other scripts match as substrings: Chinese and Japanese have no spaces, and Arabic, Hindi and Russian
 *   stems carry affixes. Everything is lower-cased first, which matters for Cyrillic.
 * - Longest match first, and a hit overlapping an accepted one is dropped, so "trade war" does not also
 *   count "war". A term whose value is null takes part in that masking but is never returned.
 * - A value is returned once, however many of its terms appear.
 */
const LATIN = /^[\x20-\x7F]+$/;
const ASCII_TEXT = /^[\x00-\x7F]*$/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Term<T> { text: string; value: T | null; re: RegExp | null }
interface Hit<T> { start: number; end: number; value: T | null }

export interface TermMatcher<T> { match(text: string): T[] }

export function compileTerms<T>(entries: readonly { text: string; value: T | null }[]): TermMatcher<T> {
  const terms: Term<T>[] = entries.map(({ text: raw, value }) => {
    const text = raw.toLowerCase();
    const re = LATIN.test(text)
      ? new RegExp(`(?<![\\p{L}\\p{N}])${escape(text)}(?:s|es|d|ed|ing)?(?![\\p{L}\\p{N}])`, 'gu')
      : null;
    return { text, value, re };
  });

  return {
    match(input: string): T[] {
      const text = input.toLowerCase();
      const asciiOnly = ASCII_TEXT.test(text);
      const hits: Hit<T>[] = [];
      for (const t of terms) {
        if (t.re) {
          t.re.lastIndex = 0;
          for (let m = t.re.exec(text); m; m = t.re.exec(text)) hits.push({ start: m.index, end: m.index + m[0].length, value: t.value });
        } else if (!asciiOnly) {
          for (let i = text.indexOf(t.text); i !== -1; i = text.indexOf(t.text, i + 1)) {
            hits.push({ start: i, end: i + t.text.length, value: t.value });
          }
        }
      }
      hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
      const taken: Hit<T>[] = [];
      const found = new Set<T>();
      for (const h of hits) {
        if (taken.some((t) => h.start < t.end && t.start < h.end)) continue;
        taken.push(h);
        if (h.value !== null) found.add(h.value);
      }
      return [...found];
    },
  };
}
