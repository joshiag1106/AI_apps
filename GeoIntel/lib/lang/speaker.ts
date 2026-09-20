/**
 * Whose formula is it?
 *
 * The ladder detector matches formula text wherever it appears; it has no notion of who is
 * speaking. Of the 47 rung-bearing headlines in the 90-day corpus of 2026-09-19, about 19 were
 * other governments using the same language — India and Pakistan protesting each other,
 * Vietnam, Russia to Japan, France to Iran — and the site called every one an "official PRC
 * formula". This reads the headline's grammar to say who spoke.
 *
 * THE RULE. Chinese headlines put the speaker before the formula: <subject>向<target>提出…,
 * <country><office>：…, <subject>方…. So: find every subject marker BEFORE the formula, drop the
 * ones that are targets (introduced by 向 对 就 与 同 准 给 召 …), and take the NEAREST. Markers
 * after the formula are ignored — in 印方交涉中方 the 中方 is the object. A country named inside
 * a longer noun (韩国光州双年展, "the Korean Gwangju Biennale") is not a subject.
 *
 * THE SAFE DIRECTION. This feeds surfaces that say "PRC", so a false PRC is the defect being
 * removed, while a false "other" would silently hide a real Beijing formula. Anything ambiguous
 * — a bare ministry after another state's name, no marker at all — is `unclear`, not a guess.
 * Written from grammar and checked against a hand-labelled fixture; where a rule needed a
 * case-specific hack it was left `unclear` instead.
 */
export type LadderSpeaker = 'prc' | 'other' | 'unclear';

/** One-character abbreviations headlines use for states. */
export const ABBR = '印巴俄日韩美英法德伊菲越澳泰朝';
export const NAMES = ['印度', '巴基斯坦', '俄罗斯', '日本', '韩国', '美国', '英国', '法国', '德国', '伊朗', '菲律宾',
  '越南', '澳大利亚', '泰国', '朝鲜', '以色列', '土耳其', '沙特', '台湾', '乌克兰', '马来西亚', '印尼',
  '新加坡', '加拿大', '意大利', '欧盟'];
const NAME_ALT = NAMES.join('|');
const INSTITUTION = '(?:外交部|国防部|军方|政府|总统府|总统|总理|议员|官员|使馆|当局|代表|发言人|外长|防长|部长|副总统)';
/** What follows a subject: a verb, an adverb of stance, or the colon that introduces a statement. */
const PRED = '(?:严正|强烈|坚决|表示|驳斥|警告|提出|提|已|将|要求|宣布|回应|再|就|向|对|不|愿|却|互相|邀请|要|称|指|说|：|:)';
// What introduces the party being ADDRESSED. Prepositions (向 对 就 与 同 给), verbs of summoning
// (召见 传召 召 准), and verbs of address or condemnation, whose object is the counterparty:
// in 中方强烈谴责日方, 日方 is who is condemned, not who speaks.
export const TARGET_LEAD = /(?:向|对|就|与|同|准|给|召见|传召|召|谴责|批评|指责|敦促|呼吁|制裁|抵制|警告|要求|回击|反制|驳斥|反对)$/;

type Side = 'prc' | 'other' | 'bare';
interface Marker { start: number; end: number; side: Side }

const PRC = new RegExp(
  `中方|我(?:驻[^，：、\\s]{0,6})?(?:大)?使馆|中国(?:驻[^，：、\\s]{1,8}?)?(?:大)?使馆|中国(?:大陆)?(?=${PRED}|的?$)|中国(?=${INSTITUTION})|北京(?=[：:]|${PRED})|国台办`, 'g');
const OTHER = new RegExp(
  // `$` because the text is cut at the formula, and the formula is itself the stance verb: a
  // name directly before 坚决反对 is its subject, though nothing follows it in what we read. `的?$`
  // adds the possessive — "遭到越南的强烈抗议" is Vietnam's protest — but only when the 的 stands
  // directly before the formula, so "中国的芯片" (China's chips) is not taken for a speaker.
  `[${ABBR}]方|(?:${NAME_ALT})(?=${PRED}|${INSTITUTION}|的?$)|[${ABBR}](?=${INSTITUTION})|[${ABBR}]{2,3}`, 'g');
const GROUP = new RegExp(`(?:${NAME_ALT}|中国){2,}`, 'g');
const BARE = /(?:外交部|国防部|商务部)(?:发言人)?/g;

function findMarkers(pre: string): Marker[] {
  const out: Marker[] = [];
  const add = (re: RegExp, side: Side, keep?: (m: RegExpMatchArray) => boolean) => {
    for (const m of pre.matchAll(re)) {
      if (keep && !keep(m)) continue;
      out.push({ start: m.index!, end: m.index! + m[0].length, side });
    }
  };
  add(PRC, 'prc');
  add(OTHER, 'other');
  // Two states named side by side (中国菲律宾, 美日): a mutual subject. Beijing is one of the
  // parties whenever it is named, so the group counts as Beijing's.
  for (const m of pre.matchAll(GROUP)) {
    out.push({ start: m.index!, end: m.index! + m[0].length, side: m[0].includes('中国') ? 'prc' : 'other' });
  }
  // A bare ministry is Beijing's unless another state's name or abbreviation leads it directly.
  add(BARE, 'bare', (m) => {
    const before = pre.slice(0, m.index!);
    return !new RegExp(`(?:${NAME_ALT}|[${ABBR}]|国)$`).test(before);
  });
  out.sort((a, b) => a.start - b.start || b.end - a.end);
  // Drop a marker swallowed by an earlier, longer one.
  return out.filter((m, i) => !out.slice(0, i).some((p) => p.start <= m.start && p.end >= m.end && p !== m));
}

/** The subject markers before the formula, minus those that only name who is being addressed. */
function subjectsBefore(text: string, formula: string): Marker[] | null {
  const at = text.indexOf(formula);
  if (at < 0) return null;
  const pre = text.slice(0, at);
  return findMarkers(pre).filter((m) => !TARGET_LEAD.test(pre.slice(Math.max(0, m.start - 2), m.start)));
}

export function formulaSpeaker(text: string, formula: string): LadderSpeaker {
  const markers = subjectsBefore(text, formula);
  if (!markers || !markers.length) return 'unclear';

  const nearest = markers[markers.length - 1];
  if (nearest.side === 'bare') {
    // A bare 国防部 after 菲律宾军方 is the Philippines' ministry; after 美国 it may be China's
    // answer. Surface grammar cannot tell which, so it is not claimed.
    return markers.some((m) => m !== nearest && m.side === 'other') ? 'unclear' : 'prc';
  }
  return nearest.side;
}

/**
 * Where Beijing's own voice sits in the text before the formula: the nearest subject marker,
 * when that marker is Beijing's (中方, an embassy, a bare ministry). Null when it is anyone
 * else's, when there is none, or when the formula is absent. The target rule reads the clause
 * between this and the formula, and the text on either side of it.
 */
export function formulaAnchor(text: string, formula: string): { start: number; end: number } | null {
  const markers = subjectsBefore(text, formula);
  const nearest = markers?.[markers.length - 1];
  return nearest && nearest.side !== 'other' ? { start: nearest.start, end: nearest.end } : null;
}
