export type Script =
  | 'Han' | 'Devanagari' | 'Cyrillic' | 'Arabic' | 'Hebrew' | 'Hangul' | 'Kana' | 'Latin' | 'Unknown';

// Ranges use \u escapes so this file carries no literal control characters.
const RANGES: { script: Script; re: RegExp }[] = [
  { script: 'Han',        re: /[一-鿿㐀-䶿]/g },
  { script: 'Kana',       re: /[぀-ヿ]/g },
  { script: 'Hangul',     re: /[가-힯ᄀ-ᇿ]/g },
  { script: 'Devanagari', re: /[ऀ-ॿ]/g },
  { script: 'Cyrillic',   re: /[Ѐ-ӿ]/g },
  { script: 'Arabic',     re: /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g },
  // Added 2026-09-25, alongside the Russia–Ukraine and Middle East beats' new
  // Ukrainian and Hebrew queries. Hebrew (֐-׿) does not overlap the Arabic
  // range above, so this is additive, not a reclassification of anything Arabic.
  { script: 'Hebrew',     re: /[֐-׿]/g },
  { script: 'Latin',      re: /[a-zA-Z]/g },
];

/**
 * Dominant script by character count, not first match. Feed titles habitually append a
 * Latin outlet name ("... - thepaper.cn") to a non-Latin headline, and a first-match
 * detector gets those backwards.
 */
export function detectScript(text: string): Script {
  let winner: Script = 'Unknown';
  let best = 0;
  for (const { script, re } of RANGES) {
    const n = (text.match(re) ?? []).length;
    // Latin needs a clear majority to win, since it contaminates every headline.
    const weighted = script === 'Latin' ? n * 0.5 : n;
    if (weighted > best) { best = weighted; winner = script; }
  }
  return best === 0 ? 'Unknown' : winner;
}

/**
 * Ukrainian and Russian share the Cyrillic alphabet, but not every letter in it:
 * і/ї/є/ґ exist only in Ukrainian orthography, never in standard Russian. Their
 * presence is a reliable tell in either direction, which plain script detection is not.
 *
 * In practice this branch is dead code today — every ingest task supplies an explicit
 * languageHint (the feed's declared language, or the query locale's), so
 * detectLanguage() never actually runs against real ingested text; see
 * lib/ingest/pipeline.ts. It is kept correct anyway, as the fallback it is meant to be.
 */
const UKRAINIAN_TELL = /[іїєґІЇЄҐ]/;

/**
 * Same reasoning as UKRAINIAN_TELL: Persian is written in an extended form of the
 * Arabic script, and پ/چ/ژ/گ (pe/che/zhe/gaf) exist only in that extension, never in
 * standard Arabic. Farsi's own ی (U+06CC) and ک (U+06A9) also differ from Arabic ي/ك,
 * but the four consonants alone are already unambiguous.
 */
const PERSIAN_TELL = /[پچژگ]/;

/** Japanese uses Han too; kana presence is what separates it from Chinese. */
export function detectLanguage(text: string): string {
  if ((text.match(/[぀-ヿ]/g) ?? []).length > 0) return 'ja';
  switch (detectScript(text)) {
    case 'Han': return 'zh';
    case 'Hangul': return 'ko';
    case 'Devanagari': return 'hi';
    case 'Cyrillic': return UKRAINIAN_TELL.test(text) ? 'uk' : 'ru';
    case 'Arabic': return PERSIAN_TELL.test(text) ? 'fa' : 'ar';
    case 'Hebrew': return 'he';
    case 'Latin': return 'en';
    default: return 'unknown';
  }
}

export const SCRIPT_LABEL: Record<Script, string> = {
  Han: 'Chinese', Kana: 'Japanese', Hangul: 'Korean', Devanagari: 'Hindi',
  Cyrillic: 'Russian/Ukrainian', Arabic: 'Arabic/Urdu/Persian', Hebrew: 'Hebrew',
  Latin: 'Latin script', Unknown: 'Unknown',
};

export const LANGUAGE_LABEL: Record<string, string> = {
  zh: 'Chinese', hi: 'Hindi', ru: 'Russian', uk: 'Ukrainian', ar: 'Arabic', ur: 'Urdu',
  he: 'Hebrew', ja: 'Japanese', ko: 'Korean', fa: 'Persian', en: 'English', unknown: 'Unknown',
};
