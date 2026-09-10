/**
 * The seat-holder detector: does the corpus put the person this roster claims into the
 * office it claims for them?
 *
 * Kept side-effect free for the same reason scripts/roster-markers.ts is — roster-audit.ts
 * runs its whole report at import time, so a test importing from it would open the database
 * and print, and would fail in CI where no kautilya.db exists. This file is data and pure
 * functions; both the script and tests/roster-seats.test.ts import it.
 *
 * WHY IT EXISTS. The audit's two flags, FORMER and DISMISSED, both look for a WORD marking a
 * seat as ended. The most common way a label goes wrong prints no such word: a superseded
 * seat is simply reported in the new holder's name, as though it always had been. Min Aung
 * Hlaing was captioned Commander-in-Chief beside headlines calling him Myanmar's President,
 * Keir Starmer held the UK premiership here while 8 articles put Andy Burnham in it, and
 * Jared Kushner was captioned "Envoy, Middle East" over 44 Ukraine articles. Three findings,
 * no flag possible on any of them, all three found by a person reading labels against
 * headlines. This automates that reading for the one language whose grammar permits it.
 *
 * WHY CHINESE ONLY. Chinese headline copy writes the seat as a single adjacent run —
 * 日本首相高市早苗, 英国新首相伯纳姆, 加拿大总理卡尼 — so country, office and name arrive
 * together and can be resolved as a unit. Hindi and Arabic name offices just as often but
 * not in a fixed adjacent order, so extracting a seat from them is a different problem and
 * should not block this one. English is the same: "new Prime Minister Andy Burnham" works,
 * but "the first EU leader to meet new Prime Minister Andy Burnham in Downing Street" puts
 * the country nowhere near the office.
 *
 * WHAT IT CANNOT DO. It reports a seat, never a truth. A mismatch means the corpus named
 * someone else in that office in one sentence, which is a sentence to READ, not a fact to
 * act on — an outlet can be wrong, and a single story is not evidence, as the still-open
 * Vietnam question in data/people.ts records. It never edits the roster.
 */
import type { Person } from '@/data/people';
import { COUNTRIES } from '@/data/countries';
import { WINDOW } from './roster-markers';

export interface Seat {
  /** The word Chinese copy prints for this office. */
  office: string;
  /**
   * The roster `role` strings this office can mean, enumerated EXACTLY rather than matched
   * as substrings. 'Vice President' contains 'President', so a substring test would let a
   * vice-president confirm a presidency and hide a seat that had changed hands. The same
   * trap sits in 'Executive Vice Premier' for 'Premier'. tests/roster-seats.test.ts pins
   * every string here against the live roster, because a role renamed in data/people.ts
   * would otherwise make this detector go QUIET rather than loud.
   */
  roles: string[];
}

export interface SeatMention {
  iso: string;
  office: string;
  roles: string[];
  /** The characters following the office — the candidate name, printed for the reviewer. */
  run: string;
  index: number;
}

export type SeatVerdict =
  | { verdict: 'confirmed'; holder: Person }
  | { verdict: 'mismatch'; holder: Person }
  | { verdict: 'unclaimed' };

export const SEATS: Seat[] = [
  // 总理 is three different offices in English and outlets use it for all of them: Carney is
  // a Prime Minister, Li Qiang a Premier, Merz a Chancellor. Miss one and that state's seat
  // silently stops resolving.
  { office: '总理', roles: ['Prime Minister', 'Premier', 'Chancellor', 'Crown Prince and Prime Minister', 'Prime Minister and Foreign Minister'] },
  { office: '首相', roles: ['Prime Minister', 'Crown Prince and Prime Minister', 'Prime Minister and Foreign Minister'] },
  { office: '总统', roles: ['President'] },
  // The compound roles are listed because the roster genuinely carries them — Ishaq Dar and
  // Bui Thanh Son are both 'Deputy PM and Foreign Minister', and an outlet writing 外长 about
  // either is right. Leaving them out would report a mismatch on a correct roster.
  { office: '外交部长', roles: ['Foreign Minister', 'External Affairs Minister', 'Foreign Secretary', 'Secretary of State', 'Deputy PM and Foreign Minister', 'Prime Minister and Foreign Minister'] },
  { office: '外长', roles: ['Foreign Minister', 'External Affairs Minister', 'Foreign Secretary', 'Secretary of State', 'Deputy PM and Foreign Minister', 'Prime Minister and Foreign Minister'] },
  { office: '国防部长', roles: ['Defence Minister', 'Secretary of Defense', 'Deputy PM and Defence Minister'] },
  { office: '防长', roles: ['Defence Minister', 'Secretary of Defense', 'Deputy PM and Defence Minister'] },
];

/**
 * Words that sit between the country and the office.
 *
 * Both of the headlines this detector was built to catch carry one — 会见英国**新**首相伯纳姆
 * and 越南**政府**总理黎明兴 — so a design matching only adjacent <country><office>, which is
 * what the first sketch of this was, would have missed the exact cases that motivated it.
 * Found by measuring the corpus rather than by reasoning about the grammar.
 */
export const MODIFIERS = ['新', '政府', '现任', '代理', '临时', '首任', '前任'];

/**
 * Characters that cannot begin a name, so a run starting with one is not a person.
 *
 * The measured noise: of 126 country+office occurrences in a 6,315-article corpus, roughly
 * twenty are followed by a verb or particle rather than a name — 德国总理的中国困境,
 * 英国首相通话, 韩国总统府周五表示, 印度外长批评, 美国总统对伊朗. Every one of them starts
 * with a function word, and every real name in the same sample starts with a character that
 * is not one: 泽连斯基, 特朗普, 高市早苗, 马克龙, 安华, 李在明, 赖清德.
 *
 * There is precedent for a linguistic exclusion here: FORMER already drops bare 前 because
 * it is a preposition inside 目前 and 之前. This is the same move.
 *
 * IT WILL BE INCOMPLETE, AND THAT IS THE SAFE DIRECTION. A function word missing from this
 * list produces a false FLAG — a line a reviewer reads and dismisses in seconds — never a
 * missed finding. Do not be tempted to widen it with characters that could plausibly open a
 * surname; suppressing a real name is the failure that matters, and it is silent.
 */
export const NOT_A_NAME_START = new Set(
  ('的了和与及或在于就把被对向从到为是有也还并又曾则都只却仍更最很太等该其此各每另再' +
   '因但而以所由据关认称表说谈指提强呼宣警访致办尚身出通府批会要应可已未无不没日月年' +
   '将同其间内外上下前后中大小多少涨重举任国').split(''),
);

/**
 * Runs that mean the seat word was the FIRST HALF of a longer office, not a seat plus a name.
 *
 * 美国总统特使 is a presidential ENVOY — the detector's first live run reported it as a
 * mismatch against Trump three times. It is a separate list from NOT_A_NAME_START because
 * this case cannot be fixed by banning a leading character: 特 opens 特使 and it also opens
 * 特朗普, so banning it would silence the most-covered person on the roster. The unit that
 * disambiguates is the word, not the character.
 */
export const COMPOUND_OFFICE = ['特使', '办公', '任期', '选举', '候选', '大选', '职位', '官邸', '专机', '顾问', '发言'];

const HAN = /[一-鿿]/;

/** Chinese aliases from the gazetteer, longest first so 马来西亚 wins over any prefix. */
const COUNTRY_ZH: { iso: string; alias: string }[] = COUNTRIES.flatMap((c) =>
  c.aliases.filter((a) => a.length > 0 && [...a].every((ch) => HAN.test(ch))).map((alias) => ({ iso: c.iso, alias })),
).sort((a, b) => b.alias.length - a.alias.length);

/** Offices longest first, so 外交部长 is matched before 外长 and 国防部长 before 防长. */
const OFFICES = [...SEATS].sort((a, b) => b.office.length - a.office.length);

/** How many characters after the office are captured as the candidate name. */
const RUN = 4;

/**
 * Every <country><modifier?><office><name> the text contains.
 *
 * Scans rather than regexes because the country list is 100-odd alternates and the office
 * list overlaps itself; an explicit scan is easier to reason about than the alternation, and
 * this runs over a few thousand rows once a month.
 */
export function findSeatMentions(text: string): SeatMention[] {
  const out: SeatMention[] = [];
  for (const { iso, alias } of COUNTRY_ZH) {
    let from = 0;
    for (let i = text.indexOf(alias, from); i !== -1; i = text.indexOf(alias, from)) {
      from = i + 1;
      let cursor = i + alias.length;
      for (const mod of MODIFIERS) {
        if (text.startsWith(mod, cursor)) {
          cursor += mod.length;
          break;
        }
      }
      const seat = OFFICES.find((s) => text.startsWith(s.office, cursor));
      if (!seat) continue;
      const after = cursor + seat.office.length;
      const run = [...text.slice(after, after + RUN)].filter((ch) => HAN.test(ch)).join('');
      // Two characters is the shortest Chinese personal name; one is always a fragment.
      if (run.length < 2 || NOT_A_NAME_START.has(run[0])) continue;
      if (COMPOUND_OFFICE.some((c) => run.startsWith(c))) continue;
      out.push({ iso, office: seat.office, roles: seat.roles, run, index: i });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * Whether the roster's holder of this seat is the person the corpus names in it.
 *
 * Deliberately does NOT parse where the Chinese name ends. An early version extracted the
 * name and compared it, which truncated 加拿大总理马克[龙] and would have to know every
 * surname length in every language. Instead it asks the only question that matters: is the
 * listed holder's OWN alias sitting next to this office? That reuses WINDOW, the 32-character
 * proximity tuned against this corpus for marksPerson, rather than inventing a second
 * distance that could drift from it.
 */
export function classifySeat(text: string, m: SeatMention, people: Person[]): SeatVerdict {
  const holders = people.filter((p) => p.home === m.iso && m.roles.includes(p.role));
  if (holders.length === 0) return { verdict: 'unclaimed' };

  const start = m.index;
  const end = m.index + m.office.length + WINDOW;
  const near = text.slice(Math.max(0, start), end).toLowerCase();
  for (const holder of holders) {
    if (holder.aliases.some((a) => a.length > 0 && near.includes(a.toLowerCase()))) {
      return { verdict: 'confirmed', holder };
    }
  }
  return { verdict: 'mismatch', holder: holders[0] };
}
