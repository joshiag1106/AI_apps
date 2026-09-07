# Where this project stands

**Last worked: 2026-09-06.** Everything below was verified, not assumed. Where something
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
| Tests | 339 passing (`npm test`) |
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

One thing review left open, needing a decision rather than a fix:

1. **Eigenvector centrality can oscillate rather than converge.** Power iteration with a
   fixed 100 iterations has no convergence check, so on a bipartite component it returns a
   parity-dependent answer — on a star beside a triangle, iteration 100 and iteration 101
   give different vectors and neither is the true one. It is **not live**: the real 68-node
   graph was verified fully converged (|100 vs 101| = 2.2e-16, |100 vs 2000| = 0), because
   547 edges is far from bipartite. The standard fix is a spectral shift, which would move
   every Contagion exposure rank on the site — too large a change to make on a latent
   issue without deciding to.

## Three things that are NOT verified — read before relying on them

1. **Alert mail has never been delivered.** The transport moved to SMTP on 2026-09-03 and
   the pipeline is covered by tests against an injected transport, but `SMTP_PASS` is still
   empty, so nothing has left the machine. The rendering half *was* checked against a real
   corpus event; delivery was not. One missing value stands between this and proven — see
   "Where to go next".
2. **The Dockerfile has never been built.** Docker was not installed. The standalone Node
   path in `README.md` *was* tested end to end and works.
3. **No penetration test and no screen-reader pass.** The security and contrast work was
   audited and is covered by tests, but neither of those two exercises was done.

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

   What remains is **re-checking the roles, which nothing can automate**. They were correct
   to the best of the author's knowledge on the review date in `data/people.ts` and go stale
   as cabinets change. The failure is silent: a departed minister still appears in archived
   reporting, so the node stays real while the label on the page becomes false.

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