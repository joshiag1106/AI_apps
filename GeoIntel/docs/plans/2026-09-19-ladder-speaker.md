# Ladder Speaker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attribute every detected ladder formula to a speaker — Beijing, another party, or unclear — and make an event's ladder mean Beijing's only.

**Architecture:** A new pure module `lib/lang/speaker.ts` reads a headline's grammar (the nearest non-target subject marker before the formula) and returns `prc | other | unclear`. `scoreText` stores it on the article; `buildEvent` takes the event ladder from PRC-speaker articles only, so every event-level surface becomes truthful without editing its own code. A shift report is the audit.

**Tech Stack:** TypeScript, Next.js 15 / React 19, Vitest (node), SQLite via `node:sqlite`.

**Spec:** `docs/specs/2026-09-19-ladder-speaker-design.md` — read it first.

## Global Constraints

- **The acceptance bar is no contradiction with the hand labels:** on the fixture, an item labelled `prc` may be `prc` or `unclear` but never `other`; an item labelled `other` or `unclear` may be `other` or `unclear` but never `prc`. A false `prc` is the defect this change removes; a false `other` silently hides a real Beijing formula. `unclear` costs recall only, and recall is reported.
- The fixture is the whole hit set, so it is the training set. Rules are written from grammar, not fitted; if a rule needs a case-specific hack, make that case `unclear` instead.
- `ladderRung/Zh/En` on an article stay as detected. **Escalation scoring is unchanged.**
- An event's ladder comes only from `prc` articles. A missing (`undefined`/`null`) speaker counts as `unclear`.
- `ladderSpeaker` is OPTIONAL on `Article` (`?:`), so the many test helpers that build a full `Article` keep compiling.
- The label for another party's formula is "not Beijing"; for an unclear one, "speaker unclear".
- Test-first: watch every new test fail for the right reason. Existing tests pass unchanged unless a task says otherwise.
- **Never put the production domain, server address or mailbox in a tracked file.** Before every commit run `git grep -n -i -E -f ~/.claude/kautilya-leak-patterns.txt -- . ':!.env.local'`; it must print nothing.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Do not deploy.** Josh reads the shift report first.

## File Structure

| File | Responsibility |
|---|---|
| `lib/lang/speaker.ts` (create) | `formulaSpeaker`, `LadderSpeaker` — pure |
| `tests/fixtures/ladder-speakers.ts` (create) | The hand-labelled headlines |
| `lib/analyze/score.ts`, `lib/ingest/pipeline.ts`, `lib/db/index.ts`, `lib/types.ts` (modify) | Carry and store the speaker; backfill stored rows |
| `lib/verify/cluster.ts` (modify) | Event ladder from PRC articles only |
| `components/LadderBadge.tsx` (create), `app/events/[id]/page.tsx`, `lib/llm/analyse.ts`, `app/api/export/route.ts` (modify) | Surfaces |
| `app/methodology/page.tsx`, `data/glossary.ts` (modify) | Say what changed |
| `scripts/ladder-shift.ts` (create), `package.json` (modify) | The shift report and audit |

---

### Task 1: The speaker rule and its fixture

**Files:** Create `tests/fixtures/ladder-speakers.ts`, `lib/lang/speaker.ts`; Test `tests/ladder-speaker.test.ts`.

**Interfaces:** Produces `formulaSpeaker(text: string, formula: string): LadderSpeaker` and `type LadderSpeaker = 'prc' | 'other' | 'unclear'`.

- [ ] **Step 1: Generate the fixture** from the corpus, labelled by hand. Run a throwaway script (scratchpad, not committed) that reads every rung-bearing article's `title`, `snippet` and `ladder_zh`, assigns the label below by title prefix (asserting each of the 47 matches exactly once), and writes `tests/fixtures/ladder-speakers.ts` exporting `LADDER_FIXTURE: { title: string; snippet: string; formula: string; expected: 'prc' | 'other' | 'unclear' }[]`. Labels, in publication order: **prc** — 1, 2, 4–14, 16–20, 22, 30, 32, 33, 35–37, 40–42 (28); **other** — 3, 15, 21, 23–29, 31, 38, 39, 43–47; **unclear** — 34. Then append a second export `LIVE_FIXTURE` from the live server's rung-bearing headlines (read-only, public text), labelled by reading them; it is the sample the rules were NOT written against.
- [ ] **Step 2: Write the failing tests** — `tests/ladder-speaker.test.ts`: one test per grammar case with a constructed headline (Beijing's `中方`, `我使馆`, `中国驻日大使馆`, bare `外交部：`; another state's `印方`, `俄方`, `越南坚决…`, `伊朗外交部`; a target after `向`/`就`/`准` is skipped; a response `美方声称…中方驳斥：坚决反对` is Beijing; mutual `中国菲律宾互相…` is Beijing; a bare ministry after another state's name is `unclear`; no marker before the formula is `unclear`; a country inside a longer noun such as `韩国光州双年展` is not a subject); the fixture gate below; determinism.

```ts
import { describe, it, expect } from 'vitest';
import { formulaSpeaker } from '@/lib/lang/speaker';
import { LADDER_FIXTURE, LIVE_FIXTURE } from './fixtures/ladder-speakers';

const run = (rows: typeof LADDER_FIXTURE) => rows.map((r) => ({ ...r, got: formulaSpeaker(`${r.title} ${r.snippet}`, r.formula) }));

describe('against the hand-labelled fixture', () => {
  const rows = run(LADDER_FIXTURE);
  it('never calls another party Beijing', () => {
    const bad = rows.filter((r) => r.expected !== 'prc' && r.got === 'prc').map((r) => r.title);
    expect(bad, `false Beijing:\n${bad.join('\n')}`).toEqual([]);
  });
  it('never calls Beijing another party', () => {
    const bad = rows.filter((r) => r.expected === 'prc' && r.got === 'other').map((r) => r.title);
    expect(bad, `real Beijing hidden:\n${bad.join('\n')}`).toEqual([]);
  });
  it('recognises most of Beijing’s own formulae rather than giving up', () => {
    const prc = rows.filter((r) => r.expected === 'prc');
    const got = prc.filter((r) => r.got === 'prc').length;
    expect(got / prc.length, `${got} of ${prc.length}`).toBeGreaterThanOrEqual(0.7);
  });
});

describe('against headlines the rules were not written against', () => {
  it('holds the same two lines', () => {
    const rows = run(LIVE_FIXTURE);
    expect(rows.filter((r) => r.expected !== 'prc' && r.got === 'prc')).toEqual([]);
    expect(rows.filter((r) => r.expected === 'prc' && r.got === 'other')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `npm test -- tests/ladder-speaker.test.ts` → FAIL, `Cannot find module '@/lib/lang/speaker'`.
- [ ] **Step 4: Write the module** — `lib/lang/speaker.ts`:

```ts
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
const ABBR = '印巴俄日韩美英法德伊菲越澳泰朝';
const NAMES = ['印度', '巴基斯坦', '俄罗斯', '日本', '韩国', '美国', '英国', '法国', '德国', '伊朗', '菲律宾',
  '越南', '澳大利亚', '泰国', '朝鲜', '以色列', '土耳其', '沙特', '台湾', '乌克兰', '马来西亚', '印尼',
  '新加坡', '加拿大', '意大利', '欧盟'];
const NAME_ALT = NAMES.join('|');
const INSTITUTION = '(?:外交部|国防部|军方|政府|总统府|总统|总理|议员|官员|使馆|当局|代表|发言人|外长|防长|部长|副总统)';
/** What follows a subject: a verb, an adverb of stance, or the colon that introduces a statement. */
const PRED = '(?:严正|强烈|坚决|表示|驳斥|警告|提出|提|已|将|要求|宣布|回应|再|就|向|对|不|愿|却|互相|邀请|要|称|指|说|：|:)';
const TARGET_LEAD = /(?:向|对|就|与|同|准|给|召见|传召|召)$/;

type Side = 'prc' | 'other' | 'bare';
interface Marker { start: number; end: number; side: Side }

const PRC = new RegExp(
  `中方|我(?:驻[^，：、\\s]{0,6})?(?:大)?使馆|中国(?:驻[^，：、\\s]{1,8}?)?(?:大)?使馆|中国(?:大陆)?(?=${PRED})|中国(?=${INSTITUTION})|北京(?=[：:]|${PRED})|国台办`, 'g');
const OTHER = new RegExp(
  `[${ABBR}]方|(?:${NAME_ALT})(?=${PRED}|${INSTITUTION})|[${ABBR}](?=${INSTITUTION})|[${ABBR}]{2,3}`, 'g');
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

export function formulaSpeaker(text: string, formula: string): LadderSpeaker {
  const at = text.indexOf(formula);
  if (at < 0) return 'unclear';
  const pre = text.slice(0, at);
  const markers = findMarkers(pre)
    .filter((m) => !TARGET_LEAD.test(pre.slice(Math.max(0, m.start - 2), m.start)));
  if (!markers.length) return 'unclear';

  const nearest = markers[markers.length - 1];
  if (nearest.side === 'bare') {
    // A bare 国防部 after 菲律宾军方 is the Philippines' ministry; after 美国 it may be China's
    // answer. Surface grammar cannot tell which, so it is not claimed.
    return markers.some((m) => m !== nearest && m.side === 'other') ? 'unclear' : 'prc';
  }
  return nearest.side;
}
```

- [ ] **Step 5: Run and iterate against the fixture.** `npm test -- tests/ladder-speaker.test.ts`. Read every failure. If a failure is a grammar gap that generalises, fix the rule; if fixing it needs a case-specific hack, make that case `unclear` and record it under "Deviations". The recall floor (0.7) may be adjusted to the measured value minus nothing — record the measured figure.
- [ ] **Step 6: Type-check and commit** — `npx tsc --noEmit`; `git add lib/lang/speaker.ts tests/ladder-speaker.test.ts tests/fixtures/ladder-speakers.ts`; commit "Say whose formula it is, by the grammar of the headline".

---

### Task 2: Carry and store the speaker

**Files:** Modify `lib/types.ts`, `lib/analyze/score.ts`, `lib/ingest/pipeline.ts`, `lib/db/index.ts`; Test `tests/ladder-speaker-store.test.ts`.

**Interfaces:** Consumes `formulaSpeaker`. Produces `Article.ladderSpeaker?: LadderSpeaker | null`; `ScoreResult.ladderSpeaker`; `ladderPatches(stored: Article[]): LadderPatch[]` (exported from `lib/ingest/pipeline.ts`); `updateLadders(patches: LadderPatch[]): number` (from `lib/db`), where `LadderPatch = { id: string; ladderRung: number | null; ladderZh: string | null; ladderEn: string | null; ladderSpeaker: LadderSpeaker | null }`.

- [ ] **Step 1: Failing tests** — `tests/ladder-speaker-store.test.ts`: (a) `scoreText('中方已向日方提出严正交涉')` returns `ladderSpeaker: 'prc'` and `scoreText('印方强烈不满，紧急召见巴方外交人员')` returns `'other'`, and text with no formula returns `null`; (b) with `KAUTILYA_DB` set to a temp file (pattern of `tests/alerts-run.test.ts`), an upserted article round-trips `ladderSpeaker`, and an article stored without one reads back `null`; (c) opening a database created WITHOUT the column adds it and is idempotent (create the old table by hand, call `getDb()` twice); (d) `ladderPatches` returns a patch for a stored row whose speaker is `null` but whose text carries a formula, none for a row that is already correct, and none for a row with no formula.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - `lib/types.ts`: `import type { LadderSpeaker } from '@/lib/lang/speaker';` and on `Article`, after `ladderEn`: `/** Who spoke the formula. Optional: rows stored before this existed carry none, which reads as unclear. */ ladderSpeaker?: LadderSpeaker | null;`
  - `lib/analyze/score.ts`: add `ladderSpeaker: LadderSpeaker | null;` to `ScoreResult`; import `formulaSpeaker`; after `const rung = highestRung(raw);` add `const speaker = rung ? formulaSpeaker(raw, rung.zh) : null;` and return `ladderSpeaker: speaker,`.
  - `lib/ingest/pipeline.ts`: in `enrich`, add `ladderSpeaker: s.ladderSpeaker,` after `ladderEn`. Export `interface LadderPatch` and
    ```ts
    export function ladderPatches(stored: Article[]): LadderPatch[] {
      const out: LadderPatch[] = [];
      for (const a of stored) {
        const s = scoreText(a.title, a.snippet);
        if (a.ladderRung === s.ladderRung && (a.ladderSpeaker ?? null) === s.ladderSpeaker) continue;
        out.push({ id: a.id, ladderRung: s.ladderRung, ladderZh: s.ladderZh, ladderEn: s.ladderEn, ladderSpeaker: s.ladderSpeaker });
      }
      return out;
    }
    ```
    and in the "Re-evaluate the whole stored corpus" block, after the prune, `const patched = updateLadders(ladderPatches(allArticles(8000))); if (patched) log(`re-attributed the ladder on ${patched} stored articles`);` — this is what fills speakers on rows older than the feed window, which the upsert alone never re-touches.
  - `lib/db/index.ts`: add `ladder_speaker TEXT` to the `CREATE TABLE articles` (after `ladder_en TEXT`); a migration `if (!cols.has('ladder_speaker')) { db.exec('ALTER TABLE articles ADD COLUMN ladder_speaker TEXT'); }`; add `ladder_speaker` to the upsert's column list, `@ladder_speaker` to its values, `ladder_speaker=excluded.ladder_speaker` to `DO UPDATE SET`, `ladder_speaker: S(a.ladderSpeaker ?? null)` to `stmt.run`; `ladderSpeaker: r.ladder_speaker ?? null` in `rowToArticle`; and
    ```ts
    export function updateLadders(patches: { id: string; ladderRung: number | null; ladderZh: string | null; ladderEn: string | null; ladderSpeaker: string | null }[]): number {
      if (!patches.length) return 0;
      const db = getDb();
      const stmt = db.prepare('UPDATE articles SET ladder_rung=@r, ladder_zh=@z, ladder_en=@e, ladder_speaker=@s WHERE id=@id');
      tx(db, () => { for (const p of patches) stmt.run({ id: p.id, r: S(p.ladderRung), z: S(p.ladderZh), e: S(p.ladderEn), s: S(p.ladderSpeaker) }); });
      return patches.length;
    }
    ```
- [ ] **Step 4: Run tests, the whole suite and `tsc`** → clean. **Step 5: Commit** "Store whose formula it is, and backfill it on stored rows".

---

### Task 3: An event's ladder means Beijing's

**Files:** Modify `lib/verify/cluster.ts`; Test `tests/ladder-speaker-events.test.ts`.

- [ ] **Step 1: Failing tests** — build events with `clusterArticles` from `art()` helpers (copy the helper from `tests/verify.test.ts`, giving the articles a shared actor pair, distinct 4+-word titles and the same time) and assert: a `prc` rung 4 beside an `other` rung 8 gives an event with `ladderRung === 4`; an event whose only rungs are `other` has `ladderRung === null`; an event whose only rung has NO speaker (`undefined`) has `ladderRung === null`; and an India–Pakistan `other` rung 8 produces no jump from `detectJumps` for a `country('IND')` watcher, while a `prc` rung 8 does.
- [ ] **Step 2: Run** → FAIL (events currently take any rung).
- [ ] **Step 3: Implement** — in `buildEvent`, replace the `withLadder` line with:
  ```ts
  // An event's ladder is BEIJING's. The detector matches formula text whatever the speaker, and
  // about two in five hits in the real corpus were other governments; the surfaces that read this
  // say "PRC". An article with no speaker (a row stored before this existed) counts as unclear.
  const withLadder = cluster.filter((a) => a.ladderRung !== null && a.ladderSpeaker === 'prc')
    .sort((a, b) => (b.ladderRung ?? 0) - (a.ladderRung ?? 0))[0];
  ```
- [ ] **Step 4: Run the whole suite + `tsc`.** Existing tests must pass unchanged. **Step 5: Commit** "Take an event's ladder from Beijing's own formulae only".

---

### Task 4: Say it where it is read

**Files:** Create `components/LadderBadge.tsx`; Modify `app/events/[id]/page.tsx`, `lib/llm/analyse.ts`, `app/api/export/route.ts`, `app/methodology/page.tsx`, `data/glossary.ts`, `tests/llm.test.ts` (fixture gains `ladderSpeaker: 'prc'`); Test `tests/ladder-speaker-surfaces.test.ts`.

- [ ] **Step 1: Failing tests** — render `LadderBadge` with `renderToStaticMarkup`: `prc` → contains `rung 8` and not `not Beijing`; `other` → `rung 8 · not Beijing`; `undefined`/`unclear` → `speaker unclear`. The LLM prompt builder marks a `prc` formula "PRC ladder formula detected" and an `other` one "not attributed to Beijing". The export includes a `ladder_speaker` field. `/methodology` source mentions who is speaking and that only headlines are read; the glossary has a `ladder-speaker` entry and its `escalation-ladder` and `rung` entries say "Beijing's".
- [ ] **Step 2: Implement.** `LadderBadge({ rung, speaker }: { rung: number; speaker?: LadderSpeaker | null })` renders the existing zh-toned `Badge` for `prc`, a faint one reading `rung {rung} · not Beijing` for `other`, and `rung {rung} · speaker unclear` otherwise, each with a `title` explaining it. Use it in the event page's `report()` in place of the inline badge. In `lib/llm/analyse.ts` replace the ladder line with `a.ladderZh ? (a.ladderSpeaker === 'prc' ? \`    PRC ladder formula detected: ...\` : \`    escalation formula present (${a.ladderZh}) but not attributed to Beijing\`) : null`. Add the field to the export route. In `/methodology`, after the paragraph that introduces the ladder, add: "**Whose formula it is.** The match is on the words, so each hit is also attributed: Beijing, another party, or unclear, by reading the headline's grammar — the nearest subject before the formula, ignoring who is being addressed. Only Beijing's count on the PRC surfaces; another government's protest still registers as tension but is labelled 'not Beijing'. Only headlines and short snippets are read, and how many real Beijing formulae never appear in one is not known, so an absence is not calm." Reword the glossary entries and add `{ id: 'ladder-speaker', term: 'Speaker (of a formula)', meaning: ... }`.
- [ ] **Step 3: Run tests, suite, `tsc`. Step 4: Commit** "Label whose formula a rung is, and say so on the methodology page".

---

### Task 5: The shift report and audit

**Files:** Create `scripts/ladder-shift.ts`; Modify `package.json`.

- [ ] **Step 1: Write the script** — read-only. For every stored rung-bearing article run `formulaSpeaker` and print: counts by speaker; events carrying a ladder before (stored) and after (recomputed from `prc` articles via the same rule as `buildEvent`); what the board's "PRC ladder hits" stat reads before and after; and **every `other` and `unclear` headline in full** with its formula, so a wrong call is read, not inferred from a total. End with the invariant line: articles with no formula are untouched (must be 0 changes).
- [ ] **Step 2: Add** `"ladder:shift": "tsx --tsconfig tsconfig.scripts.json scripts/ladder-shift.ts"` beside `reprints:shift`.
- [ ] **Step 3: Run** `npm run ladder:shift`, read every listed headline, and record the counts. **Step 4: Commit** "Add a ladder shift report that lists every exclusion".

---

### Task 6: Verify against a real build, then stop

- [ ] `npm test`, `npx tsc --noEmit`, `npm run build`, copy static; copy the database to the scratchpad, run the backfill and a re-cluster against the COPY (a throwaway script calling `updateLadders(ladderPatches(allArticles(8000)))` then `replaceEvents(clusterArticles(...))`), start the preview by the temporary launch entry, and confirm from the DOM: an India–Pakistan event no longer shows a ladder gauge or a "PRC" badge; its article rows read "not Beijing"; a Beijing event still does; the board's stat has fallen to the shift report's figure. Clean up (stop the server, remove the entry, delete the copy).
- [ ] Leak scan, push the branch to the private repo (branch only), and **report the shift report to Josh. Deployment waits for his say-so.**

## Deviations, as built

Recorded so the plan stays an honest account of what shipped. None weakens a constraint.

- **Task 1: two rules came from the first failures, not from reasoning.** A country name directly before
  the formula IS its subject (the formula is itself the stance verb, so the text after the name was cut
  off); and verbs of address (谴责 批评 指责 敦促 警告 …) take the counterparty as their object, so
  `中方强烈谴责日方` no longer reads Japan as the speaker. Both are general grammar, not special cases.
- **Task 1: the live fixture is 4 headlines, not a sample.** The live server had 12 rung-bearing headlines
  but 8 were the same stories as the local set. It is the only unseen sample and is thin; it says so.
- **Task 5: reading the audit found a rule error AND a wrong hand label.** A VOA piece on Taiwan's vice
  president was called another party's; its snippet ("遭到中国的坚决反对，并向欧盟…提出严正交涉") makes it
  Beijing's. My label came from the title alone, which is why the fixture gate had passed. The label is
  corrected (29 Beijing formulae, not 28) and the rule reads a possessive standing directly before the
  formula. A possessive that is not beside the formula ("中国的芯片") is not a speaker.
- **Task 4: `ladderNote` was extracted** from the LLM prompt so it could be tested; `tests/llm.test.ts`
  needed no change. `LadderBadge` builds each label as one string, because React puts comment markers
  between adjacent text nodes.
- **Task 2: the back-fill the spec implied is explicit.** The ingest re-analyses only rows it re-fetches,
  so `ladderPatches` / `updateLadders` fill the speaker on older stored rows.
- **Test-count arithmetic:** 569 → 624 (23 speaker + 11 store + 7 events + 11 surfaces + 3 added after
  the audit).
- **A flaky test, not part of this work:** `tests/analyse-route.test.ts` takes 4.9-6.6 s under the full
  suite on `main` and on this branch against vitest's 5 s limit, and failed once after a restart.
  Flagged as its own task rather than folded in here.

## Self-review

**Spec coverage:** speaker rule and fixture → Task 1; storage, rollout and the backfill the spec's "re-analysed on every ingest" needed → Task 2; event ladder → Task 3; surfaces, methodology, glossary, LLM prompt, export → Task 4; shift report → Task 5; verification and the stop → Task 6. **Placeholder scan:** none, apart from the deliberate empty Deviations section. **Type consistency:** `LadderSpeaker`, `formulaSpeaker`, `ladderSpeaker`, `ladderPatches`, `updateLadders`, `LadderBadge`, `LADDER_FIXTURE`, `LIVE_FIXTURE` are spelled the same throughout.
