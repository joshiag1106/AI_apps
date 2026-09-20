# The ladder evidence trail — when Beijing used a formula, and about whom

**Status:** Stage 2 of the two-stage plan Josh approved on 2026-09-19 ("A approved"). Stage 1
(`2026-09-19-ladder-speaker-design.md`) shipped on 2026-09-20 and made every ladder surface mean
*Beijing's* formula. On 2026-09-20 Josh chose where the arrow's target comes from — the headline
grammar — and told me to write this spec after seeing the four-part design in chat.

**Built** on the branch `ladder-trail` (not merged, not deployed). Amended after checking the
production build: three statements below were wrong or incomplete and are corrected in place — the
click-target size, the "collecting since" wording, and the new-high ring being visual only. The
account of what the real build showed is in `STATE.md`.

## Problem

After Stage 1 the ladder says *how high* Beijing went on an event. It does not say *when*, *about
whom*, or *in what order*. An event carries one rung; the dyad page lists events; China Watch counts
them per rung. Nothing shows a sequence, and the original pitch — Beijing's posture toward one
country over time, with the headline behind every mark — has no home.

Measured on the local 90-day corpus of 2026-09-20 (7,766 articles, 2026-06-20 to 2026-09-17), read
with the Stage 1 rule:

- **27** Beijing-attributed rung hits → **20** events → **17** distinct (day, formula) pairs. The
  first is 13 July: the first three weeks of the window hold none. That is "no formula found in a
  headline", not "calm".
- **The live site is much thinner.** It began collecting on 2026-09-17 and its ladder stat read 4
  after the Stage 1 deploy. A chart that assumes ninety days of history would open nearly empty.
- **An article's country list cannot supply the target.** One 13 July statement to Japan lists six
  countries (CHN, JPN, PHL, VNM, MYS, USA). Across the 27 hits, 15 name exactly one non-China
  country, 6 name none and 6 name several.
- **The headline grammar usually does name the target.** By hand, about 22 of 27 say it (日方,
  召菲驻华大使, 向韩方, 美方). The other 5 name a person or a company (高市早苗, the Anthropic
  report, 萧美琴 visiting Italy). By hand the targets are roughly Japan 10, United States 5, South
  Korea 5, Philippines 4, Taiwan/Italy 2, one company. So the chart has about five rows and roughly
  fifteen dots. These counts are my reading and are the *estimate* the fixture must confirm, not a
  result.

## Decisions

1. **The target is a property of the article.** `ladderTarget: string | null` — an ISO3 code, or
   `null` for "the headline does not say". It is non-null only when `ladderSpeaker === 'prc'`; a
   formula that is not Beijing's has no Beijing target. It is never `CHN`.
2. **It is read from the headline grammar, by a new rule in `lib/lang/target.ts`,** built the way
   the speaker rule was: written from grammar, checked against a hand-labelled fixture, `null` where
   the grammar is ambiguous. The steps, in order — the first that finds a state decides, and it
   decides `null` if it finds two different ones:
   1. A mutual group that names Beijing (中国菲律宾互相传召对方大使) → the *other* state.
   2. In Beijing's own clause — from its subject (中方, an embassy, a bare ministry) to the formula —
      a state introduced by a target introducer or written as a side (向日方, 召菲驻华大使, 对韩国,
      准菲方). The introducer list is the speaker rule's own `TARGET_LEAD`.
   3. The state an embassy sits in, when Beijing's subject is one (中国驻日大使馆 → `JPN`).
   4. Otherwise a state named *before* Beijing's subject — the party whose act is being answered
      (美方声称…中方驳斥：坚决反对).
   5. Otherwise a state named after the formula — the object of the protest
      (严正交涉、强烈抗议日方消极动向).
   6. Otherwise the home state of a roster person named in the headline (高市早苗 → `JPN`, from
      `Person.home`) — but only when the headline names no state at all, since a headline naming an
      official *and* a state is about the state's part in it, and the rule cannot tell how.
   7. Otherwise `null`.

   Two *different* states at the same step → `null`, not a guess (萧美琴 访意 欧盟 names Italy and
   the EU). The EU is recognised so it can stop the search, but is never returned: it is not a state
   the site tracks. Step 3 was found while prototyping the rule on the 27 hits, and the order was
   fixed then; the plan carries the code that produced 27 of 27 agreements with the hand labels. The states come from the same abbreviations and names the speaker rule uses plus the
   country alias table in `data/countries.ts`; the shared constants are exported from one place, not
   copied.
3. **A dot is a (target, day) pair, at that day's highest rung.** Days are UTC calendar days of
   `publishedAt` — feed timestamps are UTC. Reports in the same reprint family (the existing
   `reprintFamilies`) count once, so a wire copy is not five originals. The dot records both counts
   and says "N reports", or "N reports, M originals" when a fold happened. The five 15 August Japan
   reports, at rungs 7 and 8, are one dot at rung 8; the rung-4 report of the 16 August is another.
4. **A new-high marker means "above every earlier dot in this row".** This is the comparison
   `lib/alerts/detect.ts` makes ("a rung above the highest already reported"), with one deliberate
   difference: the first dot in a row is *not* marked. An alert fires on first sighting because the
   subscriber has never been told; the chart has no earlier dot to beat, and marking every row's
   first dot would mark them all.
5. **The trail is derived, not stored.** `ladderTrail()` in `lib/verify/trail.ts` is a pure function
   from Beijing-attributed rung articles to rows of dots. Only `ladderTarget` is a new stored field.
6. **The chart is a picture of a table.** The same data renders as a table of dated headlines, each
   linked to its event, always in the DOM. The chart adds nothing the table lacks. It therefore works
   without JavaScript, can be tested with `renderToStaticMarkup`, and is readable by a screen reader.
7. **Honest about what it cannot see.** The axis runs from where coverage begins to today, capped at
   90 days. Coverage begins at the later of the corpus's earliest article and the first ingest less the
   feeds' seven-day look-back — not simply the earliest article, because the live database holds 98
   articles dated July and August that are stragglers, and starting there said "collecting since
   3 Jul" over a corpus that began on 17 Sep. The section says "Collecting since <date>" — or, once
   the cap has cut the window short of where coverage begins, "Showing the last 90 days.", because
   the first wording would then name a date the corpus predates. Its copy says formulae are detected in headlines only
   and that no formula found does not mean calm. Nothing is drawn as a line, because a line would
   read as a level.

## Design

### Data
- **`lib/lang/target.ts`** — `formulaTarget(text, formula): string | null`. Sits beside
  `lib/lang/speaker.ts`, which exports the constants it shares (`ABBR`, the state names, and
  `TARGET_LEAD`). If it needs more than those three, they move to a small `lib/lang/states.ts`; the
  plan decides.
- **`lib/analyze/score.ts`** — `ScoreResult` gains `ladderTarget`, computed only for a `prc` speaker.
- **`lib/types.ts`, `lib/db/index.ts`** — `Article.ladderTarget?: string | null`; an additive
  `ALTER TABLE articles ADD COLUMN ladder_target TEXT`; the upsert, the row mapper and
  `updateLadders` carry it. Two read accessors: `ladderTrailArticles()` (rung not null and speaker
  `prc`) and `corpusSince()` (the earliest `published_at`).
- **`lib/ingest/pipeline.ts`** — `LadderPatch` and `ladderPatches()` gain the target, so the first
  ingest after the deploy back-fills every stored row, exactly as Stage 1 did.
- **`lib/verify/trail.ts`** — `ladderTrail(articles, { since, until, eventOf? })` (`eventOf` maps an
  article id to its event id, so a dot can link to its event) returns
  `{ since, rows: { target, dots: Dot[] }[], notStated: Dot[] }`. A `Dot` carries the date, target,
  highest rung with its Chinese and English formula, `reports`, `originals`, `newHigh`, the event id
  carrying the day's highest rung, and its evidence: one `{ title, outlet, url, eventId, rung }` per
  reprint family. Rows sort by most recent dot, then highest rung; `notStated` is last.

### Surface
- **`components/LadderTrail.tsx`** — one row per target, labelled "Beijing → Japan" (the arrow is the
  attribution), dots placed by date on a shared axis with gridlines. A dot's diameter (8–16 px)
  follows the ladder's own `severity` from `ESCALATION_LADDER`, not a new scale; its fill is the
  ladder's Beijing colour (`--color-zh`); a ring marks a new high, and a halo in the lane's colour
  keeps overlapping dots apart. Each dot is a link to its event, with an accessible name such as
  "Beijing to Japan, 15 Aug: rung 8 (new high), strong protest — 5 reports" — the ring is visual, so
  "(new high)" is said in the name and in the table too, and the chart adds nothing the table lacks.
  **The click target is the dot itself, never wider than two days of axis.** The first design gave it
  24 px, which is wrong: days are about 9 px apart on a desktop axis, so a 24 px target took its
  neighbour's clicks (in the real build a click on the centre of 4 of 15 dots opened the next day's
  event). On a phone, where days are about 3 px apart, adjacent dots merge and the table's text links
  are the way in; the copy says so. Each dot's event is looked up directly, not through the newest
  4,000 events the display corpus holds. Below the chart, a `<details>` holds the table of every dated
  headline, closed by default and always rendered.
- **Placement:** a new section on China Watch after "Official statement detections", and the same
  component narrowed to one row on the dyad page when the pair includes China.
- **Motion:** dots scale in when the section scrolls into view, through `RevealOnView`'s existing
  `.reveal-scale` hook, and stay still under reduced motion. The hook scales its elements together;
  a left-to-right stagger needs a small per-element delay. Reading the hook settled it: a
  `data-reveal-delay` attribute read in the one line that sets the transition, so it is in.
- **Copy:** a methodology paragraph, glossary entries for "evidence trail" and "ladder target", and a
  `ladder_target` column in `/api/export`.
- **Alerts and scoring are untouched.** Events already carry Beijing's rung only.

## Testing and verification

Test-first, in the existing style (vitest, node environment, `renderToStaticMarkup`).

- **`tests/target.test.ts`** — the grammar, case by case; the never-`CHN` and null-unless-`prc`
  guarantees; ambiguity resolving to `null`; the 27-hit `TARGET_FIXTURE`; the 47-hit speaker fixture
  re-run unchanged, as the regression that Stage 1 still holds.
- **`tests/ladder-target-store.test.ts`** — the column, the migration on an old database, the upsert,
  the accessors, and the back-fill patch.
- **`tests/ladder-trail.test.ts`** — dot identity, reprint collapse, the day boundary, the new-high
  rule including the unmarked first dot, row order, the `notStated` row, `since`, and the empty state.
- **`tests/ladder-trail-surfaces.test.ts`** — the section on China Watch and on a China dyad page and
  its absence on a non-China dyad; the table content and event links; the "collecting since" and
  "headlines only" copy; no inline animation styles; the methodology, glossary and export changes.
- **Acceptance bars.** On the target fixture: **zero wrong targets** — the bar that matters, since a
  wrong target puts a dot in the wrong row silently. Resolving about 22 of 27 is the aim, not a gate;
  the rest stay `null`. The speaker fixture must not move at all.
- **`npm run ladder:shift`** gains a targets section that prints *every* resolved article with its
  target and *every* headline left `null`, in full, so a person reads them.
- **A real production build** checked in the browser at 375 px and desktop width, in more than one
  palette, and with reduced motion, before any deploy. After a deploy the ingest back-fills the live
  rows and I read the live trail against the live headlines.

## Non-goals

Other governments' ladders; rung on the vertical axis; any continuous line or trend claim ("Beijing
hasn't gone above rung 6 with India in 41 days" cannot be supported on headline-only detection);
alerts or scoring changes; article body text (still behind the redistribution review); targets for
formulas that are not Beijing's.

## Risks

- **A wrong target is silent.** The dot lands in the wrong row and looks confident. Mitigated by the
  zero-wrong bar, by `null` on any ambiguity, by the audit that prints every resolved target and every
  unresolved headline, and by the table under the chart showing the headline behind every dot.
- **The fixture is the whole hit set, and so is the training set.** It proves the rule is coherent,
  not that it generalises. The held-out check is the live corpus as it fills: after a few weeks, run
  `ladder:shift` against a restored nightly backup and read what the rule did with headlines it never
  saw. The grammar-derived cases in the unit tests are written from the rule, not from the hits.
- **The live chart opens with about four dots.** That is the truth of a three-day-old corpus, stated
  in the section, and it fills over the coming weeks. It is not a defect to paper over.
- **Taiwan appears as a row.** The site already treats `TWN` as an actor, and Beijing's statements
  about it are real evidence, so it stays; it is noted here so it is a choice and not a surprise.
- **Two things not checked:** whether the local corpus is representative of what the live site will
  collect, and whether the roster's `home` is right for every named official. The second is bounded
  by the roster's own review date.
