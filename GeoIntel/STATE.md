# Where this project stands

**Last worked: 2026-09-08.** Everything below was verified, not assumed. Where something
is unverified it says so.

## Pick up in 30 seconds

```bash
cd Output/GeoIntel
npm install          # only if node_modules is missing
npm run ingest       # ~7s, refreshes the corpus from live feeds, no API keys needed
npm run dev          # http://localhost:3111
```

The database (`kautilya.db`) is a **rebuildable cache**, not source data — it is
gitignored, and `npm run ingest` reconstructs it. If it is missing or stale, the site
still renders every page and shows a first-run panel telling you to run the ingest.

## State

| | |
|---|---|
| History | linear on `main`, **no remote**; run `git log --oneline` for the count |
| Tests | 348 passing (`npm test`) |
| Build | `npm run build` passes; standalone server verified |
| Corpus at last run | 2,874 events; mixed person graph 124 nodes / 535 edges |
| Person roster | 120 officials across 38 states; 63 currently appear in the corpus |
| Feeds | 25 direct + 3 video + 48 aggregator queries = 73, all health-checked |

There is one real account in the local database (the one created while testing the
signup flow). It is only in this local file.

## What is done

The full product: multilingual ingestion, the Chinese glossary and PRC escalation-ladder
detector, corroboration scoring with per-signal evidence, six-vector country risk and
dyad tension, all ten pages, accounts with a 5-action free quota, Stripe behind env keys
with a working mock mode, CSV/JSON export, watchlists, ladder alerts, imagery and
click-to-play video, the network of states with its eight structural measures, the person
layer over that same graph (120 officials, all eight measures, person↔person edges carrying
the states they came from), and the optional LLM framing layer.

Watchlists follow a signed-in account across machines and stay in `localStorage` until
someone signs in, because the dashboard promised anonymous readers their pins do not leave
the device; signing in is the moment that promise is renegotiated, and the device list is
merged into the account once. Ladder alerts mail a Desk Pro reader who has opted in when a
watched file moves *up* the PRC ladder — built and tested, though see the unverified list
above for what that does not yet include.

Corpus freshness is bounded at both ends as of 2026-08-30: aggregator queries ask for the
last seven days (`QUERY_WINDOW_DAYS`) and stored articles are dropped after ninety
(`CORPUS_RETENTION_DAYS`, pinned to `TREND_SERIES_DAYS` so retention cannot starve the dyad
trend chart). `npm run stats` now leads with corpus age — a rising median there is that bug
coming back.

Design rationale is in `docs/specs/2026-08-29-kautilya-design.md`; the scoring weights and
every known limitation are on `/methodology` in the running app and in `README.md`.

The network graph merged to `main` on 2026-09-05 after an eight-task build and a
whole-branch review. Its own spec is `docs/specs/2026-09-03-network-graph-design.md` and
the full build ledger — every ruling, every deferred minor and how each was triaged — is in
`.superpowers/sdd/2026-09-03-network-graph/progress.md`, which is gitignored and therefore
the one record that exists nowhere else. Read it before touching `lib/graph/`.

**Decided 2026-09-05: the network view is priced per walk.** `consume('network_graph', …)`
keys on `trail[0]`, the state a walk began from, so following a thread out from CHN costs
one credit however far it runs and starting fresh from IND later costs another. It was
briefly keyed on a constant, which gave every reader all 68 states for a single credit.
Verified live on one device: CHN 5→4, three hops free, IND 4→3, its hop free. Two
properties worth knowing — a walk past 24 hops rolls off the trail cap and re-charges under
a new origin, and anyone appending `?trail=CHN` by hand rides a paid walk for free. Both are
deliberate and both are stated on `/methodology`, in the same breath as the existing
admission that device metering is trivially cleared.

**The eigenvector question review left open is CLOSED**, and this document described it as
open for longer than it was. Power iteration cannot converge on a bipartite component —
the spectrum is symmetric, so there is no dominant eigenvalue and iteration 100 and 101
disagree by parity. It is fixed by averaging the last two iterates, which cancels the
-lambda term exactly; the reasoning is on the code at `lib/graph/metrics.ts:204`. The
spectral shift this file used to propose was never needed. It stopped being a latent
issue when the person layer arrived: a mixed graph is far more nearly bipartite than the
68-node state graph, so the fix was a prerequisite for that work rather than a tidy-up.

## Three things that are NOT verified — read before relying on them

1. **Alert mail has never been delivered.** The transport moved to SMTP on 2026-09-03 and
   the pipeline is covered by tests against an injected transport, but `SMTP_PASS` is still
   empty, so nothing has left the machine. The rendering half *was* checked against a real
   corpus event; delivery was not. One missing value stands between this and proven — see
   "Where to go next".
2. **The Dockerfile has never been built.** Docker was not installed. The standalone Node
   path in `README.md` *was* tested end to end and works.
3. **No penetration test, and no screen reader has actually been run.** Accessibility
   passes on 2026-09-07 and 2026-09-08 audited the structure and fixed what they found, but
   drove the accessibility TREE, not VoiceOver or NVDA. Those are not the same exercise: the
   tree says a link has a name, and only a real screen reader tells you the name is read at
   the wrong moment, or that the live region interrupts, or that the graph is exhausting to
   tab through. Treat the a11y work as structural, not as validated with assistive tech.

## History was scrubbed on 2026-09-02

The SQLite WAL and SHM sidecars were tracked before `.gitignore` covered them, and the
blob in three of those commits held two bcrypt password hashes and two email addresses.
Nothing was ever exposed — this repo has no remote and has never been pushed, and the copy
published in the AI_apps monorepo has always been source-only for exactly this reason.

It is gone now. `git filter-branch` removed `kautilya.db`, `-wal` and `-shm` from every
commit, `refs/original` was deleted and the objects garbage-collected. Verified rather than
assumed: no database object is reachable from any ref, and a scan of *every* remaining blob
in the repository finds no bcrypt hash at all. HEAD's tree hash is unchanged, so no working
content moved — only the history around it. `.git` went from roughly 13 MB to 400 KB.

Every commit hash before 2026-09-02 therefore differs from what earlier notes and commit
messages refer to. The published monorepo is unaffected, because it never carried this
history.

## Person-to-person edges (2026-09-06)

The person graph is **mixed**, not bipartite: person↔person and person↔country, never
country↔country.

**Measured 2026-09-06 against a 2,874-event corpus:** 124 nodes, 535 edges, 74 of them
person↔person, 1,824 triangles, 132 events naming two or more listed officials, 74 distinct
pairs, Doval–Wang Yi at 29. Two measurements taken twenty minutes apart during this build
returned 527/73/128 and then 535/74/132 — **these figures drift with every ingest, and none of
them is a property of the code.** Re-measure before quoting any of them; the scratch script
that produces them builds `personGraph(allEvents(5000))` and counts.

**Why it exists is more important than what it does.** The 2026-09-05 spec ruled
person↔person out as unsupported — "~1% of articles, a dozen edges, an anecdote". That was
measured against a **twelve-name** roster, before the roster existed, and never redone when it
reached 120. *A measurement is scoped to the inputs it was taken with, and nothing in the
repository knows when one has gone stale underneath it.* Three documents said the wrong thing
for a day because of it.

Two consequences worth knowing:

- **Entanglement and conflict clusters are back**, and the eight person rows now match the
  country panel's order. They were dropped *because* a bipartite graph has no triangles; the
  mixed one has 1,737, so a test pins the triangle count and their return rests on a checked
  fact rather than on reasoning in a commit message.
- **Edges carry the states they came from**, accumulated over every contributing event rather
  than read off `topEvents`, which is capped at eight. Three shown, remainder counted.

**What the corpus still cannot support is the ACTION on an edge**, and that no is firmer than
the edge count ever was. *"Zelensky warns airlines Russian skies not safe"* pairs Putin and
Zelensky, who did not interact; the verb's object is a third party. That example is on
`/methodology` verbatim because it demonstrates the limit better than asserting it does.

**Node type is distinguished by SHAPE, never colour** — people are rounded rectangles, states
circles. Verified in the running page: no node fill or stroke is a literal hue, and a
non-focus person and a non-focus state have byte-identical strokes, so colour carries no type
information for the palette control to destroy.

One defect this work exposed and fixed, worth remembering as a *class*: `parseTrail`
uppercases every trail token and roster ids are lowercase, so the walk breadcrumb printed
`AJIT-DOVAL` and linked it to `/network/AJIT-DOVAL`, a verified 404. It was latent while the
graph was bipartite — no walk could pass through two people — and went live the instant it was
mixed. `trailNode` in `lib/graph/ego.ts` fixes it, beside `nodeHref` and `nodeLabel` which fix
the same two defects for graph nodes. **Making a node kind reachable turns every
lowercase/uppercase and route assumption about it into a live bug at once.**

A person node is drawn as a **rounded rectangle sized to its label**, which the layout knows
nothing about — it reserves at most `2 * MAX_R` for a node. `personBox` in `lib/graph/ego.ts`
carries all three guards that follow from that, and the reasons are on it: the width is capped
and the name ellipsised past it, the centre is clamped so a box cannot leave the canvas, and a
**minimum aspect ratio** keeps it from degenerating into a circle. That last one is the
constraint, not a nicety: the box uses `rx = r`, so at `w = 2r` it is geometrically identical
to a state node, and shape is the only channel carrying node type.

**Two things this build got wrong before catching them**, both worth carrying:

- **A verification that samples only the easy case proves nothing.** A DOM check "proved"
  shape distinguished the node kinds — by measuring Wang Yi, a long name. Long names were
  never the failing case; `Doval` was rendering as a 52×52 circle at the time.
- **A test passed against its own mutant twice**, both times because the fixture's right and
  wrong answers coincided. Once the states were fed in an order that already matched their
  frequency; once a duplicate merely *tied* the count and the alphabetical tie-break returned
  the right answer anyway. Run the mutant, and check what it would actually return.

**Left undone deliberately:** nothing from this work. Both walk pages now share one
`isKnownNode` predicate, so a mixed walk keeps its full history on either side — carrying that
predicate separately in each page is what let them disagree in the first place.

## Colour is a reader choice (2026-09-06)

Every graph, chart and map reads CSS custom properties, so a `data-palette` attribute on
`<html>` re-colours all of them at once and no drawing component knows the control exists.
Three palettes, chosen from the footer, stored per device: default, colour-blind safe,
monochrome. The alternates encode severity in **luminance** rather than hue — 4.5:1 contrast
plus monotonic luminance leaves pale sRGB with no chroma to separate hues by, and luminance
is the channel that survives every colour-vision deficiency, greyscale and print.

The **default** ramp was re-stepped at the same time, and that was a correctness fix rather
than a preference: measured with the dataviz validator, `high` #ef5350 and `severe` #f2645f
were 3.2 dE apart in NORMAL vision against a floor of 15, so the two most serious bands this
product reports were one colour for every reader. Now 13.1 at the worst adjacent pair. It
stops short of 15 deliberately — green-yellow-orange-red is a narrow hue arc and pushing
further means abandoning the traffic-light convention, which is what the opt-in palettes are
for.

**Never hard-code a colour in a graph.** It becomes the one mark on the page that ignores the
reader's accessibility choice.

## The roster audit, and what a review date can honestly claim (2026-09-07)

`npm run roster:audit` prints every entry beside the headlines that name them. It exists
because re-checking roles was the one maintenance job with no tooling at all, done by
reading sixty-odd entries by eye, and that is how it stayed wrong.

**It found Anil Chauhan listed as the serving Chief of Defence Staff while five of his seven
headlines called him "Ex-CDS" or "Former CDS"** — English and Hindi, three outlets, two days.
He is now labelled the former CDS, and the serving seat is left UNLISTED because no source in
the window names a successor. Richard Marles became "Deputy PM and Defence Minister", the
only hat the corpus actually gives him.

Chauhan is worth understanding, because he breaks the rule the last review established. The
comfortable assumption was that a stale entry goes quiet — an official who leaves office
stops being written about — which made silence the signal to hunt for. **Chauhan was the
seventh most-covered person on the roster.** He left the job and the press kept quoting him
*as a former officeholder*, which is what a well-regarded soldier does after retiring. So a
stale label can sit on the loudest node on the page, and coverage volume is not evidence of
currency.

The part a machine can do is bind the word to the page: the detector flags any headline
containing former / ex- / पूर्व / 前+office beside someone this file calls serving. It cannot
tell WHO the word attaches to, so it flags Lula next to "former Brazil military chief". The
ratio is the signal — 5 of 7 is a finding, 1 of 1 is a sentence to read — and it never edits.

The other thing this pass established is a limit on `ROSTER_REVIEWED`, which /methodology and
/person both print to readers as a currency claim. **The corpus names 63 of the 120 people
here; for the other 57 a review returns nothing, and silence is not confirmation.** Their
labels rest on whichever earlier review last had evidence. That is a property of a narrow
corpus rather than a defect — the feeds cover India-China, the South China Sea and the Gulf,
so Singapore's foreign minister may never be named however long it runs. Verifying those
means leaving the corpus, which is a looser standard than the rest of this product holds, so
the date is documented as uneven rather than implied to be uniform. `data/people.ts` carries
the same note at the constant itself.

## The accessibility pass (2026-09-07)

Five commits. Structural, and audited against the accessibility tree in a real browser
rather than by reading source — which is how each of these was found, and how one of my own
fixes was caught being wrong.

- **A skip link.** Every page opens with the wordmark, nine navigation links and a search
  box, and a keyboard user walked all of them on every page (WCAG 2.4.1). `<main>` needed
  `tabIndex={-1}` or focus stays in the navigation you just skipped.
- **The page says it updated itself.** `LivePulse` calls `router.refresh()` and swaps the
  content underneath the reader; that file's own note says a page rewriting itself silently
  "hides the thing an analyst most needs to know", and it was solved only for people who
  could watch the dot (WCAG 4.1.3). The announcement is a separate element because the dot
  is `display:none` below 640px, and hiding it for want of header room should not decide
  whether the page tells you it changed.
- **Charts describe their data.** "trend", "risk vectors", "90-day tension" named the frame
  and withheld the picture. `WorldMap.describeMap` was already the pattern to copy.
- **Graph nodes have names.** The ego walk is real links, so it always worked with a
  keyboard — but with no name set, the accessible name fell back to the SVG text children,
  giving links called "CHN68". The `<title>` inside each node is a tooltip and does not name
  a link, which is what made this look handled.
- **`/person` had no h1.** It opened with `SectionTitle`, an h2. Swept all ten pages rather
  than fixing the one that was noticed; the rest were already correct.

**Two patterns worth carrying, because both cost time here.**

*A drawing constraint must not reach the one channel that has no drawing.* The Radar's
accessible name was built from labels the caller had clipped to four characters to fit the
spokes, so a reader heard "Mili 76"; the graph said "CHN" for the same reason. Both are the
same bug. The clip belongs in the component — the caller supplies meaning, the component
decides how to fit it.

*A grep for `aria-` measures the wrong thing.* It rated `NetworkMetrics`, `LadderGauge` and
`ConfidenceMeter` as having zero accessibility work, when all three are the best examples in
the codebase: they carry the information as real text, `<dl>/<dt>/<dd>` and `sr-only` pinyin
tagged `lang="zh-Latn"`. Needing no ARIA is the goal, not the absence of effort.

**Not yet audited:** `Paywall`, `VideoWall`, the `/ask` flow beyond its heading, focus
management on the palette control, and measured colour contrast across the three palettes.

**One trap for anyone verifying here: do not run `npm run build` while `next dev` is
running.** They share `.next`, and the build leaves the dev server throwing
`MODULE_NOT_FOUND` on chunks until it is restarted. It cost a false "the build is broken"
and a false 500 on `/network/IND` in one session. Restart the dev server after any build.

## Finishing the accessibility pass (2026-09-08)

The five things 0.5.1 left unaudited. Two were clean, three were not.

**The two alternate palettes were re-stepped, and the reason is the metric rather than the
colours.** Both were spaced evenly in WCAG relative luminance — about 0.17 a step, which
`tests/security.test.ts` measured and passed. Relative luminance is LINEAR and perceived
lightness is roughly its cube root, so the same 0.17 step bought 0.109 of perceptual
lightness at the dark end and 0.060 at the pale end. Separation shrank as severity ROSE,
and the narrowest pair on the ramp was `high` against `severe` — the same failure the
default ramp was re-stepped to fix in 0.5.0, reproduced in the two palettes whose entire
job is to carry severity in luminance. Respaced evenly in OKLCH L with the endpoints held
(`low` is pinned by the 4.5:1 floor, `severe` by white): worst adjacent pair 0.060 -> 0.084
accessible, 0.063 -> 0.085 monochrome, and the worst adjacent pair under deuteranopia goes
5.9 -> 8.3 dE and 6.3 -> 8.5, clearing the 8.0 target both previously failed. No hue moved;
contrast is unchanged at the ends and higher in the middle. The test now pins perceptual
lightness alongside the linear check — **the old palette passes every other assertion in
that file, which is exactly why this survived.**

**Focus was being dropped on the floor in two places, both verified in the running page
rather than reasoned about.** Activating a video's Play button unmounted the button that
held focus, so focus fell to `<body>` and a keyboard user was returned to the top of the
document; it now moves to the player's iframe. Asking a question on `/ask` is a client-side
`router.push`, so the browser does none of what it does on a real navigation — the URL and
the `<h1>` both changed to the question while `document.activeElement` stayed `<body>`, with
nothing said. Focus now moves to the heading. That is deliberately NOT the live region
LivePulse uses: LivePulse rewrites the page under a reader who did not ask, so it must speak
without stealing focus; here the reader asked, so the repair is to take them to it.

**`/person/[id]` and `/network/[iso]` had no `<h1>` at all.** The 0.5.1 pass swept "all ten
pages" — there are SIXTEEN route files, and the six it never counted included these two,
which open with `SectionTitle`. The list pages were fixed while the detail pages reached by
clicking anything on those lists were not. Both also return early for a reader over quota,
which is a second document that needed its own heading; verified by exhausting the free
five with a shared cookie jar and confirming the paywalled page renders `h1` then the
Paywall's `h2`. `SectionTitle` took a `level` prop rather than changing size — heading level
is not font size. A source-walking test now enumerates the routes from disk, because
counting them by hand is the thing that failed.

**Clean, and worth recording so nobody re-audits them:** `Paywall` passes contrast
comfortably (10.13:1 on the primary button, 5.06:1 on the smallest text) and sits under a
real `h1` on every page that renders it. `PaletteSelect` resolves its accessible name
correctly from the `sr-only` span, with the visible "Colours" label `aria-hidden` so it does
not double up. I also chased a focus-outline bug that **does not exist**: `focus:outline-none`
on the ask input is specificity (0,2,0) against `:focus-visible`'s (0,1,0), but Tailwind's
utilities sit in `@layer utilities` and unlayered styles beat layered ones whatever the
specificity. Measured in the browser: `outlineStyle: solid`, 2px, accent. The cascade-layer
rule is what makes the approach in `globals.css` sound, not the specificity.

**Still not audited:** measured contrast of the non-severity chrome across the three
palettes, and `/ask`'s answer panel beyond its heading and focus behaviour.

## Where to go next, in the order I would do it

0. **Done 2026-09-06 — `docs/plans/2026-09-06-person-to-person.md` is executed and merged**
   to `main` at cc09176, after a whole-branch review. 339 tests. See "Person-to-person
   edges" below.



1. **Legal review before charging anyone.** Publisher and aggregator terms of service
   govern commercial redistribution of this material, and the CC-CEDICT dictionary carries
   a CC BY-SA 4.0 obligation. This matters more now that Desk Pro has features attached to
   it.
2. **Send one real alert email.** The pipeline is built and tested but has still never put
   a message in an inbox. Delivery moved from Resend to SMTP on 2026-09-03: Resend sends
   only from a domain verified in its dashboard, and a personal address can never be one,
   so the transport was the blocker rather than anything in the pipeline.

   `.env.local` is configured and **only `SMTP_PASS` is missing** — host, port, user, sender
   and origin are all set there already. Read them from that file rather than from here: this
   document is published to a public repository, so it names no mailbox and no provider.

   The one thing worth recording, because it cost time to work out: the sending domain's MX
   records do **not** point at Google, so the password is the mailbox's own, set in the
   hosting control panel. There is no App Password to generate — that is a Gmail concept and
   this is not Gmail. Set `KAUTILYA_ORIGIN` too if the links in the mail should resolve
   anywhere but this machine. Then:

   ```bash
   npm run alerts:check -- --to=you@example.com
   ```

   Until that lands in an inbox the delivery half is unproven in exactly the way the LLM
   layer was.

3. **Full article text — now needed only for the ACTION on an edge, not for the edge.**
   ~~Person-to-person is impossible.~~ That ruling was wrong and is corrected above: the
   edges shipped 2026-09-06. What full text would buy is the *verb* — "X met Y" rather than
   "X and Y were named together" — and that limit is firmer than the edge count ever was,
   because a headline naming two figures usually points its verb at a third party. Lifting
   it means fetching and storing publisher article text, a new ingest capability that runs
   straight into the redistribution review at item 1 above. Do that first or not at all;
   nothing in `lib/graph/` needs to change.

   The roster was extended from 13 to **120 officials across 38 states** on 2026-09-06, so
   that cheap win is spent. Coverage rose from 10.5% of articles to 14.5%; 60 of the 124
   appear in the current window and the rest are there for when their states surface. Only
   Afghanistan and Nepal now have a single official, and in both the single entry is the
   one that matters.

   What remains is **re-checking the roles, where the judgement cannot be automated but the
   looking now is** — `npm run roster:audit`, added 2026-09-07, and see the section above for
   what it found and what it cannot see. Roles were correct to the best of the author's
   knowledge on the review date in `data/people.ts` and go stale as cabinets change. The
   failure is silent: a departed minister still appears in archived reporting, so the node
   stays real while the label on the page becomes false.

   Japan, Nepal and Bangladesh were corrected on 2026-09-06, and the method is the point:
   the corpus, not recall, is the source. Searching it for `日本首相` named 高市早苗 as prime minister and a
   Yonhap item named Shinjiro Koizumi as defence minister, so both were fixed; the foreign
   minister is deliberately left UNLISTED because no source in the window names one, and a
   guess there would be the exact failure this roster must not have. Note what the stale
   entries had been costing — Ishiba, Iwaya and Nakatani matched zero articles between them,
   because officials who have left office stop being written about. Staleness does not just
   mislabel a node, it silently empties it — a reader sees an official with no connections
   and reads that as "not involved".

   Nepal went the same way: Sushila Karki's caretaker government is gone and reporting names
   Balendra "Balen" Shah, who matches five articles including two in Hindi where Karki
   matched none. **Bangladesh is now deliberately unlisted.** Its interim administration was
   explicitly temporary and neither Yunus nor Touhid Hossain is named once across the 26
   Bangladesh articles in the window; one of those describes Sheikh Hasina pledging a
   homecoming, so she is not in office either, and nothing names a successor. Listing nobody
   there costs no coverage — a stale entry matches nothing anyway — and removes a false
   label. Restore Bangladesh when a source names its government.

   The rule these three share: **correct from evidence or leave the seat empty; never
   substitute one guess for another.** Japan's foreign minister is unlisted for the same
   reason. After ANY edit here run `npm run backfill:people`, or stored rows
   will never see the change.

## Added 2026-08-30, after the freshness work

- **Pinyin and English under every Chinese headline.** Romanisation is deterministic;
  English resolves best-available — LLM sentence translation, then a CC-CEDICT word gloss,
  then the curated lexicon. The gloss is labelled `Glossed:` because it has no grammar and
  is not a translation. CC-CEDICT is CC BY-SA 4.0; attribution is on `/methodology` and
  belongs in the legal review before charging anyone.
- **`/ask`.** Questions answered from the corpus deterministically, with the reading of the
  question shown alongside the answer. Signals that are facts (states, time, language,
  ladder rung) filter hard; `domain` only narrows when that leaves something, because it is
  a guess that defaults to `Diplomatic` for most of the corpus.
- **Live tracking.** Open pages poll `/api/pulse` and re-render in place. The background
  ingest loop is off unless `KAUTILYA_AUTO_INGEST=1`, defaults to 30 minutes, and has a
  15-minute floor that cannot be overridden — every cycle hits 73 real publisher feeds.

Two things left on the bench, both raised and not yet done:

Done 2026-09-02: **the touch gap is closed.** The dense one-line rows put their
romanisation in the document rather than only in a `title`, visible below 640px and
screen-reader-only above it, where the tooltip does the visible work. That repairs an
accessibility gap at the same time — `title` is unreliable for assistive technology and
unreachable by keyboard, so the text is now announced on every viewport. The ladder gauge
is the exception: its label is an overlay on a 16px bar where a second line would break the
geometry, and it already shows the English, so there the romanisation is announced but not
drawn.

Done 2026-09-02: **the Chinese typeface is bundled.** Noto Sans SC is self-hosted through
`next/font`, so rendering no longer depends on the reader's OS and nothing is requested
from Google at runtime. It is not free — measured at ~619 KB on the methodology page and
~1.4 MB on a page dense with Chinese, cached after the first visit. Two weights ship
because Chinese headings render semibold; dropping to one halves the payload at the cost
of synthetic bold, which CJK tolerates badly. `npm run fonts` reports what is bundled and
runs on postinstall, guarded with `|| true` so a production install without `tsx` cannot
fail on it.

## Clustering — solved 2026-09-02, and how to keep it solved

The corroboration story that ran through August ended here. Recap, because the shape of it
matters more than the fix.

**What was wrong.** Union-find merged clusters on a single related pair, so A-B and B-C put
A and C in one event regardless. That is survivable in a small corpus. On 2026-09-02, with
the corpus grown to 3,336 articles, it produced one event holding 393 articles — 11.8% of
all reporting, spanning 41 of 65 tracked states, scored confidence 71 and feeding inflated
escalation into all 41 countries' risk vectors. Nothing had regressed; the similarity graph
had crossed its percolation threshold.

**Why no threshold fixed it.** Two attempts in August both failed and are kept in
`docs/experiments/2026-08-30-domain-gate-failed.patch`. An algorithm with no notion of
belonging to a group cannot be tuned into having one.

**The fix.** Membership is decided against the cluster, not against a member: a report
joins where it matches at least `COHESION` of an evenly-spread sample, so joining gets
harder as a cluster grows. A second pass merges clusters on average linkage across sampled
cross pairs, because assignment alone cannot reunite a story that seeded twice — without
it the Nepal flood came apart into twenty events.

Largest event went 393 articles / 41 actors to 57 / 4, and it reads as one story. Multi-
article events 14% to 20%. 3,336 articles cluster in 270ms.

**If you touch this, measure both directions.** Blobbing and fragmentation are opposite
failures and a metric moving is not evidence: in August the mean articles/event *improved*
to 2.02 while the output collapsed into a 601-item blob. Run
`npx tsx scripts/cluster-gates.ts` for what each gate costs and `scripts/cluster-shape.ts` for
what came out, **read the members of the largest cluster**, then check that a known-large
real story has not shattered.
`tests/cohesion.test.ts` holds both failure modes as regressions.

One known property, deliberate rather than residual: a very large story divides by angle
rather than staying in one event — the flood splits the dead and missing from foreign
nationals and relief. Each piece is separately corroborated, which is more useful than one
undifferentiated cluster.