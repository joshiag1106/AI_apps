/**
 * Whom is the formula about?
 *
 * The speaker rule says a formula is Beijing's. This says at whom it is aimed, so the evidence
 * trail can put a dot in the right country's row. Of the 27 Beijing-attributed hits in the 90-day
 * corpus of 2026-09-20, an article's own list of countries could not answer: one statement to
 * Japan lists six. The headline grammar can, about four times in five.
 *
 * THE RULE. The first step that finds exactly one state decides; a step that finds two different
 * ones stops with `null` rather than guess.
 *   1. A pair named with Beijing (中国菲律宾互相…): the other one.
 *   2. In Beijing's own clause — from its subject to the formula — a state introduced by 向 对 就 召
 *      … or written as a side (日方).
 *   3. The state an embassy sits in (中国驻日大使馆).
 *   4. Before Beijing's subject: the party whose act is being answered (美方声称…中方驳斥).
 *   5. After the formula: the object of the protest (强烈抗议日方…).
 *   6. A named official's home state, but only when no state is named anywhere — a headline that
 *      names an official AND a state is about the state's part in it, and the rule cannot tell how.
 *
 * THE SAFE DIRECTION. A wrong target puts a dot in the wrong row and looks confident, while
 * `null` costs a row of "target not stated". So anything ambiguous is `null`: two states, the EU
 * (named, but not a state the site tracks), a company, a bare formula. Never China.
 */
import { extractPeople } from '@/lib/analyze/entities';
import { PEOPLE } from '@/data/people';
import { ABBR, NAMES, TARGET_LEAD, formulaAnchor } from '@/lib/lang/speaker';

/** The state each name the speaker rule knows stands for. 'EU' is recognised but never returned. */
export const NAME_ISO: Record<string, string> = {
  印度: 'IND', 巴基斯坦: 'PAK', 俄罗斯: 'RUS', 日本: 'JPN', 韩国: 'KOR', 美国: 'USA', 英国: 'GBR', 法国: 'FRA',
  德国: 'DEU', 伊朗: 'IRN', 菲律宾: 'PHL', 越南: 'VNM', 澳大利亚: 'AUS', 泰国: 'THA', 朝鲜: 'PRK', 以色列: 'ISR',
  土耳其: 'TUR', 沙特: 'SAU', 台湾: 'TWN', 乌克兰: 'UKR', 马来西亚: 'MYS', 印尼: 'IDN', 新加坡: 'SGP',
  加拿大: 'CAN', 意大利: 'ITA', 欧盟: 'EU',
};
export const ABBR_ISO: Record<string, string> = {
  印: 'IND', 巴: 'PAK', 俄: 'RUS', 日: 'JPN', 韩: 'KOR', 美: 'USA', 英: 'GBR', 法: 'FRA', 德: 'DEU', 伊: 'IRN',
  菲: 'PHL', 越: 'VNM', 澳: 'AUS', 泰: 'THA', 朝: 'PRK',
};

const NAME_ALT = NAMES.join('|');
const NAME_G = new RegExp(NAME_ALT, 'g');
const GROUP = new RegExp(`(?:${NAME_ALT}|中国){2,}`, 'g');
/** What makes a one-character abbreviation a state and not a stray character: the office or the speech verb after it. */
const OFFICIAL = '(?:防衞|防卫|防务|首相|大臣|外务|外相|外长|防长|议员|官员|政府|当局|军方|外交|国防|声称|指称|宣称|称)';
// Alternatives, in order: an abbreviation after a summoning/addressing word (召菲驻华大使); a full
// name; 日方; 驻日; an abbreviation before an office or a speech verb (日防衞大臣, 美声称).
const TOKEN = new RegExp(
  `(?<=召见|传召|召|向|对|就|与|同|准|给)([${ABBR}])(?=驻|方|大使|政府|外交|当局|使馆)|(${NAME_ALT})|([${ABBR}])方|驻([${ABBR}])|([${ABBR}])(?=${OFFICIAL})`,
  'g',
);

interface Mention {
  start: number;
  end: number;
  iso: string;
  /** Written as a side: 日方. */
  side: boolean;
  /** Preceded by a word that introduces the party being addressed. */
  introduced: boolean;
}

function mentions(text: string): Mention[] {
  const out: Mention[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index!;
    const abbr = m[1] ?? m[3] ?? m[4] ?? m[5] ?? '';
    const iso = NAME_ISO[m[2] ?? ''] ?? ABBR_ISO[abbr];
    if (!iso) continue;
    out.push({
      start, end: start + m[0].length, iso,
      side: m[3] !== undefined,
      introduced: m[1] !== undefined || TARGET_LEAD.test(text.slice(Math.max(0, start - 2), start)),
    });
  }
  return out;
}

/** undefined: nothing here, keep looking. null: something here, but it does not settle it — stop. */
function verdict(isos: string[]): string | null | undefined {
  const distinct = [...new Set(isos)];
  if (!distinct.length) return undefined;
  return distinct.length === 1 && distinct[0] !== 'EU' ? distinct[0] : null;
}

export function formulaTarget(text: string, formula: string): string | null {
  const at = text.indexOf(formula);
  if (at < 0) return null;
  const pre = text.slice(0, at);
  const all = mentions(text);
  const anchor = formulaAnchor(text, formula);
  const isos = (ms: Mention[]) => ms.map((m) => m.iso);

  // 1. A pair named with Beijing: the other one.
  for (const group of pre.matchAll(GROUP)) {
    if (!group[0].includes('中国')) continue;
    const mutual = verdict([...group[0].matchAll(NAME_G)].map((m) => NAME_ISO[m[0]]));
    if (mutual !== undefined) return mutual;
  }

  // 2. Beijing's own clause: introduced states and sides between its subject and the formula.
  const clause = all.filter((m) => m.start >= (anchor?.end ?? 0) && m.end <= at);
  let v = verdict(isos(clause.filter((m) => m.introduced || m.side)));
  if (v !== undefined) return v;

  if (anchor) {
    // 3. The state an embassy sits in.
    v = verdict(isos(all.filter((m) => m.start >= anchor.start && m.end <= anchor.end)));
    if (v !== undefined) return v;
    // 4. Before Beijing's subject: the act being answered.
    v = verdict(isos(all.filter((m) => m.end <= anchor.start)));
    if (v !== undefined) return v;
  }

  // 5. After the formula: the object of the protest.
  v = verdict(isos(all.filter((m) => m.start >= at + formula.length)));
  if (v !== undefined) return v;

  // 6. A named official's home state — only when no state is named anywhere.
  if (!all.length) {
    const homes = new Set<string>();
    for (const id of extractPeople(text)) {
      const home = PEOPLE.find((p) => p.id === id)?.home;
      if (home && home !== 'CHN') homes.add(home);
    }
    return verdict([...homes]) ?? null;
  }
  return null;
}
