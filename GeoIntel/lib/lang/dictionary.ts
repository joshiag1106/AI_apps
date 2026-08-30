import ccedict from 'cc-cedict';

/**
 * General Chinese-English glossing, as the floor under every Chinese headline.
 *
 * The curated security lexicon in `data/glossary.zh` knows 严正交涉 and 国防部 but nothing
 * of ordinary news vocabulary, so measured on the corpus it produced no English line at
 * all for 234 of 473 Chinese events. A headline like 中国公布261名外国失踪人员国籍 —
 * "China releases the nationalities of 261 missing foreigners" — contains not one term a
 * geopolitical lexicon would hold.
 *
 * This is a word-by-word gloss, not a translation, and the UI labels it as such. It reads
 * as "China · announce · foreign · missing · personnel" rather than as English prose. That
 * is the honest limit of a dictionary without grammar, and it is still the difference
 * between a reader getting the gist and getting nothing.
 *
 * Data is CC-CEDICT, CC BY-SA 4.0 — attribution is on /methodology.
 */

type Entry = [string, string, string, string | string[], unknown, unknown];
// The package's own runtime types describe the shape loosely; these are the two facts
// this module relies on — headword to pinyin to offsets, and offsets into `all`.
const SIMPLIFIED = ccedict.data.simplified as unknown as
  Record<string, Record<string, [Record<string, number>, unknown]>>;
const ALL = ccedict.data.all as unknown as Entry[];

/** Longest word worth attempting. CC-CEDICT holds long idioms, but headlines rarely do. */
const MAX_WORD = 6;
/** Enough to convey the gist without the gloss outgrowing the headline above it. */
const MAX_CHARS = 160;

const HAN = /[㐀-䶿一-鿿]/;
const DIGITS = /[0-9]/;

/**
 * First usable English sense for a word, or null.
 *
 * CC-CEDICT stores some headwords as pointers — "variant of 公布[gong1 bu4]" — which say
 * nothing to a reader, so a real definition is preferred whenever the entry has one. Only
 * the first sense is kept: "to announce; to make public; to publish" is three ways of
 * saying one thing, and all three under a headline is noise.
 */
function define(word: string): string | null {
  const idx = SIMPLIFIED[word];
  if (!idx) return null;

  const senses: string[] = [];
  for (const byPinyin of Object.values(idx)) {
    for (const i of Object.values(byPinyin[0])) {
      const raw = ALL[i]?.[3];
      for (const s of Array.isArray(raw) ? raw : [raw]) {
        if (typeof s === 'string' && s) senses.push(s);
      }
    }
  }
  if (!senses.length) return null;

  const real = senses.find((s) => !/^variant of|^see also|^old variant/i.test(s)) ?? senses[0];
  const cleaned = real
    // Cross-references carry their pinyin in brackets, which is noise here.
    .replace(/\[[^\]]*\]/g, '')
    .split(/[;/]/)[0]
    // Lexicographer asides — "(bound form)", "(with)", "(in an international venture)" —
    // are notes about usage, not the meaning a reader needs under a headline.
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Falling back to the uncleaned sense matters for the handful of entries that are
  // nothing but a parenthetical; an empty string would silently drop a real word.
  return cleaned || real.trim() || null;
}

/**
 * Split Chinese text into dictionary words by longest match.
 *
 * pinyin-pro's `segment` returns one entry per character in every mode, so it cannot serve
 * as a word segmenter. Greedy longest-match against the dictionary itself needs no further
 * dependency and is right far more often than character-by-character would be: it keeps
 * 中国 as "China" instead of splitting it into "middle" and "country".
 *
 * Digit runs are kept whole so a count stays readable as 261 rather than 2 · 6 · 1.
 */
export function segmentChinese(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (DIGITS.test(ch)) {
      let j = i;
      while (j < text.length && DIGITS.test(text[j])) j += 1;
      out.push(text.slice(i, j));
      i = j;
      continue;
    }

    if (!HAN.test(ch)) { i += 1; continue; }

    let taken = '';
    for (let len = Math.min(MAX_WORD, text.length - i); len >= 2; len -= 1) {
      const candidate = text.slice(i, i + len);
      if (SIMPLIFIED[candidate]) { taken = candidate; break; }
    }
    out.push(taken || ch);
    i += (taken || ch).length;
  }
  return out;
}

/**
 * Word-by-word English for a Chinese string, or null when nothing resolves.
 *
 * Null rather than '' so a caller can decide not to render the line at all instead of
 * printing an empty one.
 */
export function dictionaryGloss(text: string): string | null {
  if (!text || !HAN.test(text)) return null;

  const parts: string[] = [];
  for (const word of segmentChinese(text)) {
    if (DIGITS.test(word)) { parts.push(word); continue; }
    const d = define(word);
    if (d) parts.push(d);
    if (parts.join(' · ').length > MAX_CHARS) break;
  }
  if (!parts.length) return null;

  const joined = parts.join(' · ');
  return joined.length > MAX_CHARS ? `${joined.slice(0, MAX_CHARS - 1).trimEnd()}…` : joined;
}
