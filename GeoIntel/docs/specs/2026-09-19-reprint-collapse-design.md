# Reprint collapse — design

**Status:** approved by Josh 2026-09-19, including the fold animation. Awaiting spec review
before the implementation plan.

**Decisions taken:** collapsing reprints **changes the confidence score** (not a label only),
and the event page gets a **fold animation** where reprints merge into the report they repeat.

## Problem

Corroboration is the product's central claim, and it counts outlets. But a wire story printed
by five outlets is one report, not five, and the score currently cannot tell the difference.
Measured on the corpus of 2026-09-19: of 670 events scored as having two or more independent
outlets, **147 (21.9%)** contain near-identical headlines from different outlets, so the
distinct originals number fewer than the outlets counted — 110 lose one, 23 lose two, and the
tail reaches ten. Two Chinese outlets running an identical headline turn "two independent
outlets" into one. This is the same weakness the Vietnam seat note in `data/people.ts`
describes: one story, printed twice, read as two sources.

Inflation is not confined to the outlet count. A wire report printed in five countries also
earns full country-spread points, and one printed across two ownership classes earns the
ownership-diversity bonus. All three are wrong for the same reason.

## What counts as a reprint

Two articles are reprints of one another when their headlines are near-identical after
normalisation. Nothing else — not the body, not the outlet's reputation.

**Normalisation** (`headlineKey`, in a new `lib/verify/reprints.ts`): NFKC-fold and lower-case;
strip a trailing outlet suffix, including the forms without spaces (`… | 加拿大新闻网`, which
scored 0.78 against its own bare headline in the measurement and is the one true reprint the
first draft missed); strip a leading section label (`Video |`, `WATCH:`, `LIVE`, `URGENT`);
drop punctuation and curly quotes. Latin, Devanagari and Arabic script become word sets;
Han text becomes character bigrams.

**Similarity:** Jaccard over those sets, **≥ 0.8**. It deliberately does *not* reuse
`cluster.ts`'s `jaccard`/`tokens`: those add glossed terms and hotspot ids so that a Chinese and
an English report of one event can match, which is exactly what makes paraphrases look
identical here.

**Minimum length:** at least 4 words, or 6 Han characters, or the headline is never treated as
a reprint. It protects generic headlines ("Iran attacks Israel") that two editors could write
independently. Measured against the current corpus it excludes nothing at ≥ 0.8; it is a
safety net for headlines that have not been written yet, and it errs toward the status quo.

**Figures must match:** two headlines whose numbers differ are different reports. Added after
the first shift report, by reading a sample of the collapsed families it printed: a daily VOA
Chinese broadcast titled by its date ("… 2026年9月3日", "… 9月4日") scored above 0.86 against the
next day's, and "4 missiles" against "5 missiles" scores 1.0 on words alone. Numbers are compared
as a set after normalisation; a mismatch means no grouping. It errs toward not collapsing.

**Families:** articles are taken in publication order (ties by id). Each joins the first
existing family whose *anchor* — its earliest article — it matches, else starts a new one.
Matching against the anchor rather than any member prevents chaining: A~B and B~C at 0.8 must
not merge A and C at 0.5. Deterministic.

**Representative:** the member the score reads — official statement first, then the best
outlet tier, then earliest. The interface says "also printed by", never "copied from", because
which outlet copied which cannot be known from a headline.

**Deliberately not collapsed:** the 0.5–0.8 similarity bands (about 630 pairs in the
corpus) are mostly independently written headlines about one event — "4 sailors killed in
Houthi missile attack" beside "Four killed in Houthi attack on Red Sea cargo ship, sources
say". Those are separate editorial decisions and stay separate. Rewritten wire copy therefore
escapes, so the measured inflation is a floor. Translated copy across scripts also escapes.
`/methodology` says both plainly.

**Safe direction:** under-collapsing is the status quo; over-collapsing silently penalises
genuine corroboration. Every threshold errs toward not collapsing.

## Scoring

`scoreConfidence(cluster)` builds the families, then computes **every** signal from the
representatives instead of the raw cluster. The six signals and their maxima (25, 20, 20, 10,
15, 10) do not change; what they are computed over does.

- **Independent outlets** counts distinct outlets among independent representatives. Detail
  reads, for example, "2 independent originals from 3 outlets reporting; 1 outlet printed a
  report already counted".
- **Ownership, country spread, language, primary, tier** are computed over representatives.
- **Contradiction** still reads the *whole* cluster: a denial inside a reprint is still a
  denial, and the check must never become quieter because of this change.
- **`single_source`** now means every report traces to one original (one family). Its wording
  in `FLAG_LABEL`, the glossary and `/methodology` changes with it.
- `state_media_only`, `primary_sourced` and `uncorroborated` keep their definitions.

No new field on `GeoEvent`, no schema change. Events are rebuilt from articles on every
ingest, so scores update on the next hourly refresh after deploy.

## Display

The event page's "Source-by-source evidence" list groups by family, using the *same*
`reprintFamilies` the scorer uses, so the page and the score cannot disagree. A family of one
looks exactly as today. A family of several shows its representative as today, then a native
`<details>` summary — "Also printed by Dawn, chinaglobalsouth.com" — holding the reprint rows
in compact form, closed by default. Native `<details>` means it works without JavaScript and
is keyboard- and screen-reader-operable for free. When every other version comes from the
representative's OWN outlet — a video beside its article, a magazine's numbered pages, both found
in the real corpus — the summary reads "More from <outlet> under the same headline … other
versions" instead, since "also printed by" the outlet already shown would claim a second
publisher that does not exist.

`ConfidenceMeter` needs no structural change: the outlets signal's detail line carries the
explanation. The board's "corroborated" count will fall; that is the intended effect.

## Fold animation

The one purposeful piece of motion in this change. When a family with reprints scrolls into
view, its reprint rows start open and stacked, then fold into the summary line over about
450 ms — the reader watches the duplicates merge into the report they repeat.

- Added to `RevealOnView` as a fourth opt-in surface (`[data-reveal-fold]`), alongside
  stroke-draw, `.reveal-scale` and `[data-reveal-bar]`, so it inherits its rules: once per
  mount, layout effect so the starting state lands before paint, and an early return under
  `prefers-reduced-motion`.
- **The final state is the resting state.** Without JavaScript, or with reduced motion, the
  `<details>` is simply closed. The animation can only ever *start* from open; it never hides
  content that cannot be recovered.
- It animates through inline styles set by the hook, not a CSS class, so the guard is the hook's
  own early return under `prefers-reduced-motion`, pinned by `tests/reveal-fold.test.ts`.

## Documents to keep honest

`/methodology` (what is caught, what is not, and the safe-direction rule), the README scoring
section, the glossary (new "Reprint" entry, reworded "Flag: single source" — the glossary tests
already force an entry per flag), `FLAG_LABEL.single_source.help`, and `STATE.md`.

## Testing

Test-first, each watched failing for the right reason.

- **`reprints`:** identical headlines from two outlets form one family; the trailing-suffix and
  section-label forms match; a Chinese pair differing only by `| outlet` matches; 0.5–0.8
  paraphrases do **not**; a headline under the minimum length never matches; A~B and B~C does
  not merge A and C; output is byte-identical across runs and input orders.
- **`scoreConfidence`:** two reprints score as one outlet; a reprint does not add country
  spread or ownership diversity; a denial inside a reprint still fires `disputed`; the
  representative prefers an official statement; scores stay within 0..100; `single_source`
  fires when every report traces to one family. Existing tests must still pass unchanged —
  any that fail because a fixture reuses one headline are fixed by giving the fixture distinct
  headlines, not by relaxing the rule.
- **Page:** rendered HTML groups a family under one representative, and the family count the
  page shows equals the count the scorer used.
- **Motion:** reduced-motion coverage via the existing layout test.
- **Verified against a real production build**, as the splash and glossary both showed is
  necessary: the fold plays once, ends closed, and the details remains operable.

## Rollout

1. A script, `scripts/reprint-shift.ts`, recomputes confidence for every stored event with the
   new scorer and compares it with the stored value — which came from the old scorer, so no
   second copy of the old code is needed. It reports how many events change, by how much, and
   how many cross a confidence band.
2. **Josh sees that report before anything deploys.** This is a deliberate score-lowering
   change and the exact size of the shift should be a known number, not a surprise.
3. Deploy by the runbook; scores update on the next hourly ingest.

## Non-goals

Body-text comparison; detecting rewritten or translated copy; guessing which outlet copied
which; changing the clustering itself (events keep the same ids and membership); any new
`GeoEvent` field or schema change.

## Risks

- **Over-collapse** on two independently written identical headlines. Mitigated by the 0.8
  line, the minimum length, and the safe-direction rule; visible in the shift report.
- **The 0.8 line is measured on one corpus.** The shift report is rerun after deploy against
  the live database, and any borderline family is a `/methodology` limitation, not a secret.
- **Score drop reads as a regression.** Mitigated by the methodology and glossary text, and by
  the outlets detail line saying exactly what was and was not counted.
