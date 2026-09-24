import { JA_GLOSSARY } from '@/data/glossary.ja';

/** Hiragana or katakana. Chinese does not write them, so their presence means Japanese. */
const KANA = /[぀-ヿ]/;

export function hasKana(text: string): boolean {
  return KANA.test(text);
}

const TERMS = [...JA_GLOSSARY].sort((a, b) => b.ja.length - a.ja.length);
const MAX_CHARS = 160;

/**
 * The English line under a Japanese headline: the glossary terms it contains, longest match first,
 * in reading order, each once. Japanese writes compounds without spaces — 台湾海峡飛行 is "Taiwan
 * Strait" + "flight" — so at each position the longest known term wins and consumes its characters.
 * Null when nothing is recognised: an empty gloss would read as "this says nothing".
 */
export function japaneseGloss(title: string): string | null {
  // Aggregator titles end "| outlet" or " - outlet"; glossing the tag put "Ukraine" (from Mezha's
  // "ウクライナニュース") on every one of that outlet's China–Taiwan headlines.
  const text = title.split(/\s*[|｜]\s*|\s+-\s+/)[0];
  const parts: string[] = [];
  for (let i = 0; i < text.length;) {
    const hit = TERMS.find((t) => text.startsWith(t.ja, i));
    if (!hit) { i += 1; continue; }
    if (!parts.includes(hit.en)) parts.push(hit.en);
    i += hit.ja.length;
    if (parts.join(' · ').length > MAX_CHARS) break;
  }
  return parts.length ? parts.join(' · ') : null;
}
