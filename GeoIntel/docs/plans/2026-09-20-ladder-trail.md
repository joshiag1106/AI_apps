# Ladder Evidence Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show when Beijing used an escalation formula and about whom — a per-country row of dated dots on China Watch and China dyad pages, each dot backed by the headline it came from.

**Architecture:** A new pure rule `lib/lang/target.ts` reads the state a Beijing formula is aimed at from the headline grammar (reusing the speaker rule's marker finder). `scoreText` stores it on the article (`ladder_target`, back-filled like the speaker). A pure `ladderTrail()` turns Beijing-attributed rung articles into rows of dots — one per (target, day), reprints folded, new-high flagged. `LadderTrail` draws the rows and always renders the same data as a table under the chart.

**Tech Stack:** TypeScript, Next.js 15 / React 19, Vitest (node, `renderToStaticMarkup`), SQLite via `node:sqlite`.

**Spec:** `docs/specs/2026-09-20-ladder-trail-design.md` — read it first. Stage 1: `docs/specs/2026-09-19-ladder-speaker-design.md`.

## Global Constraints

- **The acceptance bar is zero wrong targets on `TARGET_FIXTURE`.** A wrong target puts a dot in the wrong row, silently. `null` (target not stated) is always allowed and costs only recall; resolving about 22 of 27 is the aim, not a gate. The fixture is the whole hit set, so it is also the training set: it proves the rule is coherent, not that it generalises. If a rule needs a case-specific hack, make that case `null`.
- `ladderTarget` is an ISO3 code or `null`. It is non-null **only** when `ladderSpeaker === 'prc'`, and it is **never `'CHN'`**. `'EU'` is recognised so the rule can refuse to guess, but is never returned.
- Two *different* states at the same rule step → `null`, not a guess.
- `ladderTarget` is OPTIONAL on `Article` (`?:`), so the many test helpers that build a full `Article` keep compiling.
- A dot is a (target, day) pair at that day's highest rung. Days are **UTC** calendar days of `publishedAt`. The window is the corpus's first article to today, **capped at 90 days** (`TRAIL_DAYS`).
- The new-high marker means "above every earlier dot in the row"; the **first dot of a row is never marked**; `notStated` dots are never marked.
- Nothing is drawn as a line. Copy must say formulae are read from headlines and snippets only and that no formula found is **not calm**.
- **Escalation scoring, alerts and event ladders are unchanged.** Existing tests pass unchanged except the one named in Task 2.
- Test-first: watch every new test fail for the right reason before implementing.
- **Never put the production domain, server address or mailbox in a tracked file.** Before every commit run `git grep -n -i -E -f ~/.claude/kautilya-leak-patterns.txt -- . ':!.env.local'`; it must print nothing.
- **iCloud hazard:** the repo sits in an iCloud-synced Desktop, which makes " 2"/" 3" copies and restores stale files. Stage explicit paths only (never `git add -A`), and run `git status --short` before each commit and read it.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Do not deploy, merge or open a PR.** Josh reads the shift report and the live-build check first.

## File Structure

| File | Responsibility |
|---|---|
| `lib/lang/speaker.ts` (modify) | Export `ABBR`, `NAMES`, `TARGET_LEAD`; add `formulaAnchor` (pure refactor, no behaviour change) |
| `lib/lang/target.ts` (create) | `formulaTarget`, `NAME_ISO`, `ABBR_ISO` — pure |
| `tests/fixtures/ladder-targets.ts` (create) | The 27 hand-labelled Beijing hits |
| `lib/analyze/score.ts`, `lib/types.ts`, `lib/ingest/pipeline.ts`, `lib/db/index.ts` (modify) | Carry and store the target; back-fill stored rows; two read accessors |
| `lib/verify/trail.ts` (create) | `ladderTrail`, `dotPosition`, `axisTicks` — pure |
| `lib/queries.ts` (modify) | `ladderTrailData()` for the pages |
| `components/LadderTrail.tsx` (create), `components/RevealOnView.tsx` (modify) | The chart, its table, and the dot stagger |
| `app/china/page.tsx`, `app/dyad/[pair]/page.tsx` (modify) | Placement |
| `app/methodology/page.tsx`, `data/glossary.ts`, `app/api/export/route.ts` (modify) | Say what it is |
| `scripts/ladder-shift.ts` (modify) | The targets audit |

---

### Task 1: The target rule and its fixture

**Files:** Modify `lib/lang/speaker.ts`; Create `lib/lang/target.ts`, `tests/fixtures/ladder-targets.ts`; Test `tests/target.test.ts`.

**Interfaces:**
- Consumes: `extractPeople(text): string[]` (`lib/analyze/entities`), `PEOPLE` with `Person.home` (`data/people`).
- Produces: `formulaAnchor(text: string, formula: string): { start: number; end: number } | null` and exported `ABBR`, `NAMES`, `TARGET_LEAD` (speaker.ts); `formulaTarget(text: string, formula: string): string | null`, `NAME_ISO`, `ABBR_ISO` (target.ts); `TargetFixture` and `TARGET_FIXTURE` (fixture).

- [ ] **Step 1: Generate the fixture.** Write this throwaway script in the scratchpad (not committed) and run it from the repo root: `npx tsx --tsconfig tsconfig.scripts.json <scratchpad>/make-target-fixture.ts`. It reads the local corpus's Beijing-attributed rung articles (27 today), assigns the hand label by title prefix, and refuses to write unless every label matches its expected count and every hit is labelled.

```ts
import { writeFileSync } from 'node:fs';
import { allArticles } from '@/lib/db';
import { scoreText } from '@/lib/analyze/score';

// [title prefix, hand-labelled target (null = the headline does not settle it), expected matches]
const LABELS: [string, string | null, number][] = [
  ['中国驻日本大使馆就日方', 'JPN', 1], ['中国驻日使馆就日本涉南海', 'JPN', 1], ['菲律宾坐滩舰', 'PHL', 1],
  ['南海仁爱礁冲突', 'PHL', 1], ['针尖对麦芒', 'PHL', 1], ['高市早苗供奉', 'JPN', 1],
  ['外交部：严正交涉、强烈抗议日方', 'JPN', 1], ['日防衞大臣', 'JPN', 1], ['外交部：强烈谴责日方', 'JPN', 1],
  ['我使馆发言人：中方已向日方', 'JPN', 2], ['中国驻日大使馆提出', 'JPN', 1],
  ['美国财政部长', null, 1],            // names the US and Iran; the answer is to the US, but the grammar cannot say so
  ['美声称', 'USA', 1], ['美方声称', 'USA', 2], ['外交部：中方坚决反对并依法打击黑客', 'USA', 1],
  ['中国严正交涉！菲律宾', 'PHL', 1], ['中方策展团队', 'KOR', 3],
  ['韩国光州双年展批准', null, 1],      // names South Korea and Taiwan
  ['韩国光州双年展出现', 'KOR', 1], ['中方强烈谴责日方', 'JPN', 1],
  ['Anthropic', null, 1],               // a company, not a state
  ['萧美琴闪电访意', null, 1],          // names the EU; Beijing's formula is aimed at the host, not at Taiwan
  ['台湾副总统萧美琴', null, 1],        // Taiwan and Italy, and the formula went to the EU and Italy
];

const hits = allArticles(20000).map((a) => ({ a, s: scoreText(a.title, a.snippet) }))
  .filter((x) => x.s.ladderRung !== null && x.s.ladderSpeaker === 'prc')
  .sort((x, y) => Date.parse(x.a.publishedAt) - Date.parse(y.a.publishedAt) || (x.a.id < y.a.id ? -1 : 1));

const rows: { title: string; snippet: string; formula: string; expected: string | null }[] = [];
for (const [prefix, target, count] of LABELS) {
  const found = hits.filter((x) => x.a.title.startsWith(prefix));
  if (found.length !== count) throw new Error(`"${prefix}": expected ${count} hits, found ${found.length}`);
  for (const { a, s } of found) rows.push({ title: a.title, snippet: a.snippet, formula: s.ladderZh!, expected: target });
}
if (rows.length !== hits.length) throw new Error(`labelled ${rows.length} of ${hits.length} hits`);

writeFileSync('tests/fixtures/ladder-targets.ts', `/**
 * Beijing-attributed ladder formulae, labelled by a human reading them: which state is the formula
 * about? \`null\` means the headline does not settle it.
 *
 * This is every Beijing-attributed rung article in the 90-day corpus of 2026-09-20 — the whole hit
 * set, so it is also what the rule was written against, and a passing score on it proves less than
 * it seems. The held-out sample is the live corpus as it fills: see the risks in
 * docs/specs/2026-09-20-ladder-trail-design.md. Add to this whenever the audit turns up a new case.
 */
export interface TargetFixture { title: string; snippet: string; formula: string; expected: string | null }

export const TARGET_FIXTURE: TargetFixture[] = ${JSON.stringify(rows, null, 2)};
`);
console.log(`wrote ${rows.length} rows`);
```

Expected: `wrote 27 rows`. If a count is off, the corpus differs from the one this plan was written against: stop and re-read the hits rather than editing the labels to fit.

- [ ] **Step 2: Write the failing tests** — `tests/target.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formulaTarget, NAME_ISO, ABBR_ISO } from '@/lib/lang/target';
import { formulaAnchor, ABBR, NAMES } from '@/lib/lang/speaker';
import { BY_ISO } from '@/data/countries';
import { TARGET_FIXTURE } from './fixtures/ladder-targets';

/**
 * A Beijing formula says how hard; the target says at whom. The headline usually says — 向日方,
 * 召菲驻华大使, 美方声称…中方驳斥 — but it can also name a bystander, two states, or nobody. So the
 * rule is judged on one thing above all: it must never name the wrong state. Unresolved is fine.
 */
describe('whom a Beijing formula is about', () => {
  it.each([
    ['a state after 向', '中方已向印度提出严正交涉', '严正交涉', 'IND'],
    ['a side after 向 and 就', '中方已就此向美方提出严正交涉', '严正交涉', 'USA'],
    ['a side after 对', '外交部发言人：中方对印方的做法表示强烈抗议', '强烈抗议', 'IND'],
    ['the state an embassy sits in', '中国驻美使馆：坚决反对美方的做法', '坚决反对', 'USA'],
    ['the party whose act is being answered', '俄方指责中方，中方驳斥：坚决反对', '坚决反对', 'RUS'],
    ['an abbreviation after 召', '外交部召见英驻华大使 提出严正交涉', '严正交涉', 'GBR'],
    ['the other state of a mutual exchange', '中国菲律宾互相传召对方大使“严正交涉”', '严正交涉', 'PHL'],
    ['a state named after the formula', '外交部：严正交涉、强烈抗议日方消极动向', '强烈抗议', 'JPN'],
    ['the home state of a named official, when no state is named', '高市早苗供奉靖国神社，中方：严正交涉', '严正交涉', 'JPN'],
  ])('reads %s', (_why, text, formula, want) => {
    expect(formulaTarget(text, formula)).toBe(want);
  });

  it.each([
    ['no state at all', '中方严正交涉', '严正交涉'],
    ['a bare 北京：', '北京：坚决反对', '坚决反对'],
    ['two states in Beijing’s clause', '中方向美方和日方提出严正交涉', '严正交涉'],
    ['a state and the subject matter', '中方就台湾问题向美方提出严正交涉', '严正交涉'],
    ['the EU, which is not a state the site tracks', '中方向欧盟提出严正交涉', '严正交涉'],
    ['a company', 'Anthropic发布报告 北京：坚决反对攻击抹黑', '坚决反对'],
    ['a named official when a state is named too', '萧美琴闪电访意欧盟退出论坛 中方严正交涉', '严正交涉'],
    ['a formula that is not in the text', '中方向印度提出交涉', '严正交涉'],
  ])('leaves %s unstated', (_why, text, formula) => {
    expect(formulaTarget(text, formula)).toBeNull();
  });

  it('is deterministic', () => {
    const t = '中方已向日方提出严正交涉';
    expect(formulaTarget(t, '严正交涉')).toBe(formulaTarget(t, '严正交涉'));
  });
});

describe('the state tables', () => {
  it('cover exactly the names and abbreviations the speaker rule knows', () => {
    expect(Object.keys(NAME_ISO).sort()).toEqual([...NAMES].sort());
    expect(Object.keys(ABBR_ISO).sort().join('')).toBe([...ABBR].sort().join(''));
  });

  it('name only states the site has a record of', () => {
    for (const iso of [...Object.values(NAME_ISO), ...Object.values(ABBR_ISO)]) {
      if (iso === 'EU') continue;
      expect(BY_ISO.has(iso), iso).toBe(true);
    }
  });

  it('never map to China', () => {
    expect(Object.values(NAME_ISO)).not.toContain('CHN');
    expect(Object.values(ABBR_ISO)).not.toContain('CHN');
  });
});

describe('where Beijing’s own voice sits', () => {
  it('is the nearest subject before the formula, when it is Beijing’s', () => {
    expect(formulaAnchor('中方已向日方提出严正交涉', '严正交涉')).toEqual({ start: 0, end: 2 });
  });

  it('is a bare ministry’s name', () => {
    expect(formulaAnchor('外交部：严正交涉', '严正交涉')).toEqual({ start: 0, end: 3 });
  });

  it('is nothing when the nearest subject is another party', () => {
    expect(formulaAnchor('印方强烈抗议', '强烈抗议')).toBeNull();
  });

  it('is nothing when the formula is absent or nobody speaks before it', () => {
    expect(formulaAnchor('中方向印度提出交涉', '严正交涉')).toBeNull();
    expect(formulaAnchor('严正交涉', '严正交涉')).toBeNull();
  });
});

describe('against the hand-labelled fixture', () => {
  const rows = TARGET_FIXTURE.map((r) => ({ ...r, got: formulaTarget(`${r.title} ${r.snippet}`, r.formula) }));

  it('never names the wrong state', () => {
    const bad = rows.filter((r) => r.got !== null && r.got !== r.expected).map((r) => `${r.got} (want ${r.expected}): ${r.title}`);
    expect(bad, `wrong target:\n${bad.join('\n')}`).toEqual([]);
  });

  it('never names China', () => {
    expect(rows.filter((r) => r.got === 'CHN')).toEqual([]);
  });

  it('still resolves most of them — a canary, not the bar', () => {
    // The aim is about 22 of 27. A rule that resolves far fewer has stopped working, which
    // would pass "never wrong" trivially by returning null for everything.
    expect(rows.filter((r) => r.got !== null).length).toBeGreaterThanOrEqual(20);
  });

  it('has a hand label for every row', () => {
    expect(rows.length).toBe(27);
  });
});
```

- [ ] **Step 3: Run to see it fail.** `npx vitest run tests/target.test.ts` — Expected: FAIL, "Failed to resolve import '@/lib/lang/target'".

- [ ] **Step 4: Export the shared constants and add `formulaAnchor`** in `lib/lang/speaker.ts` (a pure refactor — behaviour identical). Make three constants exported:

```ts
export const ABBR = '印巴俄日韩美英法德伊菲越澳泰朝';
export const NAMES = ['印度', '巴基斯坦', /* …unchanged… */ '欧盟'];
export const TARGET_LEAD = /(?:向|对|就|与|同|准|给|召见|传召|召|谴责|批评|指责|敦促|呼吁|制裁|抵制|警告|要求|回击|反制|驳斥|反对)$/;
```

Then replace the whole of `formulaSpeaker` (from `export function formulaSpeaker` to the end of the file) with a shared helper, the same function on top of it, and the new export:

```ts
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
```

- [ ] **Step 5: Write the rule** — `lib/lang/target.ts` (this exact code has been run against all 27 fixture hits and the grammar cases above):

```ts
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
```

- [ ] **Step 6: Run the new tests and the speaker tests.** `npx vitest run tests/target.test.ts tests/ladder-speaker.test.ts tests/ladder-speaker-events.test.ts` — Expected: all PASS, and the speaker tests pass **unchanged** (proof the refactor moved nothing). If a fixture row is reported wrong, do not loosen the label or add a case-specific branch: read the row, and if the grammar cannot settle it, make it `null` in the rule by restricting the step that fired, then say so in the Deviations section.

- [ ] **Step 7: Leak-scan and commit.**

```bash
git grep -n -i -E -f ~/.claude/kautilya-leak-patterns.txt -- . ':!.env.local'
git status --short
git add lib/lang/speaker.ts lib/lang/target.ts tests/fixtures/ladder-targets.ts tests/target.test.ts
git commit -m "Read whom a Beijing formula is about from the headline grammar

A rule beside the speaker rule: the state after 向/对/就/召, the state whose act is answered,
an embassy's host, or the object of the protest, else null. Two states, the EU, a company
or a bare formula are never guessed. Zero wrong targets on the 27 hand-labelled hits.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Carry and store the target

**Files:** Modify `lib/types.ts`, `lib/analyze/score.ts`, `lib/ingest/pipeline.ts`, `lib/db/index.ts`, `tests/ladder-speaker-store.test.ts`; Create `tests/ladder-target-store.test.ts`.

**Interfaces:**
- Consumes: `formulaTarget` (Task 1).
- Produces: `Article.ladderTarget?: string | null`; `ScoreResult.ladderTarget: string | null`; `LadderPatch.ladderTarget`; `updateLadders` accepting it; `ladderTrailArticles(): Article[]` (Beijing-attributed rung articles, oldest first) and `corpusSince(): string | null` (earliest real `published_at`) in `lib/db`.

- [ ] **Step 1: Write the failing tests** — `tests/ladder-target-store.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { scoreText } from '@/lib/analyze/score';
import { ladderPatches } from '@/lib/ingest/pipeline';
import type { Article } from '@/lib/types';

let n = 0;
function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `t${String(n).padStart(4, '0')}`, url: `https://x/target/${n}`,
    title: '中方已向日方提出严正交涉', outlet: 'Xinhua',
    publishedAt: '2026-09-19T10:00:00.000Z', snippet: '', imageUrl: null, language: 'zh',
    beatId: null, localeKey: null, sourceCountry: 'CHN', ownership: 'state', tier: 2,
    isPrimary: true, actors: ['CHN', 'JPN'], people: [], hotspots: [], domain: 'Diplomatic',
    escalation: 0, framing: 0, ladderRung: null, ladderZh: null, ladderEn: null,
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}
const beijing = { ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'makes solemn representations', ladderSpeaker: 'prc' as const };

/** The target is only meaningful when Beijing is the one speaking. */
describe('analysis records whom the formula is about', () => {
  it('says Japan for Beijing’s formula to Japan', () => {
    const s = scoreText('中方已向日方提出严正交涉');
    expect(s.ladderSpeaker).toBe('prc');
    expect(s.ladderTarget).toBe('JPN');
  });

  it('says nothing for a formula that is not Beijing’s, even when a state is plain', () => {
    const s = scoreText('印方强烈不满，紧急召见巴方外交人员');
    expect(s.ladderSpeaker).toBe('other');
    expect(s.ladderTarget).toBeNull();
  });

  it('says nothing when the headline does not name one', () => {
    const s = scoreText('中方严正交涉');
    expect(s.ladderSpeaker).toBe('prc');
    expect(s.ladderTarget).toBeNull();
  });

  it('says nothing when there is no formula', () => {
    expect(scoreText('今天天气很好').ladderTarget).toBeNull();
  });
});

describe('the target is stored with the article', () => {
  let db: typeof import('@/lib/db');
  beforeAll(async () => {
    process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-target-')), 'test.db');
    db = await import('@/lib/db');
  });

  it('round-trips through the database', () => {
    const a = art({ ...beijing, ladderTarget: 'JPN' });
    db.upsertArticles([a]);
    expect(db.allArticles(100).find((x) => x.id === a.id)!.ladderTarget).toBe('JPN');
  });

  it('reads back null for an article stored without one', () => {
    const a = art({ title: '一则没有措辞的标题' });
    db.upsertArticles([a]);
    expect(db.allArticles(100).find((x) => x.id === a.id)!.ladderTarget).toBeNull();
  });

  it('rewrites the target when the same article is stored again', () => {
    const a = art({ ...beijing, ladderTarget: null });
    db.upsertArticles([a]);
    db.upsertArticles([{ ...a, ladderTarget: 'JPN' }]);
    expect(db.allArticles(100).find((x) => x.id === a.id)!.ladderTarget).toBe('JPN');
  });

  it('is patched onto a stored row by updateLadders', () => {
    const a = art({ ...beijing });
    db.upsertArticles([a]);
    db.updateLadders([{ id: a.id, ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'x', ladderSpeaker: 'prc', ladderTarget: 'JPN' }]);
    expect(db.allArticles(100).find((x) => x.id === a.id)!.ladderTarget).toBe('JPN');
  });
});

describe('the trail accessors', () => {
  let db: typeof import('@/lib/db');
  beforeAll(async () => {
    vi.resetModules();
    process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-trail-')), 'test.db');
    db = await import('@/lib/db');
  });

  it('report no start when the corpus is empty', () => {
    expect(db.corpusSince()).toBeNull();
    expect(db.ladderTrailArticles()).toEqual([]);
  });

  it('return only Beijing-attributed rung articles, oldest first', () => {
    const late = art({ ...beijing, publishedAt: '2026-09-10T08:00:00.000Z', ladderTarget: 'JPN' });
    const early = art({ ...beijing, publishedAt: '2026-09-01T08:00:00.000Z', ladderTarget: 'PHL' });
    const other = art({ ...beijing, ladderSpeaker: 'other', publishedAt: '2026-09-05T08:00:00.000Z' });
    const unclear = art({ ...beijing, ladderSpeaker: 'unclear', publishedAt: '2026-09-06T08:00:00.000Z' });
    const bare = art({ title: '没有措辞', publishedAt: '2026-08-30T08:00:00.000Z' });
    db.upsertArticles([late, early, other, unclear, bare]);
    expect(db.ladderTrailArticles().map((a) => a.id)).toEqual([early.id, late.id]);
  });

  it('start the corpus at its earliest real article, ignoring a placeholder date', () => {
    db.upsertArticles([art({ title: '没有日期的稿件', publishedAt: '1970-01-01T00:00:00.000Z' })]);
    expect(db.corpusSince()).toBe('2026-08-30T08:00:00.000Z');
  });
});

describe('a database created before the column existed', () => {
  it('gains it, and opening it again is harmless', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'kautilya-legacy-target-')), 'legacy.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE articles (
      id TEXT PRIMARY KEY, url TEXT UNIQUE, title TEXT, outlet TEXT,
      published_at TEXT, snippet TEXT, image_url TEXT, language TEXT,
      beat_id TEXT, locale_key TEXT, source_country TEXT, ownership TEXT,
      tier INTEGER, is_primary INTEGER, actors TEXT, hotspots TEXT, domain TEXT,
      escalation REAL, framing REAL, ladder_rung INTEGER, ladder_zh TEXT,
      ladder_en TEXT, ladder_speaker TEXT, glossed TEXT, title_en TEXT, relevant INTEGER, video_id TEXT, ingested_at TEXT)`);
    old.close();

    process.env.KAUTILYA_DB = path;
    vi.resetModules();
    const first = await import('@/lib/db');
    const cols = (first.getDb().prepare('PRAGMA table_info(articles)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('ladder_target');

    vi.resetModules();
    const again = await import('@/lib/db');
    expect(() => again.getDb()).not.toThrow();
  });
});

describe('back-filling rows that are already stored', () => {
  it('patches a Beijing row that has no target yet', () => {
    const stored = art({ ...beijing });
    const patches = ladderPatches([stored]);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ id: stored.id, ladderSpeaker: 'prc', ladderTarget: 'JPN' });
  });

  it('leaves a row that is already right alone', () => {
    const s = scoreText('中方已向日方提出严正交涉');
    const stored = art({ ladderRung: s.ladderRung, ladderZh: s.ladderZh, ladderEn: s.ladderEn, ladderSpeaker: s.ladderSpeaker, ladderTarget: s.ladderTarget });
    expect(ladderPatches([stored])).toEqual([]);
  });

  it('leaves a row with no formula alone', () => {
    expect(ladderPatches([art({ title: '今天天气很好' })])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see it fail.** `npx vitest run tests/ladder-target-store.test.ts` — Expected: FAIL (`ladderTarget` undefined; `corpusSince is not a function`).

- [ ] **Step 3: `lib/types.ts`** — after the `ladderSpeaker` field of `Article`, add:

```ts
  /**
   * The state a Beijing formula is aimed at — an ISO3 code, or null when the headline does not
   * say. Only ever set when ladderSpeaker is 'prc', and never 'CHN'. See lib/lang/target.
   */
  ladderTarget?: string | null;
```

- [ ] **Step 4: `lib/analyze/score.ts`** — import `formulaTarget` next to `formulaSpeaker` (`import { formulaTarget } from '@/lib/lang/target';`); add to `ScoreResult`, after `ladderSpeaker`:

```ts
  /** Whom a Beijing formula is aimed at — null unless the speaker is Beijing and the headline says. */
  ladderTarget: string | null;
```

and in `scoreText` after `const speaker = ...`:

```ts
  const target = rung && speaker === 'prc' ? formulaTarget(raw, rung.zh) : null;
```

and add `ladderTarget: target,` after `ladderSpeaker: speaker,` in the returned object.

- [ ] **Step 5: `lib/ingest/pipeline.ts`** — add `ladderTarget: string | null;` to `LadderPatch` after `ladderSpeaker`; change `ladderPatches` so a row is patched when the target is stale too:

```ts
    if (a.ladderRung === s.ladderRung && (a.ladderSpeaker ?? null) === s.ladderSpeaker
      && (a.ladderTarget ?? null) === s.ladderTarget) continue;
    out.push({
      id: a.id, ladderRung: s.ladderRung, ladderZh: s.ladderZh, ladderEn: s.ladderEn,
      ladderSpeaker: s.ladderSpeaker, ladderTarget: s.ladderTarget,
    });
```

and in `enrich` (the object that carries `ladderSpeaker: s.ladderSpeaker,`) add `ladderTarget: s.ladderTarget,` after it.

- [ ] **Step 6: `lib/db/index.ts`** — six edits:
  1. In the `CREATE TABLE articles` statement, change `ladder_speaker TEXT, glossed TEXT` to `ladder_speaker TEXT, ladder_target TEXT, glossed TEXT`.
  2. After the `ladder_speaker` migration block, add:
     ```ts
       if (!cols.has('ladder_target')) {
         db.exec('ALTER TABLE articles ADD COLUMN ladder_target TEXT');
       }
     ```
  3. In `upsertArticles`: add `ladder_target` after `ladder_speaker` in the column list, `@ladder_target` after `@ladder_speaker` in `VALUES`, `ladder_target=excluded.ladder_target,` after `ladder_speaker=excluded.ladder_speaker,` in `DO UPDATE SET`, and `ladder_target: S(a.ladderTarget ?? null),` after the `ladder_speaker: ...` binding.
  4. In `rowToArticle`, after `ladderSpeaker: r.ladder_speaker ?? null,` add `ladderTarget: r.ladder_target ?? null,`.
  5. `updateLadders`: add `ladderTarget: string | null;` to the patch type, change the SQL to `UPDATE articles SET ladder_rung=@r, ladder_zh=@z, ladder_en=@e, ladder_speaker=@s, ladder_target=@t WHERE id=@id`, and pass `t: S(p.ladderTarget)`.
  6. After `articlesByIds`, add:
     ```ts
     /** Beijing's own rung-bearing articles, oldest first — what the evidence trail is drawn from. */
     export function ladderTrailArticles(): Article[] {
       return getDb()
         .prepare("SELECT * FROM articles WHERE ladder_rung IS NOT NULL AND ladder_speaker = 'prc' ORDER BY published_at ASC")
         .all().map(rowToArticle);
     }

     /**
      * When the corpus starts: the earliest real publication date. Placeholder dates (feeds that
      * send none) are ignored, or one of them would stretch the trail's axis back to 1970.
      */
     export function corpusSince(): string | null {
       const r = getDb().prepare("SELECT MIN(published_at) AS d FROM articles WHERE published_at > '2000'").get() as { d: string | null } | undefined;
       return r?.d ?? null;
     }
     ```

- [ ] **Step 7: Update the one existing test that must change.** In `tests/ladder-speaker-store.test.ts`, the test `'leaves a row that is already right alone'` builds a stored row from the score but omits the new field, so it would now be re-patched. Add `ladderTarget: s.ladderTarget` to that `art({...})` call. Nothing else in that file changes.

- [ ] **Step 8: Run.** `npx vitest run tests/ladder-target-store.test.ts tests/ladder-speaker-store.test.ts` — Expected: PASS. Then `npx tsc --noEmit` — Expected: clean.

- [ ] **Step 9: Full suite, leak-scan, commit.**

```bash
npx vitest run
git grep -n -i -E -f ~/.claude/kautilya-leak-patterns.txt -- . ':!.env.local'
git status --short
git add lib/types.ts lib/analyze/score.ts lib/ingest/pipeline.ts lib/db/index.ts tests/ladder-speaker-store.test.ts tests/ladder-target-store.test.ts
git commit -m "Store whom each Beijing formula is about, and back-fill stored rows

An additive ladder_target column, set only for a Beijing speaker, carried through the
upsert, the row mapper and the ladder back-fill, so the first ingest after a deploy fills
every stored row. Two accessors feed the evidence trail.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Expected from the full suite: every test passes (`analyse-route.test.ts` may time out under load — a known, unrelated flake; re-run it alone to confirm).

---

### Task 3: The trail

**Files:** Create `lib/verify/trail.ts`; Test `tests/ladder-trail.test.ts`; Modify `lib/queries.ts`.

**Interfaces:**
- Consumes: `reprintFamilies(articles): { representative: Article; members: Article[] }[]` (`lib/verify/reprints`); `Article`.
- Produces: `TRAIL_DAYS = 90`; `TrailEvidence`, `TrailDot`, `TrailRow`, `Trail`; `ladderTrail(articles, opts)`; `dotPosition(day, trail)`; `axisTicks(trail, n?)`; `ladderTrailData(): Trail` (queries).

- [ ] **Step 1: Write the failing tests** — `tests/ladder-trail.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ladderTrail, dotPosition, axisTicks, TRAIL_DAYS } from '@/lib/verify/trail';
import type { Article } from '@/lib/types';

let n = 0;
function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `r${String(n).padStart(4, '0')}`, url: `https://x/trail/${n}`,
    title: `中方就第${n}号事件向日方提出严正交涉并强烈抗议`, outlet: `Outlet ${n}`,
    publishedAt: '2026-08-15T10:00:00.000Z', snippet: '', imageUrl: null, language: 'zh',
    beatId: null, localeKey: null, sourceCountry: 'CHN', ownership: 'state', tier: 2,
    isPrimary: false, actors: ['CHN', 'JPN'], people: [], hotspots: [], domain: 'Diplomatic',
    escalation: 0, framing: 0, ladderRung: 8, ladderZh: '强烈抗议', ladderEn: 'strong protest',
    ladderSpeaker: 'prc', ladderTarget: 'JPN',
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}
const OPTS = { since: '2026-06-20T00:00:00.000Z', until: '2026-09-17T12:00:00.000Z' };
const day = (d: string, h = 10) => `${d}T${String(h).padStart(2, '0')}:00:00.000Z`;

describe('what counts as a dot', () => {
  it('draws only Beijing’s own formulae', () => {
    const t = ladderTrail([
      art(),
      art({ ladderSpeaker: 'other' }),
      art({ ladderSpeaker: 'unclear' }),
      art({ ladderSpeaker: null }),
      art({ ladderRung: null, ladderZh: null, ladderEn: null }),
    ], OPTS);
    expect(t.dots).toBe(1);
    expect(t.rows[0].dots[0].reports).toBe(1);
  });

  it('is one dot per country per day, at that day’s highest rung', () => {
    const t = ladderTrail([
      art({ ladderRung: 7, ladderZh: '强烈谴责', ladderEn: 'strong condemnation' }),
      art({ ladderRung: 8 }),
      art({ ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'solemn representations' }),
    ], OPTS);
    expect(t.rows).toHaveLength(1);
    const [dot] = t.rows[0].dots;
    expect(t.rows[0].dots).toHaveLength(1);
    expect(dot).toMatchObject({ target: 'JPN', day: '2026-08-15', rung: 8, zh: '强烈抗议', en: 'strong protest', reports: 3 });
  });

  it('is a separate dot for another day, and another row for another country', () => {
    const t = ladderTrail([
      art({ publishedAt: day('2026-08-15') }),
      art({ publishedAt: day('2026-08-16') }),
      art({ publishedAt: day('2026-08-15'), ladderTarget: 'PHL' }),
    ], OPTS);
    expect(t.rows.map((r) => r.target).sort()).toEqual(['JPN', 'PHL']);
    expect(t.rows.find((r) => r.target === 'JPN')!.dots.map((d) => d.day)).toEqual(['2026-08-15', '2026-08-16']);
  });

  it('counts days in UTC', () => {
    const t = ladderTrail([
      art({ publishedAt: '2026-09-10T23:30:00.000Z' }),
      art({ publishedAt: '2026-09-11T00:30:00.000Z' }),
      art({ publishedAt: '2026-09-10T23:30:00-05:00' }), // 04:30 UTC on the 11th
    ], OPTS);
    expect(t.rows[0].dots.map((d) => [d.day, d.reports])).toEqual([['2026-09-10', 1], ['2026-09-11', 2]]);
  });

  it('skips an article whose date cannot be read', () => {
    expect(ladderTrail([art({ publishedAt: 'not a date' })], OPTS).dots).toBe(0);
  });
});

describe('reprints', () => {
  const same = '中方强烈谴责日方涉靖国神社消极动向，已向日方提出严正交涉';

  it('count once as originals but every time as reports', () => {
    const t = ladderTrail([art({ title: same }), art({ title: same }), art({ title: '外交部：强烈抗议日方涉靖国神社的一系列消极动向' })], OPTS);
    const [dot] = t.rows[0].dots;
    expect(dot.reports).toBe(3);
    expect(dot.originals).toBe(2);
    expect(dot.evidence).toHaveLength(2);
  });

  it('carry one headline per original as evidence, highest rung first', () => {
    const t = ladderTrail([
      art({ title: '外交部：强烈谴责日方涉靖国神社消极动向', ladderRung: 7 }),
      art({ title: '我使馆发言人：中方已向日方提出严正交涉、强烈抗议', ladderRung: 8 }),
    ], OPTS);
    expect(t.rows[0].dots[0].evidence.map((e) => e.rung)).toEqual([8, 7]);
  });
});

describe('the new-high marker', () => {
  const rungs = (rs: number[]) => rs.map((r, i) => art({ ladderRung: r, publishedAt: day(`2026-08-${String(10 + i).padStart(2, '0')}`) }));

  it('marks a rung above every earlier dot in the row, and never the first dot', () => {
    const t = ladderTrail(rungs([4, 8, 6, 8, 9]), OPTS);
    expect(t.rows[0].dots.map((d) => d.newHigh)).toEqual([false, true, false, false, true]);
  });

  it('does not mark a repeat of the same rung', () => {
    expect(ladderTrail(rungs([6, 6]), OPTS).rows[0].dots.map((d) => d.newHigh)).toEqual([false, false]);
  });

  it('is judged within each row, not across rows', () => {
    const t = ladderTrail([...rungs([8, 4]), art({ ladderTarget: 'PHL', ladderRung: 4, publishedAt: day('2026-08-20') })], OPTS);
    expect(t.rows.find((r) => r.target === 'PHL')!.dots[0].newHigh).toBe(false);
  });
});

describe('a formula whose target the headline does not state', () => {
  it('goes in its own list, never in a row, and is never a new high', () => {
    const t = ladderTrail([art({ ladderTarget: null, ladderRung: 4 }), art({ ladderTarget: null, ladderRung: 9, publishedAt: day('2026-08-20') })], OPTS);
    expect(t.rows).toEqual([]);
    expect(t.notStated.map((d) => [d.target, d.newHigh])).toEqual([[null, false], [null, false]]);
    expect(t.dots).toBe(2);
  });
});

describe('the order of the rows', () => {
  it('puts the country with the most recent dot first, then the higher rung, then the code', () => {
    const t = ladderTrail([
      art({ ladderTarget: 'KOR', publishedAt: day('2026-09-03'), ladderRung: 8 }),
      art({ ladderTarget: 'JPN', publishedAt: day('2026-09-09'), ladderRung: 8 }),
      art({ ladderTarget: 'USA', publishedAt: day('2026-09-09'), ladderRung: 6 }),
      art({ ladderTarget: 'PHL', publishedAt: day('2026-09-09'), ladderRung: 6 }),
    ], OPTS);
    expect(t.rows.map((r) => r.target)).toEqual(['JPN', 'PHL', 'USA', 'KOR']);
  });

  it('is the same whatever order the articles arrive in', () => {
    const list = [art({ publishedAt: day('2026-08-15') }), art({ ladderTarget: 'PHL', publishedAt: day('2026-07-21'), ladderRung: 4 }), art({ publishedAt: day('2026-08-16') })];
    expect(JSON.stringify(ladderTrail([...list].reverse(), OPTS))).toBe(JSON.stringify(ladderTrail(list, OPTS)));
  });
});

describe('the window', () => {
  it('starts at the corpus’s first day and ends today', () => {
    const t = ladderTrail([art()], OPTS);
    expect(t.since).toBe('2026-06-20');
    expect(t.until).toBe('2026-09-17');
  });

  it('is capped at 90 days, and leaves out anything older', () => {
    const t = ladderTrail([art({ publishedAt: day('2026-05-01') }), art({ publishedAt: day('2026-08-01') })], { since: '2026-04-01T00:00:00.000Z', until: '2026-09-17T12:00:00.000Z' });
    expect(TRAIL_DAYS).toBe(90);
    expect(t.since).toBe('2026-06-19');
    expect(t.dots).toBe(1);
  });

  it('leaves out anything before the corpus began or after today', () => {
    expect(ladderTrail([art({ publishedAt: day('2026-06-01') }), art({ publishedAt: day('2026-09-30') })], OPTS).dots).toBe(0);
  });

  it('is empty, not broken, with no articles', () => {
    expect(ladderTrail([], OPTS)).toMatchObject({ rows: [], notStated: [], dots: 0, since: '2026-06-20' });
  });
});

describe('linking a dot to its event', () => {
  it('uses the event carrying the day’s highest rung', () => {
    const low = art({ ladderRung: 4 });
    const high = art({ ladderRung: 8 });
    const eventOf = new Map([[low.id, 'ev-low'], [high.id, 'ev-high']]);
    expect(ladderTrail([low, high], { ...OPTS, eventOf }).rows[0].dots[0].eventId).toBe('ev-high');
  });

  it('is null when the article belongs to no event the page knows', () => {
    expect(ladderTrail([art()], OPTS).rows[0].dots[0].eventId).toBeNull();
  });
});

describe('placing a dot on the axis', () => {
  const trail = { since: '2026-06-20', until: '2026-09-17' };

  it('puts the first day near the left and the last near the right', () => {
    expect(dotPosition('2026-06-20', trail)).toBeGreaterThan(0);
    expect(dotPosition('2026-06-20', trail)).toBeLessThan(0.02);
    expect(dotPosition('2026-09-17', trail)).toBeGreaterThan(0.98);
    expect(dotPosition('2026-09-17', trail)).toBeLessThan(1);
  });

  it('is monotonic and clamped', () => {
    expect(dotPosition('2026-08-01', trail)).toBeLessThan(dotPosition('2026-08-02', trail));
    expect(dotPosition('2020-01-01', trail)).toBe(0);
    expect(dotPosition('2030-01-01', trail)).toBe(1);
  });

  it('labels the axis from the first day to the last', () => {
    const ticks = axisTicks(trail, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]).toEqual({ at: 0, label: '20 Jun' });
    expect(ticks[4]).toEqual({ at: 1, label: '17 Sep' });
  });
});
```

- [ ] **Step 2: Run to see it fail.** `npx vitest run tests/ladder-trail.test.ts` — Expected: FAIL, "Failed to resolve import '@/lib/verify/trail'".

- [ ] **Step 3: Write `lib/verify/trail.ts`:**

```ts
/**
 * The ladder evidence trail: when Beijing used a formula, and about whom.
 *
 * Pure. It takes Beijing-attributed rung articles and returns rows of dots — one dot per country
 * per UTC day, at that day's highest rung, with reprints folded. It draws nothing and asks the
 * database for nothing; see components/LadderTrail and lib/queries.
 *
 * A dot is not a level. There is no line between dots, and no dot means no formula was found in a
 * headline, not that things were calm.
 */
import type { Article } from '@/lib/types';
import { reprintFamilies } from '@/lib/verify/reprints';

/** The widest window the trail shows. */
export const TRAIL_DAYS = 90;
const DAY_MS = 86_400_000;

export interface TrailEvidence {
  title: string;
  outlet: string;
  url: string;
  publishedAt: string;
  rung: number;
  /** The event this report belongs to, when the page knows it. */
  eventId: string | null;
}

export interface TrailDot {
  key: string;
  /** ISO3, or null when the headline does not say whom the formula is about. */
  target: string | null;
  /** UTC calendar day, YYYY-MM-DD. */
  day: string;
  rung: number;
  zh: string;
  en: string;
  /** Every report that day. */
  reports: number;
  /** Reports after reprints are folded into the one they repeat. */
  originals: number;
  /** A rung above every earlier dot in this row. Never the row's first dot. */
  newHigh: boolean;
  /** The event carrying the day's highest rung. */
  eventId: string | null;
  /** One report per original, highest rung first. */
  evidence: TrailEvidence[];
}

export interface TrailRow { target: string; dots: TrailDot[] }

export interface Trail {
  /** First and last day of the axis, YYYY-MM-DD. */
  since: string;
  until: string;
  rows: TrailRow[];
  /** Beijing formulae whose headline does not name a target. */
  notStated: TrailDot[];
  /** Every dot, in rows and notStated. */
  dots: number;
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function makeDot(target: string | null, day: string, group: Article[], eventOf?: ReadonlyMap<string, string>): TrailDot {
  const families = reprintFamilies(group);
  const top = group.reduce((best, a) => ((a.ladderRung ?? 0) > (best.ladderRung ?? 0) ? a : best), group[0]);
  const evidence: TrailEvidence[] = families
    .map((f) => ({
      title: f.representative.title,
      outlet: f.representative.outlet,
      url: f.representative.url,
      publishedAt: f.representative.publishedAt,
      rung: Math.max(...f.members.map((m) => m.ladderRung ?? 0)),
      eventId: eventOf?.get(f.representative.id) ?? null,
    }))
    .sort((a, b) => b.rung - a.rung || Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || (a.url < b.url ? -1 : 1));
  return {
    key: `${target ?? 'none'}|${day}`,
    target, day,
    rung: top.ladderRung ?? 0,
    zh: top.ladderZh ?? '',
    en: top.ladderEn ?? '',
    reports: group.length,
    originals: families.length,
    newHigh: false,
    eventId: evidence[0]?.eventId ?? null,
    evidence,
  };
}

export function ladderTrail(
  articles: Article[],
  opts: { since: string; until: string; eventOf?: ReadonlyMap<string, string> },
): Trail {
  const untilMs = Date.parse(opts.until);
  const sinceMs = Math.max(Date.parse(opts.since), untilMs - TRAIL_DAYS * DAY_MS);
  const since = utcDay(sinceMs);
  const until = utcDay(untilMs);

  const groups = new Map<string, { target: string | null; day: string; list: Article[] }>();
  for (const a of articles) {
    if (a.ladderRung == null || a.ladderSpeaker !== 'prc') continue;
    const t = Date.parse(a.publishedAt);
    if (Number.isNaN(t)) continue;
    const day = utcDay(t);
    if (day < since || day > until) continue;
    const target = a.ladderTarget ?? null;
    const key = `${target ?? ''}|${day}`;
    const g = groups.get(key) ?? { target, day, list: [] };
    g.list.push(a);
    groups.set(key, g);
  }

  const byTarget = new Map<string, TrailDot[]>();
  const notStated: TrailDot[] = [];
  for (const g of groups.values()) {
    const dot = makeDot(g.target, g.day, g.list, opts.eventOf);
    if (g.target === null) notStated.push(dot);
    else byTarget.set(g.target, [...(byTarget.get(g.target) ?? []), dot]);
  }

  const rows: TrailRow[] = [...byTarget.entries()].map(([target, dots]) => {
    dots.sort((a, b) => (a.day < b.day ? -1 : 1));
    let highest = 0;
    dots.forEach((d, i) => { d.newHigh = i > 0 && d.rung > highest; highest = Math.max(highest, d.rung); });
    return { target, dots };
  });
  const last = (r: TrailRow) => r.dots[r.dots.length - 1].day;
  const peak = (r: TrailRow) => Math.max(...r.dots.map((d) => d.rung));
  rows.sort((a, b) => (last(a) < last(b) ? 1 : last(a) > last(b) ? -1 : 0) || peak(b) - peak(a) || (a.target < b.target ? -1 : 1));
  notStated.sort((a, b) => (a.day < b.day ? -1 : 1));

  return { since, until, rows, notStated, dots: rows.reduce((n, r) => n + r.dots.length, 0) + notStated.length };
}

/** Where a day sits on the axis: 0 at the left edge, 1 at the right, the middle of the day. */
export function dotPosition(day: string, trail: Pick<Trail, 'since' | 'until'>): number {
  const t0 = Date.parse(`${trail.since}T00:00:00Z`);
  const t1 = Date.parse(`${trail.until}T00:00:00Z`) + DAY_MS;
  const t = Date.parse(`${day}T12:00:00Z`);
  return Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
}

/** Evenly spaced dates for the axis, the first day at 0 and the last at 1. */
export function axisTicks(trail: Pick<Trail, 'since' | 'until'>, count = 5): { at: number; label: string }[] {
  const t0 = Date.parse(`${trail.since}T00:00:00Z`);
  const t1 = Date.parse(`${trail.until}T00:00:00Z`) + DAY_MS - 1;
  return Array.from({ length: count }, (_, i) => {
    const at = count === 1 ? 0 : i / (count - 1);
    const label = new Date(t0 + at * (t1 - t0)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return { at, label };
  });
}
```

- [ ] **Step 4: Add the page query** to `lib/queries.ts`. Add the imports `import { ladderTrailArticles, corpusSince } from '@/lib/db';` (extend the existing `@/lib/db` import if there is one) and `import { ladderTrail, type Trail } from '@/lib/verify/trail';`, then, next to `ladderAlerts`:

```ts
/**
 * The evidence trail: Beijing's own formulae by country and day. Cached per request, like the
 * corpus it reads. Events past the newest 4,000 are not in `corpus()`, so an old dot may carry no
 * link to its event — the chart then draws it without one.
 */
export const ladderTrailData = cache((): Trail => {
  const eventOf = new Map<string, string>();
  for (const e of corpus()) for (const id of e.articleIds) eventOf.set(id, e.id);
  const now = new Date().toISOString();
  return ladderTrail(ladderTrailArticles(), { since: corpusSince() ?? now, until: now, eventOf });
});
```

- [ ] **Step 5: Run.** `npx vitest run tests/ladder-trail.test.ts` — Expected: PASS. If a reprint test fails because the two headlines were not similar enough (Jaccard < 0.8) or not different enough, adjust the *test headlines*, not `REPRINT_SIMILARITY`. Then `npx tsc --noEmit` — Expected: clean.

- [ ] **Step 6: Leak-scan and commit.**

```bash
git grep -n -i -E -f ~/.claude/kautilya-leak-patterns.txt -- . ':!.env.local'
git status --short
git add lib/verify/trail.ts lib/queries.ts tests/ladder-trail.test.ts
git commit -m "Derive the ladder evidence trail: one dot per country per day

Beijing-attributed rung articles grouped by target and UTC day at the day's highest rung,
reprints folded, a new-high flag that never marks a row's first dot, rows ordered by recent
activity, and a 90-day window that starts at the corpus's first article. Pure; no UI.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: The chart

**Files:** Create `components/LadderTrail.tsx`; Modify `components/RevealOnView.tsx`; Test `tests/ladder-trail-chart.test.ts`.

**Interfaces:**
- Consumes: `Trail`, `TrailDot`, `dotPosition`, `axisTicks` (Task 3); `ESCALATION_LADDER` (`data/glossary.zh`, `severity` 0–100); `BY_ISO` (`data/countries`); `ChineseText`; `RevealOnView`.
- Produces: `LadderTrail({ trail, only? })` and `dotDiameter(rung): number`; `data-reveal-delay` support in `RevealOnView`.

- [ ] **Step 1: Write the failing tests** — `tests/ladder-trail-chart.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LadderTrail, dotDiameter } from '@/components/LadderTrail';
import { ladderTrail } from '@/lib/verify/trail';
import type { Article } from '@/lib/types';

let n = 0;
function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `c${String(n).padStart(4, '0')}`, url: `https://x/chart/${n}`,
    title: `外交部：中方第${n}号声明强烈抗议日方涉靖国神社消极动向`, outlet: `Outlet ${n}`,
    publishedAt: '2026-08-15T10:00:00.000Z', snippet: '', imageUrl: null, language: 'zh',
    beatId: null, localeKey: null, sourceCountry: 'CHN', ownership: 'state', tier: 2,
    isPrimary: false, actors: ['CHN', 'JPN'], people: [], hotspots: [], domain: 'Diplomatic',
    escalation: 0, framing: 0, ladderRung: 8, ladderZh: '强烈抗议', ladderEn: 'strong protest',
    ladderSpeaker: 'prc', ladderTarget: 'JPN',
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}
const OPTS = { since: '2026-06-20T00:00:00.000Z', until: '2026-09-17T12:00:00.000Z' };
const render = (trail: ReturnType<typeof ladderTrail>, only?: string) =>
  renderToStaticMarkup(createElement(LadderTrail, { trail, only }));

const a1 = art({ ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'solemn representations', publishedAt: '2026-07-13T10:00:00.000Z' });
const a2 = art({ publishedAt: '2026-08-15T10:00:00.000Z' });
const a3 = art({ ladderTarget: 'PHL', ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'solemn representations', publishedAt: '2026-07-21T10:00:00.000Z' });
const a4 = art({ ladderTarget: null, ladderRung: 6, ladderZh: '坚决反对', ladderEn: 'resolute opposition', publishedAt: '2026-09-11T10:00:00.000Z' });
const eventOf = new Map([[a1.id, 'ev-1'], [a2.id, 'ev-2']]);
const trail = ladderTrail([a1, a2, a3, a4], { ...OPTS, eventOf });
const html = render(trail);

describe('the chart', () => {
  it('has one row per country, labelled with the direction', () => {
    expect(html).toContain('data-trail-row="JPN"');
    expect(html).toContain('data-trail-row="PHL"');
    expect(html).toMatch(/Beijing[\s\S]{0,60}→[\s\S]{0,60}Japan/);
    expect(html).toMatch(/Beijing[\s\S]{0,60}→[\s\S]{0,60}Philippines/);
  });

  it('has a row for what the headline does not say', () => {
    expect(html).toContain('data-trail-row="none"');
    expect(html).toContain('target not stated');
  });

  it('draws one dot per dot', () => {
    expect((html.match(/data-trail-dot/g) ?? []).length).toBe(4);
  });

  it('names each dot for a screen reader and on hover', () => {
    expect(html).toContain('aria-label="Beijing to Japan, 15 Aug: rung 8, strong protest — 1 report"');
    expect(html).toMatch(/title="Beijing to Japan, 13 Jul: rung 4/);
  });

  it('links a dot to its event when it has one, and is still a labelled dot when it has none', () => {
    expect(html).toContain('href="/events/ev-1"');
    expect(html).toContain('href="/events/ev-2"');
    expect(html).toContain('role="img"'); // the Philippines dot and the unstated one have no event
  });

  it('rings a new high and nothing else', () => {
    expect((html.match(/data-new-high="true"/g) ?? []).length).toBe(1); // JPN: rung 4 on 13 Jul, then 8
  });

  it('makes a higher rung a bigger dot', () => {
    expect(dotDiameter(8)).toBeGreaterThan(dotDiameter(4));
    expect(dotDiameter(13)).toBeGreaterThan(dotDiameter(8));
    expect(dotDiameter(1)).toBeGreaterThanOrEqual(9);
  });

  it('is honest about what it cannot see', () => {
    expect(html).toContain('headlines');
    expect(html).toContain('not that things were calm');
    expect(html).toContain('Collecting since 20 Jun');
  });
});

describe('the table under the chart', () => {
  it('lists every headline behind the dots, always rendered, closed by default', () => {
    expect(html).toContain('<details');
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    for (const a of [a1, a2, a3, a4]) expect(html).toContain(a.title);
    expect(html).toContain('Every dated headline behind the dots (4)');
  });

  it('links a headline to its event', () => {
    expect(html).toMatch(/<a\b(?=[^>]*href="\/events\/ev-2")(?=[^>]*data-trail-headline)[^>]*>/);
  });

  it('says whom each is about, including when it is not stated', () => {
    expect(html).toContain('Japan');
    expect(html).toContain('not stated');
  });
});

describe('narrowed to one country', () => {
  it('shows only that country’s row and table, and no unstated row', () => {
    const only = render(trail, 'JPN');
    expect(only).toContain('data-trail-row="JPN"');
    expect(only).not.toContain('data-trail-row="PHL"');
    expect(only).not.toContain('data-trail-row="none"');
    expect(only).toContain('Every dated headline behind the dots (2)');
  });

  it('says so, by name, when there is nothing to show', () => {
    expect(render(trail, 'KOR')).toContain('No Beijing formula about South Korea found in headlines since 20 Jun.');
  });
});

describe('with nothing to show', () => {
  it('says so and draws no chart', () => {
    const empty = render(ladderTrail([], OPTS));
    expect(empty).toContain('No Beijing formula found in headlines since 20 Jun.');
    expect(empty).not.toContain('data-trail-dot');
    expect(empty).not.toContain('<details');
  });
});

describe('motion', () => {
  // Only inline styles: class names such as Tailwind's `transition-colors` are not animation state.
  const styles = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]).join(' ');

  it('leaves every animated state to the reveal hook, so nothing is hidden without it', () => {
    expect(styles).not.toMatch(/transition|animation|scale\(0\)/);
    expect(html).toContain('reveal-scale');
    expect(html).toContain('data-reveal-delay');
  });

  it('staggers the dots by their order in time, capped', () => {
    const delays = [...html.matchAll(/data-reveal-delay="(\d+)"/g)].map((m) => Number(m[1]));
    expect(new Set(delays).size).toBe(4);
    expect(Math.max(...delays)).toBeLessThanOrEqual(900);
  });
});

describe('the reveal hook', () => {
  const src = readFileSync('components/RevealOnView.tsx', 'utf8');

  it('reads a per-element delay when it scales things in', () => {
    expect(src).toContain('s.dataset.revealDelay');
  });

  it('only reaches it after the reduced-motion early return', () => {
    // The call, not the doc comment that also mentions the query.
    const guard = src.indexOf("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(src.indexOf('s.dataset.revealDelay'));
  });
});
```

- [ ] **Step 2: Run to see it fail.** `npx vitest run tests/ladder-trail-chart.test.ts` — Expected: FAIL, "Failed to resolve import '@/components/LadderTrail'".

- [ ] **Step 3: Add the stagger to the reveal hook.** In `components/RevealOnView.tsx`, in the observer callback, change the `scales` block from

```ts
      scales.forEach((s) => {
        s.style.transition = `transform ${REVEAL_MS}ms ease-out`;
        s.style.transform = 'scale(1)';
      });
```

to

```ts
      scales.forEach((s) => {
        // `data-reveal-delay` staggers a row of dots; anything without it scales in at once.
        s.style.transition = `transform ${REVEAL_MS}ms ease-out ${Number(s.dataset.revealDelay) || 0}ms`;
        s.style.transform = 'scale(1)';
      });
```

and add one line to the doc comment's `.reveal-scale` bullet: "`data-reveal-delay="<ms>"` on the element staggers it."

- [ ] **Step 4: Write `components/LadderTrail.tsx`:**

```tsx
import Link from 'next/link';
import { RevealOnView } from '@/components/RevealOnView';
import { ChineseText } from '@/components/ChineseText';
import { ESCALATION_LADDER } from '@/data/glossary.zh';
import { BY_ISO } from '@/data/countries';
import { dotPosition, axisTicks, type Trail, type TrailDot } from '@/lib/verify/trail';

const name = (iso: string | null) => (iso ? BY_ISO.get(iso)?.name ?? iso : 'target not stated');
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A dot's size follows the ladder's own severity, not a new scale. */
export function dotDiameter(rung: number): number {
  const severity = ESCALATION_LADDER.find((r) => r.rung === rung)?.severity ?? 10;
  return 9 + Math.round((severity / 100) * 13);
}

/** Inside a lane: 12px of padding each side, so an edge dot stays inside the box. */
const along = (f: number) => `calc(12px + (100% - 24px) * ${f})`;

function label(d: TrailDot): string {
  const reports = d.originals < d.reports ? `${plural(d.reports, 'report')}, ${plural(d.originals, 'original')}` : plural(d.reports, 'report');
  return `Beijing to ${name(d.target)}, ${dayLabel(d.day)}: rung ${d.rung}, ${d.en} — ${reports}`;
}

/**
 * When Beijing used an escalation formula, and about whom: one row per country, one dot per day.
 * The chart is a picture of the table beneath it — every dot's headlines are listed there, so it
 * reads without JavaScript or a pointer. Nothing is drawn as a line: no dot means no formula was
 * found in a headline, not that things were calm.
 */
export function LadderTrail({ trail, only }: { trail: Trail; only?: string }) {
  const rows = only ? trail.rows.filter((r) => r.target === only) : trail.rows;
  const notStated = only ? [] : trail.notStated;
  const all = [...rows.flatMap((r) => r.dots), ...notStated];
  const since = dayLabel(trail.since);

  if (!all.length) {
    return (
      <div className="panel p-4" data-ladder-trail>
        <p className="text-[14px] leading-relaxed text-muted">
          No Beijing formula {only ? `about ${name(only)} ` : ''}found in headlines since {since}.
        </p>
      </div>
    );
  }

  const order = new Map([...all].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)).map((d, i) => [d.key, i]));
  const ticks = axisTicks(trail);
  const lanes = [
    ...rows.map((r) => ({ id: r.target, who: name(r.target), dots: r.dots })),
    ...(notStated.length ? [{ id: 'none', who: 'target not stated', dots: notStated }] : []),
  ];

  const evidence = [...all].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .flatMap((d) => d.evidence.map((e) => ({ d, e })));

  return (
    <div className="panel p-4" data-ladder-trail>
      <p className="text-[13px] leading-relaxed text-faint">
        Each dot is a day on which a formula Beijing itself used appeared in a headline about that
        country. A bigger dot is a higher rung, and a ring marks a rung higher than any earlier dot in
        the row. Formulae are read from headlines and short snippets only, so a gap means none was
        found, not that things were calm. Collecting since {since}.
      </p>

      <RevealOnView>
        <div className="mt-3 space-y-1.5">
          {lanes.map((lane) => (
            <div key={lane.id} data-trail-row={lane.id} className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
              <div className="flex-none text-[13px] text-muted sm:w-36">
                Beijing <span aria-hidden="true">→</span> {lane.who}
              </div>
              <div className="relative h-7 flex-1 rounded-sm bg-[color:var(--color-line-soft)]">
                {ticks.map((t) => (
                  <span key={t.at} aria-hidden="true" className="absolute inset-y-0 w-px bg-[color:var(--color-line)]" style={{ left: along(t.at) }} />
                ))}
                {lane.dots.map((d) => {
                  const size = dotDiameter(d.rung);
                  const hit = Math.max(24, size);
                  const text = label(d);
                  const box = 'absolute flex items-center justify-center';
                  const pos = { left: along(dotPosition(d.day, trail)), top: '50%', width: hit, height: hit, marginLeft: -hit / 2, marginTop: -hit / 2 };
                  const dot = (
                    <span className="reveal-scale block rounded-full" data-reveal-delay={Math.min(order.get(d.key) ?? 0, 20) * 45}
                      style={{ width: size, height: size, background: 'var(--color-zh)', outline: d.newHigh ? '2px solid var(--color-accent)' : undefined, outlineOffset: 2 }} />
                  );
                  return d.eventId ? (
                    <Link key={d.key} href={`/events/${d.eventId}`} aria-label={text} title={text} data-trail-dot data-new-high={d.newHigh ? 'true' : undefined} className={box} style={pos}>{dot}</Link>
                  ) : (
                    <span key={d.key} role="img" aria-label={text} title={text} data-trail-dot data-new-high={d.newHigh ? 'true' : undefined} className={box} style={pos}>{dot}</span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="mt-1 flex justify-between px-3 text-[12px] text-faint sm:pl-[9.5rem]">
          {ticks.map((t) => <span key={t.at}>{t.label}</span>)}
        </div>
      </RevealOnView>

      <details className="mt-4">
        <summary className="cursor-pointer text-[13px] text-muted hover:text-text">
          Every dated headline behind the dots ({evidence.length})
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-[13px]">
            <thead className="text-faint">
              <tr><th className="py-1 pr-3 font-normal">Date</th><th className="py-1 pr-3 font-normal">About</th><th className="py-1 pr-3 font-normal">Rung</th><th className="py-1 pr-3 font-normal">Headline</th><th className="py-1 font-normal">Outlet</th></tr>
            </thead>
            <tbody>
              {evidence.map(({ d, e }) => {
                const headline = <ChineseText text={e.title} size="small" clamp={false} />;
                return (
                  <tr key={`${d.key}|${e.url}`} className="border-t border-[color:var(--color-line-soft)] align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted">{dayLabel(d.day)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{d.target ? name(d.target) : 'not stated'}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted">rung {e.rung}</td>
                    <td className="py-1.5 pr-3">
                      {e.eventId ? <Link href={`/events/${e.eventId}`} data-trail-headline className="hover:text-[color:var(--color-accent)]">{headline}</Link> : headline}
                    </td>
                    <td className="py-1.5 text-faint">{e.outlet}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 5: Run.** `npx vitest run tests/ladder-trail-chart.test.ts tests/reveal-fold.test.ts tests/a11y.test.ts` — Expected: PASS. The `a11y` and reveal tests read sources across the repo, so this also proves the hook edit broke nothing. If a label test fails on the em dash or the arrow's spacing, fix the *component's* text to match the spec's wording, not the regex. If `next/link` cannot render outside the app router in the node test, render it with the same props as a plain `<a>` in the test only via `vi.mock('next/link', ...)` — do not change the component.

- [ ] **Step 6: `npx tsc --noEmit`** — Expected: clean.

- [ ] **Step 7: Leak-scan and commit.**

```bash
git grep -n -i -E -f ~/.claude/kautilya-leak-patterns.txt -- . ':!.env.local'
git status --short
git add components/LadderTrail.tsx components/RevealOnView.tsx tests/ladder-trail-chart.test.ts
git commit -m "Draw the ladder evidence trail as dots over a table of headlines

One row per country, a dot per day sized by the ladder's own severity, a ring on a new
high, and a table under it that lists every headline behind every dot. The reveal hook gains
a per-element delay so the dots come in left to right; nothing animated is set in markup.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Place it, say what it is, and audit it

**Files:** Modify `app/china/page.tsx`, `app/dyad/[pair]/page.tsx`, `app/methodology/page.tsx`, `data/glossary.ts`, `app/api/export/route.ts`, `scripts/ladder-shift.ts`; Test `tests/ladder-trail-surfaces.test.ts`.

**Interfaces:**
- Consumes: `LadderTrail`, `ladderTrailData` (Tasks 3–4), `formulaTarget` via `scoreText`.
- Produces: the China Watch section, the China dyad section, the copy, the export column, and the targets audit.

- [ ] **Step 1: Write the failing tests** — `tests/ladder-trail-surfaces.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { allEntries } from '@/data/glossary';

const read = (p: string) => readFileSync(p, 'utf8');

describe('where the trail appears', () => {
  const china = read('app/china/page.tsx');
  const dyad = read('app/dyad/[pair]/page.tsx');

  it('is a section on China Watch, after the official statement detections', () => {
    expect(china).toContain("import { LadderTrail } from '@/components/LadderTrail'");
    expect(china).toContain('ladderTrailData');
    expect(china).toContain('<LadderTrail trail={trail} />');
    expect(china.indexOf('Official statement detections')).toBeLessThan(china.indexOf('<LadderTrail'));
  });

  it('is narrowed to the other country on a dyad page that includes China, and only there', () => {
    expect(dyad).toContain("import { LadderTrail } from '@/components/LadderTrail'");
    expect(dyad).toMatch(/<LadderTrail trail=\{ladderTrailData\(\)\} only=\{/);
    // Exactly one side may be China: a China–China pair is not a page, and a non-China pair has no ladder.
    expect(dyad).toMatch(/\(a\.iso === 'CHN'\) !== \(b\.iso === 'CHN'\)/);
  });
});

describe('what the copy says', () => {
  it('explains whom a formula is about on /methodology, and that a gap is not calm', () => {
    const m = read('app/methodology/page.tsx');
    expect(m).toContain('Whom it is about.');
    expect(m).toContain('left unstated rather');
    expect(m).toContain('not that things were calm');
  });

  it('defines both new terms in the glossary', () => {
    const ids = allEntries().map((e) => e.id);
    expect(ids).toContain('ladder-target');
    expect(ids).toContain('evidence-trail');
  });

  it('exports the target', () => {
    expect(read('app/api/export/route.ts')).toContain("ladder_target: a.ladderTarget ?? ''");
  });
});

describe('the audit', () => {
  it('lists every resolved target and every headline left unstated', () => {
    const s = read('scripts/ladder-shift.ts');
    expect(s).toContain('whom Beijing');
    expect(s).toContain('target not stated');
    expect(s).toContain('ladderTarget');
  });
});
```

(`allEntries` is what `tests/ladder-speaker-surfaces.test.ts` already imports from `@/data/glossary`; if its name differs, use the same one that file uses.)

- [ ] **Step 2: Run to see it fail.** `npx vitest run tests/ladder-trail-surfaces.test.ts` — Expected: FAIL on every assertion (the pages and copy do not exist yet).

- [ ] **Step 3: China Watch.** In `app/china/page.tsx`: add `import { LadderTrail } from '@/components/LadderTrail';` beside the other component imports; add `ladderTrailData` to the `@/lib/queries` import; add `const trail = ladderTrailData();` after `const ladder = ladderAlerts(events, 14);`; and insert this section immediately after the closing `</section>` of "Official statement detections" and before the `grid gap-6 lg:grid-cols-[1.2fr_1fr]` section:

```tsx
      <section>
        <SectionTitle kicker="Beijing’s own formulae, by date and by country">
          Evidence trail
        </SectionTitle>
        <LadderTrail trail={trail} />
      </section>
```

- [ ] **Step 4: Dyad page.** In `app/dyad/[pair]/page.tsx`: add `import { LadderTrail } from '@/components/LadderTrail';`; add `ladderTrailData` to the `@/lib/queries` import; and insert this immediately before the `<section>` that contains `Defining events`:

```tsx
      {(a.iso === 'CHN') !== (b.iso === 'CHN') && (
        <section>
          <SectionTitle kicker="Beijing’s own formulae, by date">
            Evidence trail — {a.iso === 'CHN' ? b.name : a.name}
          </SectionTitle>
          <LadderTrail trail={ladderTrailData()} only={a.iso === 'CHN' ? b.iso : a.iso} />
        </section>
      )}
```

The "Defining events" `<section>` is inside the allowed branch of `{!gate.allowed ? <Paywall … /> : (<> … </>)}`, so this block goes **inside that same fragment**, immediately before it, at the same indentation. Outside the fragment a paywalled reader would see the trail without the gate.

- [ ] **Step 5: Methodology.** In `app/methodology/page.tsx`, add this paragraph directly after the "Whose formula it is." paragraph:

```tsx
      <P>
        <strong>Whom it is about.</strong> For each of Beijing&rsquo;s formulae the headline is also
        read for the state it is aimed at &mdash; the party after 向, 对 or 就, the state whose act is
        being answered, or the host of a protesting embassy. China Watch plots one dot per country per
        day from it. Where a headline names two states, or none, the target is left unstated rather
        than guessed. Formulae are read from headlines and short snippets only, so a gap in the trail
        means none was found, not that things were calm.
      </P>
```

- [ ] **Step 6: Glossary.** In `data/glossary.ts`, after the `ladder-speaker` entry, add:

```ts
      { id: 'ladder-target', term: 'Target (of a formula)',
        meaning: 'The state a Beijing formula is aimed at, read from the headline: the party after 向 / 对 / 就, the state whose act is being answered, or the host of a protesting embassy. When a headline names two states or none, the target is left unstated, not guessed.' },
      { id: 'evidence-trail', term: 'Evidence trail',
        meaning: 'A row of dots per country on China Watch, one for each day a formula Beijing itself used appeared in a headline about that country, with the headline behind every dot. It is not a level: no dot means none was found in a headline, not that things were calm.' },
```

- [ ] **Step 7: Export.** In `app/api/export/route.ts`, after the `ladder_speaker: a.ladderSpeaker ?? '',` line add `ladder_target: a.ladderTarget ?? '',`. If the file also lists the column names separately (a CSV header array), add `ladder_target` after `ladder_speaker` there too.

- [ ] **Step 8: The audit.** In `scripts/ladder-shift.ts`, insert before the final "Invariant" block:

```ts
// Whom each Beijing formula is about. A wrong arrow puts a dot in the wrong row and looks
// confident, so every resolved target is listed with its headline and every headline left
// unresolved is listed in full — read both, weekly, with the rest of this audit.
const aimed = new Map<string, typeof hits>();
const unstated: typeof hits = [];
for (const a of bySpeaker.prc) {
  const t = scored.get(a.id)!.ladderTarget;
  if (t) aimed.set(t, [...(aimed.get(t) ?? []), a]);
  else unstated.push(a);
}
console.log(`\n=== whom Beijing’s formulae are about: ${bySpeaker.prc.length - unstated.length} of ${bySpeaker.prc.length} resolved ===`);
for (const [t, list] of [...aimed.entries()].sort((x, y) => y[1].length - x[1].length)) {
  console.log(`\n  → ${t} (${list.length})`);
  for (const a of list) console.log(`      ${a.publishedAt.slice(0, 10)}  ${a.title}`);
}
console.log(`\n=== target not stated (${unstated.length}) — read these: could a person tell whom it is about? ===`);
for (const a of unstated) console.log(`  ${a.publishedAt.slice(0, 10)}  ${a.title}`);
```

- [ ] **Step 9: Run.** `npx vitest run tests/ladder-trail-surfaces.test.ts tests/glossary.test.ts` — Expected: PASS (the glossary tests check unique ids and non-empty meanings, so a duplicate id or a blank meaning fails here). Then `npx tsc --noEmit` and `npm run ladder:shift 2>&1 | sed -n '/whom Beijing/,$p'` — Expected: `22 of 27 resolved` (or the number the fixture test settled on), the targets grouped, and the 5 unstated headlines listed. **Read the listing.**

- [ ] **Step 10: Leak-scan and commit.**

```bash
git grep -n -i -E -f ~/.claude/kautilya-leak-patterns.txt -- . ':!.env.local'
git status --short
git add app/china/page.tsx "app/dyad/[pair]/page.tsx" app/methodology/page.tsx data/glossary.ts app/api/export/route.ts scripts/ladder-shift.ts tests/ladder-trail-surfaces.test.ts
git commit -m "Put the evidence trail on China Watch and China dyad pages

A section after the official statement detections, the same chart narrowed to one country on
a China dyad page, a methodology paragraph, two glossary entries, an export column, and an
audit that lists every resolved target and every headline left unstated.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Verify against a real build, then stop

**Files:** Modify `STATE.md`, `docs/specs/2026-09-20-ladder-trail-design.md` (status line), this plan (Deviations, Self-review).

- [ ] **Step 1: Everything green.** `npx vitest run` and `npx tsc --noEmit` — Expected: all pass (re-run `tests/analyse-route.test.ts` alone if it times out under load; it is a known unrelated flake). Record the test count.

- [ ] **Step 2: A real production build, from scratch.** iCloud restores stale files, so: `rm -rf .next && npm run build`. Then `git status --short` and look for any `* 2.*` file — delete a stray by name, never with a wildcard.

- [ ] **Step 3: A database with the target filled in, outside the synced Desktop.** The local `kautilya.db` has no targets until an ingest back-fills them. Copy it to the scratchpad and back-fill the copy (a throwaway script, not committed):

```ts
import { allArticles, updateLadders } from '@/lib/db';
import { ladderPatches } from '@/lib/ingest/pipeline';
const patches = ladderPatches(allArticles(20000));
console.log(`patching ${patches.length} rows`);
updateLadders(patches);
```

run as `KAUTILYA_DB=<scratchpad>/verify.db npx tsx --tsconfig tsconfig.scripts.json <scratchpad>/backfill-targets.ts`. Expected: the copy's `ladderTrailArticles()` returns 27 rows and about 22 have a target.

- [ ] **Step 4: Run the standalone server on that copy.** The preview tool reads the WORKSPACE `Cowork_Station/.claude/launch.json`, not GeoIntel's: add a temporary entry (`env` with `KAUTILYA_DB` pointing at the scratchpad copy and a free port, running `node Output/GeoIntel/.next/standalone/server.js`), start it with `preview_start`, and **remove the entry when done**. Copy `.next/static` beside the standalone server first if the runbook says the build needs it.

- [ ] **Step 5: Look at it.** In the browser pane:
  - `/china` at desktop width: the "Evidence trail" section renders about five country rows (Japan, United States, South Korea, Philippines, and the unstated row) with about fifteen dots; the axis starts `20 Jun`; the dots come in when the section scrolls into view; a dot's link opens the right event; the table opens and lists every headline.
  - `/china` at 375 px (`resize_window` preset `mobile`): no sideways page scroll (`document.documentElement.scrollWidth <= innerWidth`), row labels sit above their lanes, a dot is tappable, the table scrolls inside its own box.
  - `/dyad/CHN-JPN`: a one-row trail for Japan. `/dyad/IND-PAK`: no trail section.
  - Each colour palette in the picker, and dark mode (`resize_window` `colorScheme`): dots and ring stay visible against the lane.
  - `read_console_messages` with `onlyErrors`: none. If reduced motion can be emulated, check the dots are simply present with no inline `transition`; otherwise say it could not be emulated here and rely on the markup test.
  - Read the rendered rows against the audit listing: every dot's row must match the headline in its table.

- [ ] **Step 6: Clean up.** Stop the preview server, remove the temporary `launch.json` entry, delete the scratchpad DB copy (it holds real account rows if it was ever restored from a backup; the local one does not, but delete it anyway), and confirm `git status --short` shows only the files this task edits.

- [ ] **Step 7: Records.** Add to `STATE.md`, above the Stage 1 section, a "The ladder evidence trail — built (date), NOT deployed" section: the branch and its commits, the test count, what the shift report showed (resolved / unstated, and the unstated headlines in full), what the browser check found, the live-corpus expectation (about four dots, "collecting since 17 Sep"), and what Josh must decide (merge and deploy). Set the spec's status line to "built on the branch `ladder-trail`; not merged". Fill in this plan's **Deviations, as built** and **Self-review** sections honestly.

- [ ] **Step 8: Commit, push the branch, stop.**

```bash
git grep -n -i -E -f ~/.claude/kautilya-leak-patterns.txt -- . ':!.env.local'
git status --short
git add STATE.md docs/specs/2026-09-20-ladder-trail-design.md docs/plans/2026-09-20-ladder-trail.md
git commit -m "Record the ladder-trail build: the audit, the browser check, what remains

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push -u origin ladder-trail
```

Report to Josh and **stop**: no merge, no deploy, no public PR. He has not yet read the unstated headlines or seen the chart in a browser he controls. When he says "merge it and deploy": fast-forward `main`, follow `docs/runbooks/vps-deploy.md` (with its `rm -rf .next` and `*.db` exclusions), run the hourly job's command once by hand to back-fill the live rows, and read the live trail against the live headlines. The public `AI_apps` mirror is a separate PR that is opened, not merged, until he says so.

---

## Deviations, as built

Tasks 1 and 2 were built as written. The rule agreed with all 27 hand labels (22 resolved, 5 unstated,
none wrong); the `speaker.ts` refactor moved nothing (its 55 existing tests pass unchanged); the one
existing test the plan named was the only existing test edited. What differs from the plan:

1. **Day labels come from a fixed month table, not `Intl`** (Task 3). The plan's `axisTicks` and the
   component used `toLocaleDateString('en-GB')`. The first run of the trail tests failed: on this Node
   it writes September "Sept". A label that depends on the ICU build would read differently on the
   server than on a laptop, so `lib/verify/trail.ts` exports `dayLabel`, and the component uses it.
2. **The real build found four defects the plan did not anticipate** (Task 6), fixed in `a786a72`, each
   test-first:
   - *Dots took each other's clicks.* The plan and the spec gave each dot a 24 px click target on dots
     9-22 px wide; days are ~9 px apart on a desktop axis, so a click on the centre of 4 of 15 dots opened
     the neighbour's event. Now 8-16 px, a target never wider than two days of axis (new `windowDays`),
     a halo between overlapping dots, and `flex-none` on the circle. **The spec's "24 px" was wrong** and
     is corrected.
   - *The new-high ring was visual only*, against the spec's own "the chart adds nothing the table lacks".
     Now in each dot's accessible label and in the table.
   - *"Collecting since" was false once the 90-day cap moved the window.* `Trail.capped` added; the copy
     says "Showing the last 90 days." then.
   - *The oldest dots lost their links*: the plan built `eventOf` from `corpus()`, which holds the newest
     4,000 events, and the local DB has 4,267. New `eventIdsByArticle` in `lib/db`. The plan's Task 3
     comment had accepted this limitation; on real data it hit 4 of 15 dots.
3. **One extra surface test** (Task 5): the trail sits behind the dyad page's paywall, not in front of it.
4. **An added sentence of copy** on the chart: close days overlap on a narrow screen and the table lists
   every one. The phone measurement (3 px between consecutive days) made that necessary.

**Not done, and why.** Nobody has looked at the pixels: the Browser pane was hidden, so screenshots came
back blank. Every visual claim is measured from the DOM (geometry, hit-testing, computed styles,
contrast). Reduced motion could not be emulated; the markup test and the hook's early return cover it.
Real touch was not tried.

**Process.** The fact-forcing gate fired on the first edit of every file and on every `rm -rf .next`;
the destructive-command gate needed its three items presented and then the same command retried. The
second clean build took over ten minutes because iCloud's `fileproviderd` was uploading `.next`.

## Self-review

- **Spec coverage.** Target rule (Decisions 1-2): Task 1. Dot identity, reprint folding, UTC days
  (3): Task 3. New-high rule (4): Task 3, and its accessible form in Task 4/6. Derived not stored (5):
  `ladderTrail`. Chart is a picture of a table (6): Task 4, and the ring parity fix. Honest window copy
  (7): Task 4 and the `capped` fix. Placement, methodology, glossary, export, audit: Task 5. The one
  spec statement that did not survive contact with the real build is the 24 px click target.
- **Placeholders.** None left. The earlier "if that section sits inside a conditional" step was made
  concrete before the build (it is inside the paywall's allowed branch) and now has a test.
- **Type consistency.** `Trail` gained `capped`; `dayLabel`, `windowDays` and `eventIdsByArticle` are
  additions the plan did not name, each defined where it is first used. `LadderPatch`, `ScoreResult`,
  `Article` and `updateLadders` all carry `ladderTarget` with the same type.
- **What this proves and does not.** 724 tests, `tsc` clean, a production build measured in a browser.
  It does not prove the rule generalises: the fixture is the whole hit set. It does not prove the chart
  looks right: nobody has seen it.
