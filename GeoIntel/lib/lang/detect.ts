export type Script =
  | 'Han' | 'Devanagari' | 'Cyrillic' | 'Arabic' | 'Hangul' | 'Kana' | 'Latin' | 'Unknown';

// Ranges use \u escapes so this file carries no literal control characters.
const RANGES: { script: Script; re: RegExp }[] = [
  { script: 'Han',        re: /[一-鿿㐀-䶿]/g },
  { script: 'Kana',       re: /[぀-ヿ]/g },
  { script: 'Hangul',     re: /[가-힯ᄀ-ᇿ]/g },
  { script: 'Devanagari', re: /[ऀ-ॿ]/g },
  { script: 'Cyrillic',   re: /[Ѐ-ӿ]/g },
  { script: 'Arabic',     re: /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g },
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

/** Japanese uses Han too; kana presence is what separates it from Chinese. */
export function detectLanguage(text: string): string {
  if ((text.match(/[぀-ヿ]/g) ?? []).length > 0) return 'ja';
  switch (detectScript(text)) {
    case 'Han': return 'zh';
    case 'Hangul': return 'ko';
    case 'Devanagari': return 'hi';
    case 'Cyrillic': return 'ru';
    case 'Arabic': return 'ar';
    case 'Latin': return 'en';
    default: return 'unknown';
  }
}

export const SCRIPT_LABEL: Record<Script, string> = {
  Han: 'Chinese', Kana: 'Japanese', Hangul: 'Korean', Devanagari: 'Hindi',
  Cyrillic: 'Russian', Arabic: 'Arabic/Urdu', Latin: 'Latin script', Unknown: 'Unknown',
};

export const LANGUAGE_LABEL: Record<string, string> = {
  zh: 'Chinese', hi: 'Hindi', ru: 'Russian', ar: 'Arabic', ur: 'Urdu',
  ja: 'Japanese', ko: 'Korean', fa: 'Persian', en: 'English', unknown: 'Unknown',
};
