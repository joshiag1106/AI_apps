import { pinyin } from 'pinyin-pro';

/**
 * Romanisation and English for the Chinese text the site renders.
 *
 * The site shows Chinese headlines as they were published — that is the point of reading
 * sources in their own language — but a reader without Chinese cannot get anything from
 * them at all. Pinyin gives them the sound, the English line gives them the sense.
 */

const HAN = /[㐀-䶿一-鿿豈-﫿]/;
/** Han runs, so only they are converted and everything else survives verbatim. */
const HAN_RUN = /[㐀-䶿一-鿿豈-﫿]+/g;

/** Whether the text contains any Han characters worth romanising. */
export function hasChinese(text: string): boolean {
  return HAN.test(text);
}

/**
 * CJK punctuation has no place in a Latin-script line. The Chinese above keeps its own
 * marks; the romanisation reads as English typography, so 中方：强烈抗议 romanises to
 * "zhōng fāng: qiáng liè kàng yì" rather than carrying a fullwidth colon into it.
 */
const PUNCT: Record<string, string> = {
  '：': ':', '，': ',', '。': '.', '、': ',', '；': ';', '！': '!', '？': '?',
  '（': '(', '）': ')', '《': '"', '》': '"', '「': '"', '」': '"',
  '『': '"', '』': '"', '【': '[', '】': ']', '·': '·', '～': '~',
};
const PUNCT_RE = new RegExp(`[${Object.keys(PUNCT).join('')}]`, 'g');

const cache = new Map<string, string>();
/**
 * Bounded so a long-running server cannot grow it without limit. Ladder formulae and
 * repeated headlines are the common case, and they sit far below this.
 */
const CACHE_MAX = 5000;

/**
 * Tone-marked pinyin for the Han runs in `text`, with everything else left alone.
 *
 * Segmenting is not optional. pinyin-pro converts every character it is given, so a whole
 * headline comes back with its Latin and digits destroyed — "DW News 报道" becomes
 * "D W   N e w s   bào dào", and the count in 中国公布261名 becomes "2 6 1". Only the Han
 * runs are handed over; outlet names, numbers and punctuation pass through untouched.
 *
 * Returns '' when there is no Chinese, which is how callers decide not to render a
 * pinyin line at all.
 */
export function toPinyin(text: string): string {
  if (!text || !hasChinese(text)) return '';

  const hit = cache.get(text);
  if (hit !== undefined) return hit;

  const out = text
    .replace(HAN_RUN, (run) => ` ${pinyin(run)} `)
    .replace(PUNCT_RE, (m) => PUNCT[m])
    // Whitespace is normalised last: the substitution above pads every run to keep
    // syllables from fusing onto adjacent Latin text, and that padding must not survive.
    .replace(/\s+/g, ' ')
    // A space before punctuation is an artefact of that padding, not real spacing.
    .replace(/\s+([,.:;!?)\]])/g, '$1')
    .trim();

  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(text, out);
  return out;
}

/**
 * Best available English, in descending order of quality.
 *
 * A real LLM sentence translation beats the deterministic keyword gloss, which beats
 * nothing. Centralised so no call site invents its own precedence, and so a blank string
 * from either source is treated as absent rather than rendered as an empty line.
 */
export function pickEnglish(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const t = c?.trim();
    if (t) return t;
  }
  return null;
}
