# Where this project stands

**Last worked: 2026-09-10.** Everything below was verified, not assumed. Where something
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
| History | linear on `main`; backed up to the **private** repo `joshiag1106/GeoIntel` since 2026-09-10 |
| Tests | 381 passing (`npm test`) |
| Build | `npm run build` passes; standalone server verified |
| Corpus at last run | 6,348 articles, 3,485 events; drifts with every ingest, so re-measure |
| Person roster | 122 officials across 39 states; 77 named, 45 silent, 23 seats corpus-confirmed |
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
Nothing was ever exposed. At the time this repo had no remote and had never been pushed, and
the copy published in the AI_apps monorepo has always been source-only for exactly this reason.
**The history now DOES have a remote — see below — and that was only safe because the scrub was
re-verified before pushing.**

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
here; for the other 57 a review returns nothing, and silence is not confirmation.** (71 and
49 when re-measured on 2026-09-09 — the figures move with the corpus, so read them beside
their date.) Their labels rest on whichever earlier review last had evidence. That is a
property of a narrow corpus rather than a defect — the feeds cover India-China, the South
China Sea and the Gulf,
so Singapore's foreign minister may never be named however long it runs. Verifying those
means leaving the corpus, which is a looser standard than the rest of this product holds, so
the date is documented as uneven rather than implied to be uniform. `data/people.ts` carries
the same note at the constant itself.

## The second way a role goes stale (2026-09-09)

A roster pass on 2026-09-09 found **Min Aung Hlaing labelled "Commander-in-Chief" when the
corpus calls him Myanmar's President.** The Diplomat's snippet settles it in seven words —
"the general-turned-president since his inauguration in April" — and both Vietnam items
describe a *state* visit, which is a head-of-state act.

**The audit's detector could not have caught this, and the reason generalises.** Chauhan's
label was stale because the seat was VACATED, and English and Hindi both mark that on the
name: Ex-CDS, पूर्व CDS. A word to grep for. Min Aung Hlaing's was stale because the seat was
SUPERSEDED — he did not stop being someone, he became someone else — and no language marks
that at all. The headline just says "Myanmar President" as though it always had.

So the flag covers one of the two ways a role dies, and the other is only visible by reading
the label beside the headlines. That is the part of `roster:audit` that cannot be automated,
and this is the second consecutive pass where the finding came from the unautomated half.

Also checked, because 49 silent names look exactly like a broken alias list: **where an
entry's aliases cover the scripts it could appear in, the silence is real absence.** Checked
by going around the matcher rather than through it — searching every stored title, snippet and
translated title as raw text. Erdogan appears ZERO times across 5,868 articles while
"Turkey" appears 12; "bin Salman" zero while "Saudi" appears 109. Outlets name the state and
leave the official out. Both examples still hold: each carries an Arabic alias, and neither is
written in Devanagari anywhere in the corpus.

**"Nothing is missing from the aliases" was too strong, and a later pass the same day
disproved it.** Anura Kumara Dissanayake was listed silent while a Hindi headline called him
राष्ट्रपति दिसानायके beside Rajnath Singh. His aliases were Latin-only, so the matcher never
saw him — and the raw-text check could not have caught it either, because it searched the
LATIN form. `title_en` exists only for Chinese (867 of 1,509), so the 733 hi/ar/ja/ru articles
carry no Latin rendering of their headlines for either the matcher or the check to read. **A
Latin-only alias is invisible in precisely the articles that most need it.** Dissanayake
surfaced only because his mention happened to sit in an article the audit printed under
someone else.

**All 21 Latin-only silent entries have now been swept** (2026-09-09), by reading the
non-Latin coverage of each one's home state rather than searching for a romanisation nobody
had. It found a SECOND hidden mention — **Theresa Lazaro**, written 拉扎罗 in
王毅晤菲律宾外长拉扎罗 — and no evidence for the other 19, whose office-word hits were
consistently about other people (China's MFA answering a question, Russia's foreign minister,
Macron, PM Carney). Treat those 19 as consistent with genuine absence but not proven: the
sweep only surfaces articles carrying an office word, so a bare-name mention would still hide.

**That sweep also found the pass's most consequential error, in an entry that was not silent
at all.** Keir Starmer was listed as UK Prime Minister; the corpus puts **Andy Burnham** in the
office across 8 articles and two languages ("the first EU leader to meet new Prime Minister
Andy Burnham in Downing Street", 会见英国新首相伯纳姆). Starmer had 2 articles, neither calling
him PM. So this was SUPERSEDED, invisible to the FORMER/DISMISSED flags, and invisible to
coverage volume as well — the Chauhan lesson in a new shape. Burnham now matches 10 articles,
which would have made him one of the roster's better-covered figures the whole time he was
missing. Starmer is unlisted; no source says what office he now holds.

**Left flagged and deliberately unchanged: Vietnam.** One Chinese story (stored twice) reads
越南政府总理黎明兴, which would make Pham Minh Chinh's seat stale. One outlet, one story, and
the corpus gives only the characters — romanising them would be the guess this file forbids.
`data/people.ts` carries the evidence so the next pass starts from it.

One more worth recording as method rather than finding. I doubted Nepal's entry — Balen Shah
listed as Prime Minister — because I remembered him as mayor of Kathmandu. Two English
headlines call him "Nepal PM Balen" and "PM Balen's government", so the roster was right and
the recollection was wrong. **The rule caught its author rather than the file**, which is
the strongest evidence yet for correcting from the corpus and never from memory.

## The audit was reading less than the matcher (2026-09-09)

**Zhang Youxia was listed as CMC Vice Chairman while VOA reported him 被正式免职 — "formally
relieved of office" — twice**, on 2026-08-31 and 2026-09-01, both times paired with Liu Zhenli
amid a Rocket Force purge. He is now the FORMER vice chairman and the serving seat is unlisted.

I had looked straight at him earlier the same day and cleared him, on the grounds that
张又侠案 ("the Zhang Youxia case") in one dissident aggregator's headline was speculation. It
was — but it was not the evidence. **The evidence was in two VOA snippets, and the audit does
not read snippets.** `backfill-people.ts` matches names over `title + snippet`; the audit
selected `title, title_en` only. So a person matched through a snippet is listed as NAMED
beside headlines that do not contain their name, and anything the snippet says about them is
invisible to the reviewer and to the detector both. **A tool that shows you less than it
matched on will let you certify what it hid.**

The vocabulary was the second gap. FORMER looks for a retitling — Ex-CDS, पूर्व CDS — because
that is what an outlet does to someone who left office and is still quoted. It has no word for
a removal, and **a Chinese official is not retitled, he is removed**: 免职, 落马, 解职, 双开.
DISMISSED is now a separate marker, kept separate because the two say different things — FORMER
says the corpus disagrees with the label, DISMISSED says the person may hold no office at all.

**Fixing it cost a precision regression that had to be fixed too, and that is the part worth
remembering.** Reading snippets took CONTRADICTED from one entry to eight, all false — "the
ex-communist east", "the former British empire", "former reality television star". A title is
one clause, so proximity is implicit and never had to be stated; a snippet is a paragraph
naming several people, and one 免职 about a general marked Xi, Trump and the US Treasury
Secretary off a single VOA digest. **Widening what a detector reads silently invalidates the
assumption that made it precise.** `marksPerson` now requires the marker within 32 characters
of one of that person's own aliases, which returns the noise to zero and still flags Zhang
Youxia at 2 of 3 — verified by restoring the wrong label and confirming the tool catches what
it missed, rather than assuming the fix worked.

Bare English "dismissed" came out of the vocabulary entirely: in news copy it means *rejected*
far more often than *removed*, and it was matching "Putin has dismissed rumors" and "Netanyahu
has dismissed accusations".

Three of the four new tests pin a mutant that a first attempt did NOT catch. The obvious
fixture is the real VOA sentence, which contains 免职 **and** 落马 — so deleting either from
the pattern left the test green, the same coincidence that let two earlier tests in this repo
pass against their own mutants. Each marker now has a fixture that can match by no other route.

## Auditing the silent half found a dead matcher (2026-09-09)

The roster's silent half — entries no article names — had never been examined, because
STATE.md's own position was that checking them means leaving the corpus. Examining them from
INSIDE it turned out to be worth doing, though not for the reason expected.

**First, the negative result, which stands.** Ranking the silent entries by how much the corpus
covers their state looked promising and was measuring the wrong thing. `actors` tags a state
when it is the SETTING, not when its politics are covered: the UAE's 170 articles are Strait of
Hormuz shipping, Saudi Arabia's 116 are Houthi strikes and one about LIV Golf, and Venezuela's
48 are a US oil deal in which Trump is the actor. Of those 170 UAE articles, **zero** name any
Emirati official. So "high coverage, silent official" is not an anomaly at all, and the silence
is explained by structure: the corpus names heads of state whose POLITICS it follows, and names
nobody from states that appear only as places. Two inversions that looked suspicious — Maduro
silent while his own vice-president speaks, Erdogan silent while his foreign minister is named
once — both dissolve the same way. **No roster entry was corrected as a result.**

**Then the real finding, which came out of asking why one silent entry was silent.** Peskov was
listed silent in a corpus containing the headline "Песков ответил на заявление Буданова". The
name is right there. `matches()` in `lib/analyze/entities.ts` tested non-Latin aliases against
the RAW text rather than the lowercased copy:

```ts
if (!LATIN.test(alias)) return haystackRaw.includes(alias);   // before
```

That is identical behaviour for every script with no letter case — Han, Arabic, Devanagari —
and wrong for the one on this roster that has case. **All ten Cyrillic aliases had never matched
anything**, because they are stored lowercase and Russian and Ukrainian capitalise surnames, so
'песков' could only fire on text no outlet publishes. Putin, Lavrov, Zelensky and Zakharova all
appeared to work only because their LATIN aliases were carrying them.

The countries file escaped by an accident of style: its 68 Cyrillic aliases are stored
capitalised, so they matched capitalised text. The same bug, invisible, because the data
happened to be written the other way up.

Fixed by comparing lowercased on both sides — a no-op for the caseless scripts. It stays a
SUBSTRING test, and two opposite languages force that: Han glues a name to its neighbour
(张又侠案 is "the Zhang Youxia case") and Russian declines it (Пескова is the genitive of
Песков). Word boundaries would break both. 16 rows moved, coverage 842 -> 856 articles.

**A real limit found alongside it and deliberately NOT fixed.** On that same headline,
`extractActors` returns `["USA"]` alone: Россией and Украиной are declined, and the country
aliases are nominative, so a Russian article about Russia and Ukraine is tagged with neither.
Person aliases survive declension because surnames decline by suffix and the stem stays a
prefix; country names change their ending, so the alias is not a substring. Fixing it means
stemming Russian, which is a large job for 33 Cyrillic articles — 0.6% of the corpus. Worth
doing only if Russian-language feeds are ever expanded, and worth knowing about before then.

The lesson that outlives the bug: **a branch written for "the scripts that are not Latin"
silently assumed the property that actually mattered was having no word boundaries, when the
property that mattered here was having no case.** Those two sets are not the same set, and
nothing failed loudly when they diverged.

## A third shape of stale role, and a file that reassured its own reader (2026-09-10)

Ingest 73/73, corpus 5,956 -> 6,291. The roster moved to **75 named / 45 silent** from 72/48
without any alias work this pass — last session's Dissanayake, Lazaro and Burnham fixes
carrying names that were always there. Both audit flags fired on known noise and were
re-confirmed as noise, not waved past: Lula sits within 32 characters of "ex-leader", which
is Bolsonaro, and the Xi digest is 习近平军中大清洗再升级 followed by 张又侠、刘振立被正式免职 —
Xi is the one doing the purging. 363 tests throughout.

**The finding was Jared Kushner, captioned "Envoy, Middle East" over 45 articles of which
ZERO mention the Middle East, Gaza or 中东, and 44 are Russia-Ukraine.** Outlets call him a
"US envoy", a "US peace envoy" and 美国总统特使, never a regional one, and name him beside
Witkoff in nearly every one — same shuttle, Moscow then Kyiv. Corrected to `Special Envoy`,
which is the label Witkoff already carried and the only one the corpus licenses. The
qualifier is dropped rather than replaced: nothing in the window says he stopped Middle East
work either, and inventing a new region would be the guess this file forbids.

**This is a THIRD shape of stale role and it is worth separating from the other two.**
Chauhan's seat was VACATED and outlets retitle a vacated seat, so FORMER can see it. Zhang
Youxia's was REMOVED and Chinese outlets print 免职, so DISMISSED can see it. Kushner's OFFICE
was never wrong — the QUALIFIER on it was, and no language marks a portfolio as moved. It
joins Min Aung Hlaing and Starmer/Burnham in the class no flag can reach, which is now three
of the last five findings.

**The pass's other finding was in this project's own documentation, and it is the more
embarrassing one.** `data/people.ts` still told its reader, in the header a reviewer reads
first, "Nothing is missing from the aliases; the reporting genuinely does not name them."
That claim was disproven on 2026-09-09 by Dissanayake and Lazaro. It was retracted **here**
that day and left standing **there** — so the correction reached the narrative document and
never reached the file that actually governs the next pass. Worse than a stale number: it is
the reassurance that made the silent half look settled, sitting directly above the roster it
was wrong about.

Both corrected in place. The header now carries what the sweep actually established — that
the raw-text check searches the LATIN form while `title_en` is populated only for Chinese, so
a Latin-only alias and the check meant to catch it are blind in the same articles, for the
same reason — and that **27 of the 120 entries are still Latin-only** and are consistent with
absence rather than proven absent. The audit's own description was stale too, naming only
FORMER; it now names DISMISSED, says it reads snippets, and states plainly that a clean flag
is not a clean roster, with all three superseded findings as the evidence.

**The lesson, and it generalises past this repo: a correction is not finished when the
document that narrates the work is fixed. It is finished when every artefact that asserts the
false thing is fixed** — and the one most worth checking is whichever a future reader
consults before deciding how hard to look.

**A THIRD hidden mention, and the first one found by a method rather than by hand.** Testing
whether the unautomated half could be automated — extract `<country><office><name>` from the
Chinese coverage and check the name against the roster's holder of that seat — turned up
**Anwar Ibrahim invisible in 马来西亚首相安华** (Deutsche Welle Chinese, 2026-08-20), an article
that names him AND states the office and was matching NOBODY. His only Chinese alias was
安瓦尔; the piece uses 安华 exclusively. Added, backfilled, propagated: 1 row updated, no
collateral, Anwar 2 -> 3 articles.

**It is a different gap from Dissanayake and Lazaro, and that is the part worth keeping.**
Those two were LATIN-ONLY, and the 2026-09-09 sweep was built around exactly that property.
Anwar was not Latin-only. He had an alias in the right script and it was the wrong RENDERING
of it — so a per-entry script-coverage check, which is the obvious next detector and the one
this experiment was testing, would have passed him clean. Transliteration is a choice each
publisher makes, not a property of the language. The exposure is wider than "Latin-only": it
is every transliterated name carrying fewer renderings than its outlets use, and nothing in
the repo can say how many of those exist.

Which also means the header paragraph written earlier THIS SESSION was already too narrow
when it was written. It has been widened in place rather than rewritten, so the sequence
stays legible — the same failure this session set out to fix, caught one step faster.

**The experiment itself is worth repeating and is NOT yet a tool.** The extraction is ten
lines of throwaway Python against `language='zh'` and it is noisy (韩国总统府 is the
presidential OFFICE, not a person; the regex grabs trailing characters). But it re-derived
Burnham unprompted — 英国首相伯纳姆 sits right there in the output — which is the strongest
evidence available that the class of finding the last three passes made by reading is
mechanisable. It found something in two minutes that three careful hand sweeps missed.
Building it properly is the top candidate for the next session; see "Where to go next".

**Vietnam re-checked and deliberately unchanged, as last session asked.** 越南政府总理黎明兴
is still one story from one outlet, stored twice, with no romanisation anywhere. A Kremlin
item does head "Statements by the President of Russia and the President of Vietnam" on the
day To Lam visited Moscow, but it names nobody and carries an empty snippet, so it cannot
settle the seat either way. Still flagged; still not guessed at.

## The seat-holder detector (2026-09-10)

`scripts/roster-seats.ts`, `tests/roster-seats.test.ts`, three new sections in
`npm run roster:audit`. 380 tests, build green. It automates the half of the roster pass that
three consecutive sessions did by hand.

**What it does.** Chinese headline copy writes a seat as one adjacent run —
日本首相高市早苗 — so country, office and name arrive together. The tool resolves
`<country><modifier?><office>` to the seat `data/people.ts` claims and asks whether the
LISTED HOLDER'S OWN ALIAS sits within 32 characters of it. Three verdicts: **confirmed**,
**mismatch** (someone else is named in a seat the roster fills), **unclaimed** (the corpus
fills an office the roster leaves empty).

**It does not parse where the Chinese name ends, and that was the design decision that
mattered.** An early sketch extracted the name and compared it, which truncated
加拿大总理马克[龙] and would need to know every surname length in every language. Asking
instead whether the expected alias is nearby needs no name boundaries at all, and it reuses
`WINDOW` from `marksPerson` rather than inventing a second distance that could drift from it.

**The corpus corrected the design twice, before and after first light.** Before: matching
only adjacent `<country><office>` would have missed 英国**新**首相伯纳姆 and
越南**政府**总理黎明兴 — the two headlines the detector exists for, both carrying a modifier
in the middle. After: the first live run produced 10 mismatches of which 9 were noise, and
the noise was not what the design predicted. 涨薪, 重申, 举行, 任期 are verbs where a name
should be, and **美国总统特使 is a compound office** — a presidential ENVOY — which cannot be
excluded by banning a leading character, because 特 opens 特使 and also opens 特朗普. Word,
not character, is the unit that disambiguates. Every one of those strings is now a test
fixture. Mismatches went 10 -> 1, and the survivor is the genuine Vietnam case.

**It found two dead aliases on its first run, which is the whole argument for it.** Masoud
Pezeshkian carried 佩泽希齐扬 and Abbas Araghchi 阿拉格奇 — **each occurring ZERO times in
6,315 articles** — while outlets print 伊朗总统佩泽什基扬 and 伊朗外长阿拉格齐 and state the
office besides. Both fixed, both now read CONFIRMED, which is the tool checking its own work.

That makes three of this class in one day, after Anwar. **A dead alias is the worst kind of
roster fault**: the entry looks complete, the audit lists the person as silent, and the
silence reads as thin coverage rather than as a typo. Nothing in three careful hand sweeps
caught any of the three; the tool caught two in under a minute.

**What it reports today:** 1 mismatch (Vietnam), 4 unclaimed seats in states the roster
covers, 21 of 120 seats confirmed. The unclaimed four are real gaps worth filling —
菲律宾国防部长特奥多罗 (3 articles, and the article gives the Latin name too), Nepal's
foreign minister under both 外长 and 外交部长, and 朝鲜国防部长努光铁遭解职, which is a
dismissal the roster has no node for at all.

**21 of 120 is the honest ceiling, not a disappointment.** Only 67 states carry Chinese
aliases and the corpus's Chinese coverage concentrates on a dozen of them, so most of the
roster can never be confirmed this way. It is still the first MECHANICAL confirmation this
roster has ever had — every previous review date rested on a human having read a headline
once, which is what the `ROSTER_REVIEWED` comment means when it calls the date uneven.

**Chinese only, deliberately.** The adjacency is a property of Chinese headline grammar.
English has the same construction — "new Prime Minister Andy Burnham" — but "the first EU
leader to meet new Prime Minister Andy Burnham in Downing Street" puts the country nowhere
near the office. Hindi and Arabic name offices as often but not in fixed order. Extending it
is a separate problem and should not have blocked this one.

**The known limit, stated because it is silent.** `NOT_A_NAME_START` and `COMPOUND_OFFICE`
are exclusion lists and will be incomplete. A missing entry produces a false FLAG — a line a
reviewer dismisses in seconds — never a missed finding. Do not widen them with characters
that could open a surname: suppressing a real name is the failure that matters, and unlike a
false flag it says nothing at all.

## Acting on the detector, and the noise class it found by being acted on (2026-09-10)

Two of the four unclaimed seats filled, from the detector's own report.

**Gilberto Teodoro [PHL], Defence Secretary.** Three articles, and one sentence carries both
scripts: 菲律宾国防部长特奥多罗（Gilberto Teodoro）. Labelled 'Defence **Secretary**', not
Minister, because that is the office and because Lazaro above is already 'Foreign Secretary'
— the Philippines uses secretaries and the roster should not translate that away. That meant
extending `SEATS` to map 国防部长 onto the new role string; without it the entry would have
resolved to nothing and the seat would have gone on reading unclaimed.

**Khanal [NPL], Foreign Minister — the two halves of the name rest on different evidence.**
Three English items name him, all surname-only: "Foreign Minister Khanal Compares India, China
Relations to Parents". The Chinese prints a full name, 尼泊尔外交部长希希尔·卡纳尔, but turning
希希尔 into Latin letters would be romanising from characters — the exact move this file refuses
for Vietnam's 黎明兴. So he was listed as "Khanal" alone for several hours: **the rule applied
at the granularity of half a name rather than a whole seat.**

**The given name came from the OPERATOR, later the same day, and is recorded as such.** Josh
supplied "Sishir"; the entry now reads Sishir Khanal and the comment on it says plainly that
the surname is corpus-evidenced and the given name is not. That distinction is worth keeping
rather than smoothing over — a person who knows the brief is a better source than a model
recalling one, but this roster's review date only ever claimed the CORPUS, and a reader who
cannot tell which claims rest on which has lost the thing the date was for. 希希尔 is
consistent with "Sishir", which is a consistency check and not independent confirmation.

**Nothing else in the roster currently rests on an operator-supplied fact.** If that changes,
mark it the same way.

**Adding them immediately exposed a noise class the first live run could not have shown.**
Both new entries were reported as SEAT MISMATCHES against a correct roster within seconds:
尼泊尔外长：尼方无意… and 菲律宾国防部长：奉劝菲方… — the office named, the holder not, and
the run-capture stepping over the colon to read the first two characters of the QUOTE.

The fix is structural rather than another stopword, and that distinction is the point. The
exclusion lists are lexical and will always be incomplete; this one is a rule — **a name
follows the office immediately or not at all**, so a non-Han character in that position ends
the match. `<country><office>：` is a headline convention for attributing a quote and it can
never introduce a name.

**Worth noting how it surfaced: the detector could only find this by being ACTED ON.** With
those seats empty the same sentences classified as `unclaimed`, which is a plausible-looking
verdict, and nothing looked wrong. Filling the seats turned the same input into a visibly
false `mismatch`. A tool whose output you never act on cannot show you its own blind spots.

Mismatches back to 1 (Vietnam, genuine), unclaimed to 1 in a covered state — 朝鲜国防部长努光铁遭解职,
a DPRK defence minister the corpus reports being DISMISSED and the roster has no node for,
which is a seat to leave empty rather than fill. 23 of 122 confirmed. 381 tests.

## Where 2026-09-10 ended

Verified after the final merge, not assumed. Corpus **6,348 articles / 3,485 events**, median
age 9.8 days. Roster **122 entries, 77 named, 45 silent, 23 seats corpus-confirmed**. **381
tests**, build green, 73/73 feeds.

`npm run roster:audit` now ends in a state worth reading as a baseline:

- **CONTRADICTED — 1, known noise.** Lula within 32 characters of "ex-leader", which is
  Bolsonaro. Re-confirmed this pass rather than waved past.
- **DISMISSED — 1, known noise.** The VOA digest reads 习近平军中大清洗再升级 followed by
  张又侠、刘振立被正式免职: Xi is the one doing the purging. The 32-character proximity rule
  cut this class from eight to one and cannot cut it further without parsing the sentence.
- **SEAT MISMATCH — 1, genuine.** Vietnam. 越南政府总理黎明兴, still one story from one outlet
  stored twice, still no romanisation anywhere. Flagged since 2026-09-09 and still not guessed at.
- **UNCLAIMED SEAT — 1 in a covered state.** 朝鲜国防部长努光铁遭解职 — a DPRK defence minister
  the corpus reports being DISMISSED. **Leave this one empty**; adding a node for someone the
  corpus says was just removed would be the mistake Zhang Youxia's entry was made to avoid.

Three merged PRs: #55 (Kushner's portfolio, and the header retraction), #56 (the seat-holder
detector), #57 (Teodoro and Khanal, and the colon fix). AI_apps master at dfb2659, GeoIntel
main linear.

**Four dead or missing Chinese aliases were found in one day** — Anwar 安华, Pezeshkian
佩泽什基扬, Araghchi 阿拉格齐, plus Lazaro 拉扎罗 and Dissanayake राष्ट्रपति दिसानायके the day
before. Two of the four came from the detector's first run, in under a minute, after three
careful hand sweeps had missed them. If one thing from this day is worth carrying forward it
is that **a dead alias is invisible in exactly the way the roster is least equipped to
notice**: the entry looks complete, the person lists as silent, and the silence reads as thin
coverage rather than as a typo.

The next pass should start by running the audit and reading the four sections above. If any
count has moved, the corpus has moved with it.

## The history is backed up now (2026-09-10)

Until today GeoIntel's git history existed on one machine and nowhere else. The AI_apps copy
publishes the SOURCE, not the history, so a disk failure would have taken 125 commits with it —
and the gitignored build ledgers, which are not in the history either.

**`github.com/joshiag1106/GeoIntel`, PRIVATE.** Two branches:

- `main` — the full history, 125 commits, identical to this working copy.
- `ledgers` — an ORPHAN commit holding `.superpowers/sdd/`, the three build ledgers.

**The ledgers are on their own branch for a specific reason, so do not "tidy" them onto main.**
They are gitignored here, and the AI_apps sync enumerates files with `git ls-files`. Force-adding
them to `main` would make them tracked, and the next sync would copy them into a PUBLIC
repository. The orphan branch keeps them backed up while leaving `main`'s tracked set at exactly
151 files. They were committed through a scratch `GIT_INDEX_FILE` so the real index and working
tree were never touched.

**The scrub was re-verified before anything was pushed, not assumed from the 2026-09-02 note.**
Every blob in the repository was scanned: 481 blobs, **zero** bcrypt hashes, **zero** database
objects reachable from any ref. One blob matched a secret-shaped pattern and was inspected —
`scripts/alerts-check.ts` printing `SMTP_PASS=<that mailbox's password>` as a help string, a
placeholder in a file that is already public. `.env.local` is gitignored, has never been
committed, and is in neither branch.

**The backup was restored before being called a backup.** Cloned fresh from the remote:
151/151 tracked files byte-identical to this working copy, 33 ledger files present, and the
network-graph `progress.md` identical. A backup nobody has restored is a claim, not a backup.

Private rather than public deliberately. The source is already public in AI_apps either way,
so publishing the history would buy nothing and would permanently expose every intermediate
commit, including pre-scrub-era commit messages.

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



1. **DONE 2026-09-10 — the seat-holder detector is built and shipped.** See its own section
   above. Left here because the reasoning for building it still explains what it is for.

   ~~Build the seat-holder detector~~, because
   the roster pass now finds something every time and finds it by hand, and on 2026-09-10 a
   ten-line throwaway script found in two minutes a mention three careful hand sweeps had
   missed (Anwar, 安华 — see the section above).

   The idea, and it is narrow on purpose: Chinese headline copy uses a rigid construction,
   `<country><office><name>` — 日本首相高市早苗, 英国首相伯纳姆, 加拿大总理卡尼. Extract those
   triples, resolve `<country><office>` to the seat this roster claims, and compare the name
   to the person listed in it. Three outcomes worth printing: the name matches (confirmation,
   which the roster has never had mechanically), the name is a person on the roster in a
   DIFFERENT seat, or the name matches nobody at all — which is either an alias gap or a
   seat that has changed hands. That last case is exactly Burnham, and the experiment
   re-derived him unprompted.

   Two things to know before starting. It is NOISY as written — 韩国总统府 is the presidential
   OFFICE not a person, 德国总理的中国困 is the regex eating trailing characters, and 加拿大总理马克
   truncates Carney's name — so the name half needs validating against something, and the
   32-character proximity discipline from `marksPerson` is the precedent for how. And it is
   Chinese-only: this construction is a property of Chinese headline grammar. Hindi and Arabic
   name the office too but not in a fixed adjacent order, so treat those as a separate problem
   and do not block the Chinese half on them.

   It does not replace the reading pass; it ranks it. Say so on `/methodology` if it ever
   surfaces to readers.

2. **Legal review before charging anyone.** Publisher and aggregator terms of service
   govern commercial redistribution of this material, and the CC-CEDICT dictionary carries
   a CC BY-SA 4.0 obligation. This matters more now that Desk Pro has features attached to
   it.
3. **Send one real alert email.** The pipeline is built and tested but has still never put
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

4. **Full article text — now needed only for the ACTION on an edge, not for the edge.**
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