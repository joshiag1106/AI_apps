# Where this project stands

**Last worked: 2026-09-24** (the demo tour's Lens chapter, its step to an official, and a female
narrator — see the first section below). Everything below was verified, not assumed. Where something
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
| Tests | 1,134 passing on `main` (`npm test`), `tsc --noEmit` clean |
| Deployed | **LIVE on a VPS since 2026-09-17** — see "The first real deployment" below |
| Build | `npm run build` passes; standalone server verified |
| Corpus at last run | 1,735 articles, 990 events; drifts with every ingest, so re-measure |
| Person roster | 122 officials across 39 states; 79 named, 43 silent, 24 seats corpus-confirmed |
| Feeds | 25 direct + 3 video + 48 aggregator queries = 73, all health-checked |

There is one real account in the local database (the one created while testing the
signup flow). It is only in this local file.

## The demo tour gains Lens, an official, and a female narrator (2026-09-24)

Josh asked whether the new features were in the demo; they were not (the tour predates Lens). Now:

- **Chapter 3, Language Lens** (12 s): the topic whose sharpest framing gap is widest, its two languages
  side by side, then the verdict in the Lens page's own words (`describeSharpest`, now shared by both).
  Only a difference `lib/lens/compare` already called out qualifies, and with none the chapter is left
  out — there is deliberately no captured fallback. On the real corpus it picked India–Pakistan: 94% of
  Chinese reports frame it as military, 23% of Hindi. English under a headline is the stored key terms or
  the Japanese glossary, labelled "Key terms", never the Chinese dictionary join (chapter 2's rule).
- **Chapter 9 walks on to an official** (9 → 12 s): the state walk, then at 4.5 s a crossfade in one grid
  cell to the person graph, lighting the edge from the state to the official most named with it whose own
  top ten still shows that state. Live data: USA → CHN → Donald Trump. No such official → the old 9 s walk
  and caption (`WALK_ONLY`).
- **Narrator**: `pickVoice` (`lib/demo/audio.ts`) picks a known female voice by name, neural/premium/online
  first, Indian English among equals; male and robotic voices are passed over. Rate 1.0. Josh heard it
  in the app's browser (Samantha, the Mac's standard voice) and found it robotic; offered recorded
  narration from Kokoro (Apache 2.0) or a cloud voice, he chose to **stay with browser voices as the
  safer option** — nothing recorded or shipped, so no licensing question at all. What a visitor hears
  depends on their browser: Edge → Microsoft Neerja (natural, en-IN), Chrome → Google UK English Female,
  Safari/plain Mac → Samantha. **Do not record Apple's or Chrome's voices into files** — their licences
  do not cover redistribution. If a better voice is wanted later, Kokoro (checked: Apache 2.0, commercial
  use allowed; the makers say training was public-domain, permissive and closed-provider synthetic audio —
  a line for the legal review) is the free route.

Verified against a from-scratch production build on a fresh ingest, in a browser: 12 chapters, both new
scenes playing and at rest, no overflow at 375px, every `_next/static` request 200, narration spoken in
Samantha at rate 1 (not Rishi, who is male and was the old pick), and no usage rows written by the graph
nodes' link prefetches. The one console 404 is the browser's own `/favicon.ico` at the bare local root,
outside `/kautilya`.

**Then cached, the same day (c718307, deployed):** `/demo` had grown to ~1.1 s locally, ~360 ms of it
`lensData()` recomputed per request (`/lens` paid the same). It is now kept until `last_ingest` moves —
an ingest stamps it after its last write — pinned by `tests/lens-cache.test.ts`. Locally `/lens` went
~0.54 → ~0.2 s and `/demo` ~1.08 → ~0.89 s; live, `/demo` answers in ~0.6–0.7 s. One `next build` failed
inside `next/font` (`Cannot read properties of null (reading '1')`) and passed unchanged on the rerun —
a transient font download at build time; the deploy build was then redone from an empty `.next`.

## One shared concept list decides every report's kind of pressure (2026-09-24, latest) — SHIPPED

**Deployed and live the same day.** Live DB backed up first (`/var/lib/kautilya/pre-concepts-2026-09-24-1256.db`,
5,110 articles, restorable by one copy), deployed, one `/kautilya/api/cron` call re-scored it: Diplomatic
3,113 → 2,042, Military 664 → 1,841, `domain_vocab` recorded. All probes pass, the Methodology sentence is
live, and **the Japanese and Arabic Lens columns now show framing live** (they were just under the
25-report threshold before). Live verdicts differ from local by corpus: India–China military 89% Hindi vs
26% Chinese; China–Taiwan diplomatic 48% Japanese vs 2% Chinese; Middle East maritime 26% English vs 2%
Arabic. The runbook's paths were corrected to `/kautilya/...` (they predated the basePath move).

Branch `shared-concepts`. Spec `docs/specs/2026-09-24-shared-concepts-design.md`, plan
`docs/plans/2026-09-24-shared-concepts.md`. Josh chose: reach **everywhere** (Lens and the Board) and
**re-score stored reports on ship**.

**What changed.** `data/concepts.ts` — 43 concepts, each with its words in en, zh (Simplified and
Traditional), hi, ja, ar, ru, or a stated gap (only one: Russian "casualties") — is now the ONLY source of
which-kind evidence. `DOMAIN_HINTS` is gone; `LEXICON` keeps its escalation weights but no longer votes on
the domain (it was mostly English, which is why English was read most closely). `lib/analyze/concepts.ts`
matches English on whole words (+ s/es/d/ed/ing), other scripts as substrings of lower-cased text, longest
match first with overlaps masked ("trade war" does not also count "war"), each concept once. `NEUTRAL`
phrases mask without counting (冠军 "champion", तेलंगाना, "bargaining chip", "war of words"…). Retired
with reasons in `tests/concepts.test.ts`: bare "carrier", bare 核 (inside 核心, "core interests"),
"protest" (also diplomatic), and "tension" (तनाव/کشیدگی/تنش — names no kind of pressure, and is the Hindi
and Urdu India–Pakistan search word). `lib/analyze/rescore.ts` re-scores stored domains whenever a
fingerprint of the table + matcher changes, called by ingest just before clustering — replacing the manual
backfill script the spec first proposed. `npm run concepts:report` measures all of this; keep using it.

**Measured locally (same corpus, both classifiers recomputed):**

| | before | after |
|---|---|---|
| readable, en/zh/hi/ja/ar/ru | 46/48/53/47/18/74% | 73/80/74/89/47/92% |
| stored domain Diplomatic / Military | 62% / 16% | 40% / 38% |
| events / multi-report / largest | 5,183 / 22% / 66 | 5,183 / 23% / 89 |
| cross-language events | 56 | 55 |

Lens verdicts moved; several old ones were vocabulary artifacts — India Defence & Security "85% of Hindi
military vs 23% of English" (English could not read "military") is now no call-out; South China Sea flipped
to Chinese 72% maritime (Chinese reef/coast-guard/vessel words were unread). India–China now: military 83%
Hindi vs 29% Chinese — the demo's widest-gap topic. Russia–Ukraine: diplomatic 61% Russian vs 8% English
(the Russian search itself asks for "переговоры", negotiations — the disclosed query caveat).

**Clustering, read not just counted.** Largest event (89) = LAC troop drawdown, Hindi+English, one story;
next = Arunachal commanders' talks; the third (64, LoC drones) pulled in an unrelated Javelin deal — mild
blobbing. The Houthi/Red Sea story now divides by angle (diplomatic 45, maritime 23, military 23; 173 → 180
events) — the documented "divides by angle" property. Cross-language events: 11 lost / 13 gained, read one
by one — the lost were mostly junk blobs, the gained mostly real (warship collision ×2, BRICS summit).

**Precision by hand**, 30 classified headlines per language, first pass: en 21 right / 7 debatable / 2
wrong; zh 23/6/1; hi 19/9/2; ja 23/6/1; ar 27/3/0; ru 19/7/4. Six systematic patterns were then fixed with
tests (border talks and ending a war are diplomatic; "tariff war"/"economic war" economic; "peace and
stability in the Strait" diplomatic; 攻击抹黑 and नई ऊर्जा figurative; "export curbs"; English "boundary").
**Known limits:** ties go to Military first (DOMAIN_ORDER), and Military now has the broadest vocabulary, so
a headline mixing a military word and one other kind leans Military; sports stories ("attack", "defence")
can read as Military (low escalation, so risk scores barely move).

## Japanese and Arabic framing vocabulary (2026-09-24, later)

Lens could not read Japanese (5% of topic-search reports) or Arabic (4%). Added to `DOMAIN_HINTS`
(`data/lexicon.ts`), from the corpus's own recurring words, under ONE rule: **a word goes in only if the
language it is compared with in Lens counts its counterpart** — Japanese vs Chinese (China–Taiwan), Arabic
vs English (Middle East). LEXICON (escalation weights) was not touched.

**The first cut broke that and was caught by measuring, not by a test.** It translated anything SOME
language counted, so Arabic got "attack", "strikes", "missiles", "military", "shelling" — which English
counts only inside phrases — and Lens called a Middle East "military framing" gap of 65% vs 16% that was
mostly vocabulary. Likewise Japanese 海峡 ("strait") counted while the Chinese search word 台海 did not.
Tightened to the pairwise rule, re-measured: Japanese 47% readable (68 reports), Arabic 18% (40); Middle
East now calls out energy (25% English vs 0% Arabic — the English searches include a separate Red Sea
shipping query, disclosed under each column); China–Taiwan calls out military, 94% Chinese vs 69%
Japanese. Chinese coverage also rose (China–Taiwan 68 → 122 readable) because Traditional-Chinese reports
from Taiwan outlets write 軍, not 军, and were unread before.

**Precision, read by hand:** Arabic 36 of 40 classified headlines clearly right, 4 debatable (mixed
stories), none wrong. Japanese 47 of 58 right, 9 debatable, 2 wrong — both from a word describing the
writer, not the story (外交評論家 "diplomacy commentator", 軍事専門ページ "military-affairs page").

**Deployed; live, both columns are just under the threshold.** Production holds fewer reports than the
local corpus (it has collected only since 2026-09-17): live Japanese reads 24 of 52 (46%), Arabic 22 of
119 (18%) — the same rates as locally, but one and three short of `MIN_ARTICLES` = 25, so both still say
"cannot be read yet". They cross on their own as the hourly ingest adds reports. Do NOT lower the
threshold to make them appear; it is what stops Lens stating a framing from a handful of reports.

**Side effect:** the same list sets each report's stored `domain` at ingest, so newly collected Japanese,
Arabic and Traditional-Chinese reports stop defaulting to "Diplomatic" and the board's risk vectors get
slightly more accurate; stored rows keep their old domain until they age out (no rescore script — none
was asked for). **The real next step** is one shared concept list with a term for every language — it
would also let English count "attack", "missile", "war", "defence", "energy" — but it moves every
language's numbers, so it is Josh's call.

## The basePath migration to /kautilya — built and verified locally, NOT YET DEPLOYED (2026-09-23)

Josh is building a company site (RamanujTech, a separate static project in the AI_apps
monorepo) to occupy the production domain's root, with Kautilya as its first linked
product. That means Kautilya itself moves off the domain root to `/kautilya`.

**The code change.** `next.config.mjs` gets `basePath: '/kautilya'`. That alone breaks two
categories of thing Next does not auto-prefix for you: (1) any manually-built absolute URL
— `NextResponse.redirect` in a Route Handler, a raw `<a href="/...">`, a `<form
action="/...">`, a client-side `fetch('/...')` — and (2) nothing else, notably `redirect()`
from `next/navigation` in a Server Component/Server Action, which **is** basePath-aware
automatically (confirmed by curling a real build, not assumed).

`lib/site.ts` gained `BASE_PATH` and `siteUrl()` (origin + BASE_PATH) alongside the
existing, untouched `siteOrigin()` (which deliberately strips to bare origin — that
contract and its tests were not touched). Every caller that builds a link into this app's
own routes — checkout's two Route Handlers, `runAlerts`, `demoOrigin` — switched from
`siteOrigin` to `siteUrl`. A full audit of the codebase found and fixed ten files with
hardcoded root-relative paths that `basePath` does not touch on its own: the splash's three
deliberately-raw anchors (`/board`, `/demo`, `/about` — raw on purpose, see the comment in
`app/page.tsx`, to avoid the chromeless-layout soft-nav bug), the demo tour's close link and
keyboard-exit, `lib/demo/claims.ts`'s closing-chapter buttons, dashboard/events/event-detail
CSV+JSON export links, the events search form, both checkout form actions, and the two
client-side `fetch()` calls (`LivePulse`, `FramingAnalysis`).

**A real bug, found only by curling a real production build — not by any test.** With
`basePath` set, Next concatenates it directly onto a middleware matcher pattern's own
leading `/` to decide whether to run middleware at all. The matcher here,
`/((?!_next/static|...).*)"`, becomes in effect `/kautilya/((?!...).*)"` — which needs a
*second* `/` after the prefix, so it never matched a request for exactly `/kautilya` (no
trailing slash, nothing after it). Middleware silently never ran for that one request
shape: `app/layout.tsx` never learned the route was chromeless (the splash kept its Nav and
footer), and the anonymous device cookie was never minted on that request either. Fixed by
adding `'/'` as its own matcher entry rather than folding it into the general pattern — see
`middleware.ts`. Pinned with a structural test (`config.matcher` contains `'/'`), since
calling `middleware()` directly, as the rest of that test file does, cannot reproduce this —
the decision to invoke middleware at all happens in Next's own routing layer, upstream of
the function.

**Verified**, against a real `rm -rf .next && npm run build` standalone server, not assumed:
root `/` 404s, `/kautilya` 200s and is chromeless, `/kautilya/board` has Nav+footer,
`/kautilya/demo` is chromeless, the device cookie mints on the bare `/kautilya` request,
`/kautilya/account` (unauthenticated) redirects to `/kautilya/login`, an unauthenticated
checkout POST redirects to `/kautilya/login?next=/pricing`, dashboard/events export links
and both checkout form actions render with the `/kautilya` prefix, `/kautilya/api/pulse` and
`/kautilya/api/export` both 200. `npm test` — 973 passing (the pre-existing 972 plus the new
matcher test), `tsc --noEmit` clean.

**DEPLOYED the same day, once SSH access was unblocked.** rsync'd clean (dry run first, 0
`.db`/`darwin`/duplicate-file hits), `KAUTILYA_ORIGIN` updated in `/etc/kautilya.env` to
include `/kautilya`, the hourly cron's URL updated to `/kautilya/api/cron`, service
restarted. The RamanujTech static homepage (a separate project, `AI_apps/RamanujTech/`) went
to `/var/www/ramanujtech` on the same VPS; the Caddyfile changed from a single
`reverse_proxy` covering the whole domain to `handle /kautilya* { reverse_proxy
127.0.0.1:3000 }` plus a catch-all `handle { file_server }` for the new homepage. Both
`kautilya.env` and the Caddyfile were backed up (timestamped) before editing; the old
Caddyfile is one `reverse_proxy` line, easy to restore by hand if ever needed.

**Verified live, not just locally:** the production domain's root and its `www.` both serve
the new homepage; `/kautilya` and `/kautilya/board` serve Kautilya; the chromeless-splash fix
and the device-cookie-on-bare-root fix both confirmed working on the real domain, not only
the local build; unauthenticated `/kautilya/account` and a checkout POST both redirect
correctly with the `/kautilya` prefix; `/kautilya/api/cron` still 401s as before;
HTTP→HTTPS 308 still intact.

**A second real deploy bug, found later the same day by actually looking at the live site in
a browser rather than trusting curl status codes.** Every `/kautilya/_next/static/*` asset —
every CSS file, every JS chunk — 404'd, so the site loaded (200 on the page itself) but
rendered as unstyled HTML with a broken console full of 404s. Cause: `next build`'s
standalone output deliberately does not include `.next/static` — the deploy runbook's own
"Deploying an update" section says to `cp -r .next/static .next/standalone/.next/static`
before the rsync, and that step was skipped on the first deploy. The local smoke test earlier
in the day never caught this because it only checked that pages served 200 and that the HTML
referenced the right `/kautilya`-prefixed asset URLs — it never actually requested those
asset URLs and checked *they* 200'd too. Fixed by running the copy, re-syncing (clean dry
run), restarting, and this time verifying in a real browser: no console errors, every
`_next/static` request 200s, the splash renders fully styled, `/board` shows real live data
(2,288 events, 146 corroborated, 774 Chinese-language, 12 active flashpoints) with full
Nav/footer chrome as it should. **Lesson for next time: after any deploy, load the page in
an actual browser and check the console/network tab, not only `curl -I`.**

**The second (`.in`) domain no longer left open — redirected to the primary the same day.** DNS pointed at
the VPS (Hostinger's CDN disabled first, per the documented trap; no AAAA record), then a
Caddy site block added: `<second-domain>, www.<second-domain> { redir
https://<production-domain>{uri} permanent }`. Verified live: HTTP→HTTPS→301 to the primary, path and
query preserved (`/kautilya` redirects to `/kautilya`, not dropped), `www.in` too. TLS
certificate issuance for the new domain went through cleanly on the first try.

## Phone header menu, and Japanese headlines glossed in Japanese (2026-09-23, late)

Two fixes Josh asked for after checking Language Lens on a phone. **Header:** at 375px the sticky
header took 171px of 812 on every page (12 links on three rows); below `md` the links now sit behind
a native `<details>` "Menu" (works with JS off) that `NavMenuCloser` shuts after a soft navigation
and on Escape — now 101px; `md`+ unchanged. **Japanese headlines** were glossed by the CHINESE
dictionary on every event page (首脳会談 "summit" came out "head · can") and had no English in Lens:
kana or a stated 'ja' now routes `titleGloss` to `lib/lang/japanese.ts` + `data/glossary.ja.ts`, a
glossary built from the corpus's own recurring terms, matched longest-first, ignoring the outlet tag
aggregators append (Mezha's "ウクライナニュース" had put "Ukraine" on its China–Taiwan headlines). All
130 local Japanese headlines now get an English line. Lens prefers a headline's stored key terms and
falls back to the gloss — preferring the gloss had made Chinese lines noisy. Both caught in a browser.

## Language Lens — built, verified and deployed (2026-09-23, late)

Josh: "go ahead with what you think best to add". Chosen, designed and built by Claude —
`docs/specs/2026-09-23-language-lens-design.md` and `docs/plans/2026-09-23-language-lens.md`.
`/lens` (live `/kautilya/lens`, in the nav after China Watch) puts each topic search that is run in
several languages side by side: what each language was literally asked (non-English searches now
carry English glosses in `data/feeds.ts`), how its reporting frames the topic, which other states it
names, and its three newest headlines. One sentence per topic names the sharpest framing difference
— only when it is ≥ 10 points AND passes a two-proportion z-test at 2.58.

**Two more obvious designs were measured and dropped first** — "what English readers are missing"
(only 50 of 4,376 events span two languages; the clustering links languages almost only through
hotspots, so absence would mostly be its blind spot) and "what each language's press attends to"
across the corpus (that measures which searches run in which language: Japanese is 100% the
China–Taiwan search). Comparing WITHIN one topic is the like-for-like version.

**A real bug found by running the first build on the real corpus, not by any test.** It said
China–Taiwan was framed diplomatically by "100% of Japanese reports" and the Middle East by "96% of
Arabic". The stored `domain` falls back to 'Diplomatic' when a report's words match nothing, and only
3% of Japanese and 4% of Arabic topic-search reports match anything (English 45%, Chinese 45%, Hindi
52%). Fixed with `evidencedDomain()` in `lib/analyze/score.ts` (shares `classifyDomain`'s tally;
`scoreText` output unchanged): framing is counted only from reports whose wording shows one, each
column says how many that is, and a language with < 25 readable reports says its framing "cannot be
read yet" and sits out the test. **The lexicon's near-absent Japanese and Arabic vocabulary is now a
visible, known gap** — adding terms there would let those columns speak. **Closed 2026-09-24**, see the
top section: Japanese 5% → 47% readable, Arabic 4% → 18%, both columns now speak.

Verified: 1,006 tests, `tsc` clean, a clean standalone build against a copy of the real corpus
(9 topics; no console errors; every `_next/static` request 200; no overflow at 375px; headline links
carry `/kautilya` and open their events), then deployed per the runbook and re-checked live.
One local-verification slip worth remembering: a stale server from the first check still held port
4321, so the second build failed to bind (`EADDRINUSE`) and curl silently read the OLD page — the
identical output was the tell. Check `lsof -i :<port>` before trusting a re-run.

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

1. **DONE 2026-09-18 — alert mail has been delivered.** `SMTP_PASS` is set, `npm run
   alerts:check` sent a real ladder-alert email from a real corpus event, Hostinger's server
   accepted it, and Josh confirmed it arrived. See "Alert mail is proven, finally" below for
   the two bugs found getting there. **Still not proven**: a send FROM the production server's
   own process, triggered by a genuine subscriber's watched state — only a manual local send
   with a credential production was separately restarted to also hold.
2. **It has never run on a real server.** The standalone Node path in `README.md` was tested
   end to end, and on 2026-09-11 the production build answered correctly to the headers a
   reverse proxy sends for a public host — but no real proxy, TLS certificate or DNS has
   been in front of it yet. (This item used to read "the Dockerfile has never been built".
   There is no Dockerfile: the README described one, and a compose file, that were never
   committed, and git has no trace of either.)
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

## Getting it ready to host publicly (2026-09-11)

Josh wants the site public, on a VPS behind a reverse proxy. Reading the code against how it
would actually run there found five things in the way. All five are fixed on branch
`public-deploy`, test first, each test watched failing against the old code.

1. **Checkout would have redirected to localhost.** Both checkout routes built their
   redirects from `new URL(req.url).origin`. Next 15.5.4 builds a route handler's `req.url`
   from the host and port the server itself listens on — `attachRequestMeta` in
   `next-server.js`, and `resolve-routes.js` — never from the Host header. So behind a proxy,
   a reader returning from Stripe lands on `http://localhost:3000`. `lib/site.ts` now supplies
   the address from `KAUTILYA_ORIGIN` to checkout and to alert mail, strips a trailing slash
   (which would have made every mail link `//events`), and throws in production rather than
   guess. The ingest already contains alert failures, and nothing is marked sent, so a missing
   origin delays mail rather than losing it.
2. **Test-mode checkout handed out Pro in production**, and /pricing named the `STRIPE_*`
   settings to every visitor. `lib/billing.ts` now decides stripe / mock / closed in one place;
   mock is development-only. That also ended a split: pricing read the secret key alone, the
   route read the key and the price, so a key without a price advertised live checkout and
   then quietly ran test mode. "Cancel Pro (test mode)" now shows only in test mode — with live
   billing it would have dropped the plan while Stripe went on charging.
3. **An open image proxy.** `images.remotePatterns` with host `**` let `/_next/image` fetch any
   URL and re-serve it from this domain. Nothing uses next/image; it is gone. The test asks
   Next's own matcher rather than reading the config's text.
4. **The paid model call now needs an account.** Device-cookie metering bounds nothing for a
   client that never stores the cookie — middleware mints a fresh device, and a fresh five,
   on every request. Anonymous `/api/analyse` returns 401 `{ unavailable: 'signin' }` and the
   panel offers a sign-in link instead of the button.
5. **The README described a deploy path that did not exist** — the Docker section — and a
   `cp -r public` step for a folder the repo has never had. It now says what production needs.

**Verified against the production build, not only the tests.** The standalone server, run with
production settings over a copy of the corpus and probed with the headers a proxy sends for
the public host: checkout 303 to the public origin, `/_next/image` 400, anonymous
`/api/analyse` 401, /pricing "not open yet" with no setting names, `/api/cron` 401 without
its secret. 402 tests.

**Two things learned that will recur:**

- **In production `kautilya.db` is not a cache.** It holds accounts, plans and watchlists. The
  standalone server `chdir`s into `.next/standalone`, so without `KAUTILYA_DB` the database
  lands in the folder every build replaces. Set it outside the build, and back it up.
- **The preview tool reads the WORKSPACE `launch.json`, not this repo's.** Asked for a config
  that only `Output/GeoIntel/.claude/launch.json` had, it started the dev server instead — and
  `next dev` deleted `.next/standalone` on startup. The shared-`.next` trap cuts both ways: a
  build breaks a running dev server, and starting dev wipes a build.

**Still to do before it is public:** the domain's registrar verification (it was not resolving
on 2026-09-11); the server itself — Node 24, a service manager, a TLS-terminating proxy, cron
on `/api/cron`, a nightly database backup; DNS; a spend limit on the Anthropic workspace; and
`SMTP_PASS`. Whether to launch free or with real billing is still open, and the code is safe
either way.

## Where 2026-09-16 ended — six rounds of motion/visualization, all shipped

A different track from everything else in this file: not roster accuracy, the UI's visual
language. Josh asked whether the site could be made "more interesting" with "meaningful
animations." Six rounds, thirteen features, each one grounded in what the app already
measures rather than decoration bolted on. **430 tests** (402 → 430, all new ones added this
session), `tsc --noEmit` clean throughout, every feature verified against real server-rendered
HTML and, where the browser pane's own state allowed it, watched live.

GeoIntel `main` @ **8a8ef26**, pushed to the private repo throughout (no lag between local
commits and the push — each round was pushed before the next began). AI_apps `master` @
**8214cfc**, six PRs merged in order: #62–#68 (odd count because #64 was the unrelated
`.gitignore` fix below). Both copies verified file-for-file identical after every refresh, the
same `git archive` discipline as every other refresh in this document.

**The features, in build order:**
1. **Count-up on refresh** — every numeric Stat tile, site-wide, animates to a new value
   instead of snapping when LivePulse's `router.refresh()` swaps in fresh data. First render
   never animates (`prevRef` starts equal to `value`); only a later change does.
2. **Severity-scaled pulse** — world-map flashpoint markers pulse 1.3s–3.1s by heat instead of
   a uniform 2.6s; Mandala nodes scoring ≥70 pulse too, which they never did before.
3. **Tension-timeline event markers** — the dyad page's 90-day chart plots its "defining
   events" as clickable dots on the day they happened, connecting the curve to the event list
   already shown below it.
4. **Draw-in reveal on scroll** — sparklines, the Mandala's spokes, and the network graph's
   edges draw themselves in the first time a panel scrolls into view.
5. **World-map fill cross-fade** — a state's risk colour transitions instead of hard-cutting on
   refresh.
6. **Animated network walk** — clicking a neighbour highlights the edge just crossed, correctly
   resolving the walk's previous stop even when it was a person node (reuses `trailNode`, the
   same lowercase/uppercase fix the roster work needed for mixed walks).
7. **Risk-radar draw-in** — the six-vector polygon scales in from its own centre; the four
   static grid rings stay put.
8. **Progress bars grow in on scroll** — `BarList`, `ConfidenceMeter`, `LadderGauge`'s 13 rungs,
   all render from zero instead of pre-filled.
9. **New events flash into the live feed** — a row that arrives after `router.refresh()` gets a
   brief highlight-fade instead of appearing indistinguishable from what was already there. The
   diffing is a pure function, `markSeen()` in `lib/newness.ts`, unit-tested on its own.
10. **Palette-switch colour smoothing** — one zero-specificity `:where(*)` rule fades every
    drawn colour when the palette changes, instead of hard-cutting the whole app at once.
11. **Watch star pop** — the pin toggle's star bounces once when it turns on, shared by the
    signed-in and signed-out paths.
12. **Search dropdown fade-in** — a plain CSS `@keyframes` on mount, no JS.

**One shared component carries most of this: `components/RevealOnView.tsx`.** It started
(round 2) as stroke-dashoffset draw-in for `<path>`/`<line>` only, and was generalized (round
3) to three opt-in surfaces chosen by what the mark already IS — `<path>`/`<line>` stroke-draw,
`.reveal-scale` for a polygon, `[data-reveal-bar]` for a width-based bar — rather than three
near-duplicate components repeating the same IntersectionObserver/reduced-motion boilerplate.

**Two real bugs found building this, both worth knowing before touching this file again:**

- **`display: contents` gives an element a zero-size box, and `IntersectionObserver` never
  reports a zero-size target as intersecting — no matter where it scrolls to.** `RevealOnView`'s
  wrapper needs `display: contents` so it takes no part in layout, which broke the very
  mechanism it exists to drive. Fixed by observing `el.firstElementChild` (the actual `<svg>`
  or panel `<div>`, which has real geometry) instead of the wrapper itself. Verified live: a
  bare `new IntersectionObserver()` on the same wrapper also never fired: this is standard
  browser behaviour, not a bug in the observer call.
- **A plain `useEffect` runs AFTER paint, so the hidden starting state (dasharray, `scale(0)`,
  `width: 0`) could apply one frame too late** — a reader would see the finished chart flash
  for a frame, then snap to hidden and re-grow. Fixed by switching to `useLayoutEffect`, which
  runs before the browser paints. This fixed every chart built in the round before it was
  found, not just the ones built after — `RevealOnView` is shared, so the fix was retroactive
  for free.

**The browser pane being backgrounded blocks live verification of anything scroll- or
visibility-driven, and this cost real time before the cause was found.** `document.hidden` was
`true` for most of this session's browser checks, and Chromium throttles both
`IntersectionObserver` callbacks and CSS transitions on hidden documents — confirmed by a bare
manual observer on the same element also never firing. **`Chrome` (the user's real browser, via
`claude-in-chrome`) does not have this problem** — every feature that could not be watched
firing in the built-in pane was later confirmed actually animating end-to-end in a real Chrome
tab. Prefer Chrome over the built-in pane for anything gated on scroll-into-view or tab
visibility; use curl plus a proper DOM/attribute check (not a raw-text `grep`, which matches
Next dev-mode's embedded source maps as false positives) for server-rendered correctness
instead.

**A stalled peer session left `Output/AI_apps/GeoIntel/.gitignore` edited but uncommitted, in
this exact working directory, not an isolated worktree as `spawn_task` suggested it would be.**
Finished directly: the fix was correct (widened the duplicate-file rule for the sync client's
double-digit counter, `alerts-run.test 10.ts`) but had been made in the AI_apps COPY rather
than the GeoIntel SOURCE — the wrong place per this file's own established rule, since the next
`git archive` refresh would have silently reverted it. Redone at the source (GeoIntel main
commit before 8a8ef26), then re-extracted, verified `git check-ignore` on both the two real
stray files and a decoy (`42km.ts`, correctly NOT ignored), swept the whole tree (643 junk
duplicates on disk, 0 leaking as untracked), and merged as AI_apps PR #64 — landing in the
middle of the animation rounds, hence the numbering gap.

**GateGuard's fact-forcing gate fired on every first touch of a file this session** (dozens of
times) — present the three facts (importers, affected API, verbatim instruction) and retry;
it never blocked a second time on the same file.

## Where 2026-09-17 ended — the audit's first unattended run, and three detector bugs

The first roster audit since 2026-09-10. Seven days of drift, a corpus grown from 6,348 to
7,766 articles, and **four flags where the baseline had four — but two of them were new, and
both were the detector's fault, not the roster's.** Nothing in `data/people.ts` was wrong.
434 tests (430 -> 434), `tsc --noEmit` clean, TDD throughout: each of the four new tests was
watched failing against the old code first.

**1. `斥` was missing from `NOT_A_NAME_START`.** 台湾外长斥北京操作"认知战" — "Taiwan's FM
rebukes Beijing" — put a verb where the run-capture expects a name, so Lin Chia-lung came back
as a SEAT MISMATCH. 批 was already excluded, off 印度外长批评 in the first live run; 斥 is its
near-synonym and simply had not appeared yet. **The same article confirms the roster thirty
characters further on**, where it writes 台湾外交部长林佳龙随后驳斥 — so the detector flagged
and vindicated the same seat from one sentence, and printed only the flag.

**2. Hindi पूर्व was never bound to an office, and Chinese 前 always was.** पूर्व शर्त is a
PRECONDITION; the audit read it as "former" and flagged **Modi** off a headline that calls him
पीएम मोदी — serving — in the same clause. पूर्वी (EASTERN) is the same failure waiting in every
Indian defence story. Measuring first was what made the fix safe: **12 occurrences of पूर्व in
the whole corpus, 9 of them true, 8 being पूर्व CDS** — the sentence that originally caught
Anil Chauhan.

**The fix is deliberately NOT the Chinese guard turned around, and the asymmetry is worth
keeping.** 前 can be bound POSITIVELY to an office because Chinese office words are a short
closed set sitting flush against it. Hindi puts the portfolio in between — पूर्व विदेश मंत्री,
पूर्व रक्षा मंत्री — so a positive binding would silently lose exactly the compound roles this
roster carries most. So Hindi gets a NEGATIVE guard: a following vowel matra means the word is
not पूर्व at all (covers पूर्वी and पूर्वोत्तर generically), plus the one non-office compound
the corpus actually printed. **And the safe direction inverts between the two detectors** — a
missing stopword in the seat detector costs a false FLAG, but an over-eager exclusion in FORMER
SUPPRESSES a real one. Add a Hindi compound only once the corpus has printed it.

**3. Three gazetteer aliases were listed twice, and every count for them was doubled.**
`data/countries.ts` repeated 中国, 台湾 and 日本 in their own alias arrays — a paste artifact
next to the Korean alias in each. Harmless to every other consumer, because they all ask
`.some()`, which is idempotent. **`scripts/roster-seats.ts` is the only code in the repo that
ITERATES an alias list**, so the three most-covered states in the corpus had every seat count
silently doubled: one Taiwan mismatch printed as "2 articles", two confirming sentences printed
as four confirmations for Lin Chia-lung. **A doubled count is worse than a wrong one, because
it reads as corroboration** — and corroboration is the one thing this section exists to supply.
Fixed at the source AND defensively in `COUNTRY_ZH`, with a test that pins the gazetteer itself,
since that is the only place the next paste can be caught.

**After the fixes the audit returns exactly the 2026-09-10 baseline**, which is the result to
want: CONTRADICTED 1 (Lula, known noise), DISMISSED 1 (Xi, known noise — he is doing the
purging), SEAT MISMATCH 1 (Vietnam, genuine), UNCLAIMED SEAT 1 (PRK, deliberately empty).

**Vietnam moved, and was still not acted on.** 越南政府总理黎明兴 is now carried by two
Vietnamese state outlets — but it is the same wire copy twice, and the note's own trigger asks
for a second SOURCE, which a reprint is not. What is new is a measurement: **Pham Minh Chinh
matches ZERO of 7,766 articles.** That is the signature this document already records for a
turned-over seat — Ishiba, Iwaya and Nakatani all matched zero before Japan was corrected.
Recorded in `data/people.ts`, still unchanged, and the standing instruction holds: **unlist
rather than romanise 黎明兴 from its characters.**

**The general lesson, and it is the one to carry forward: a detector left unrun for a week does
not go stale, it goes WRONG in new ways, because the corpus keeps producing constructions the
exclusion lists have never seen.** Every one of the three bugs above was latent on 2026-09-10
and needed only a sentence nobody had written yet. Run the audit on a schedule, and read the
NEW flags as suspect-detector-first — two of two were this time.

## The first real deployment (2026-09-17) — it is live

Kautilya runs on a VPS, served over HTTPS with a valid certificate, on the production domain.
**This document names neither the domain nor the server address**, for the reason recorded
above: it is published to a public repository. Both are in the operator's hands and in
`.env.local`; `docs/runbooks/vps-deploy.md` uses `example.com` and `SERVER_IP` throughout.

**The box:** Hostinger KVM 1 (1 vCPU, 4 GB RAM, 50 GB NVMe), Ubuntu 24.04.4 LTS, India region,
12-month term. The previous plan — Single Web Hosting, shared PHP — could not have run this at
all: no Node runtime, no long-running process, no controlled writes outside the app folder.

**The shape that matters, and it is the one the runbook leads with:** `/srv/kautilya` is
disposable and replaced by every deploy, `/var/lib/kautilya` holds the database and is never
touched. The app never builds on the server — the build happens locally and the standalone
output is shipped — so a failed build cannot take the site down. Node 24.21 via nvm (the
distro version then stops mattering), systemd, Caddy terminating TLS, hourly cron on
`/api/cron`, nightly `sqlite3 .backup` **verified by restoring one**. Boot is 170 ms, an
ingest is ~10 s on 1 vCPU, and the server's corpus came up at 1,176 articles / 782 events.

**Three things the deployment taught that no amount of reading would have:**

1. **`next build` traces `kautilya.db` into the standalone bundle** — the whole corpus and a
   real user row, email and bcrypt hash included. It shipped on the first rsync before being
   caught. The danger is not the 16 MB: if that file lands in the deploy directory and
   `KAUTILYA_DB` is ever unset, the app finds it and serves a frozen corpus and a stale
   account table, **working perfectly and wrongly**. A silent wrong answer beats a crash only
   in the sense that it is harder to notice. `rsync` now excludes it, along with
   `@img/sharp-darwin-x64` — a macOS binary Next includes although nothing imports
   `next/image`.
2. **A host CDN silently overrides DNS edits.** While it was enabled the A record looked saved
   and nothing moved; the tell was a root returning two or more *rotating* addresses and
   responses carrying `server: hcdn`.
3. **A stale `AAAA` record breaks certificate issuance while the `A` record is perfectly
   correct.** Let's Encrypt prefers IPv6, so every challenge was validated against the OLD
   server and 404'd, and nothing in the error mentions DNS. Deleting the AAAA fixed it in one
   restart; certificates issued for both apex and `www` within seconds.

**The diagnostic that separates all three from ordinary propagation is one query:**
`dig +norecurse @<authoritative-ns> <domain> A`. A public resolver tells you what is cached;
only the authoritative server tells you what is *true*. Every wrong turn this evening came
from reading a cached answer as if it were the source.

**Verified in production:** HTTPS 200 with a valid certificate, `http` → 308, `/_next/image`
→ 400 (the open image proxy stays closed), `/api/cron` → 401 without its secret, no `STRIPE_*`
names on `/pricing`, and port 3000 unreachable from outside — the app binds to loopback and is
reachable only through the proxy.

**`/api/analyse` cannot be probed yet, and this is a trap worth knowing.** Without
`ANTHROPIC_API_KEY` the route returns `{"unavailable":"no_key"}` with **HTTP 200**, and that
branch sits ABOVE the sign-in check in `app/api/analyse/route.ts`. So a 200 there means
"feature off", not "gate open", and the 401 that stands between an anonymous visitor and the
Anthropic bill is **unreachable until the key exists**. Re-run that probe the moment the key
goes on, and set the workspace spend limit first.

**Two feeds return HTTP 403 from the datacenter address that succeed from a laptop** — the
server's corpus will run slightly narrower than a local one. The ingest reports them and
carries on; it is not a misconfiguration.

### Left unfinished on 2026-09-17

- **DNS is not converged.** The record is correct at the source, but Hostinger's authoritative
  pool is inconsistent: twenty samples across both nameservers returned the new address 6
  times and the old one 14, with the SAME SOA serial, and repeated queries to the same
  nameserver flap between the two. This is neither a reversion nor ordinary propagation — some
  pool members simply have a stale zone. Public resolvers held the correct value from cache
  while that was measured. **Re-measure before doing anything.** If it is still majority-old,
  the fix is to move the domain's nameservers to a DNS provider the operator controls and
  recreate the A and MX records there, rather than another round in the host's panel.
- **DONE 2026-09-18 — `SMTP_PASS` is set and alert mail has been delivered.** See "Alert
  mail is proven, finally" for the full story.
- **The MX records were deliberately never touched** through the whole cutover, and were
  re-checked after every DNS change. The alerts mailbox may be bundled with the old shared
  hosting plan, so **do not cancel that plan until that is confirmed**.
- **A weekly scheduled roster audit now exists** — Wednesdays 20:00 local. It may open PRs for
  detector fixes and is forbidden from editing `data/people.ts` or merging anything. Its first
  test run wedged on a permission prompt and never ingested, which is itself the finding: an
  unattended run can park indefinitely and look scheduled. A command allowlist was added to the
  workspace settings; **whether it actually prevents the stall is still unverified.**

## Where 2026-09-18 ended

Five pieces of work, in the order they shipped. All deployed and verified against the live
site, not only locally.

**Mobile overflow, fixed.** Two CSS causes, both from a min-content floor. Grid items default
to `min-width: auto`, and a nowrap Chinese headline under Tailwind's `truncate` has no break
opportunity, so its min-content width is the whole string — the item refuses to shrink, and
three routes scrolled sideways on a phone (406px on `/`, 920px on `/dashboard`, 272px on
`/china`). One rule, `.grid > * { min-width: 0 }`, fixed all three and also corrected a
desktop bug nobody had noticed: the home page's declared `1.35fr 1fr` column ratio had been
silently inverting under the same floor. `/methodology`'s ladder table needed `flex-wrap`
instead — a different shape, fixed-width children summing wider than their column.

**A footer, an About page, and the top nav.** The footer was one row linking two of sixteen
routes; it is now four columns, plus `/about`, `/privacy`, `/terms`, `/contact` — the last
three deliberate placeholders that say so rather than carrying invented boilerplate, and
`/privacy` is a factual inventory of what is actually stored (email, a bcrypt hash, a session
token, plan, watchlist, an anonymous device cookie), not a policy drafted by inference. A test
now walks `app/` for real `page.tsx` files and fails the build on any footer link with no page
behind it. `/about` became "Why Kautilya" in the top nav: the problem, eight feature cards,
and — the part that had been missing everywhere — four concrete decision uses (telling signal
from echo, reading the domestic message, catching a posture change early, arguing from
evidence), plus what the engine explicitly does NOT do.

**Provenance: the outlets the score was silently ignoring.** Measured on the production
database: 628 of 1,569 articles — 40% of the corpus — resolved to `ZZZ` and contributed
NOTHING to corroboration, across 387 distinct outlets. Thirty were placed by hand
(government outlets marked `state`, not `independent`, so a ministry cannot corroborate
itself). The structural fix mattered more: `resolveSource` now also matches with punctuation
and whitespace stripped, because a feed sometimes gives an outlet as a bare hostname rather
than a masthead — `times of india` does not occur in `timesofindia.indiatimes.com` — and the
largest Indian daily had been unplaced since the roster began. After redeploying and
re-ingesting: unplaced articles 628 → 523, distinct unplaced outlets 387 → 377.

**The free-analysis limit is suspended, not deleted.** Josh: nothing to sell yet, remove the
cap, keep the subscription model in mind. One flag, `QUOTA_ENFORCED` in `lib/quota`, default
`false` — re-enabling before commercial launch is that single line. A second flag,
`previewUnlimited`, is kept deliberately separate from `unlimited` (which means a PAID Pro
plan everywhere it is read), so the pricing and account pages keep telling the truth about
plan status throughout the free period instead of every visitor's nav badge reading "Pro".

**A logo, and a one-time splash in front of the dashboard.** Three real SVG mark options were
shown side by side rather than described; Josh picked the ascending-bars ladder, tied to the
PRC escalation-ladder detector — the one feature unique to this product, and the one that also
reads cleanly at 16px favicon size. `/` was the Threat Board; that content moved intact to
`/board`, and `/` is now a splash whose map behind the headline is the REAL corpus, quieted —
not a decorative mock. (A visitor who had entered once was first never shown it again; Josh
reversed that the same evening — see "Where 2026-09-19 ended" — and it now shows on every
visit.) Middleware now
forwards the request path as a header so the root layout can suppress its own Nav and footer
for exactly this one route, something Next does not hand a root layout for free.

**This shipped broken once, and the fix is worth remembering.** The first version put an
`onClick` on the splash's Enter link to record "entered" in localStorage. `app/page.tsx`
carries no `'use client'`, so it is a Server Component, and a Server Component cannot hand a
FUNCTION to an element it renders — React can only serialize data across that boundary. It
built clean and typed clean, because neither `next build` nor `tsc` executes the render; it
500'd on every real request the moment it was deployed to production. **Caught within
minutes by curling the live site immediately after deploy** — the same discipline this file
already holds itself to elsewhere (see the 2026-09-17 deployment section above), and the one
step skipped this one time. Fixed by moving the write to a small Client Component mounted on
`/board` instead — which is also the more correct design, not merely a workaround: a
bookmark or a shared link into `/board` now counts as "entered" too, not only clicking Enter
on the splash. **Re-verified the second time by starting the actual standalone server
locally and loading it in a real browser before touching the deployed server again** — build
and test passing was never going to be enough evidence a second time.

A second, smaller bug found the same way: `WorldMap` renders its own legend — a risk-scale
key and two links to `/dashboard` and `/methodology` — unconditionally. On the splash this
read as confusing dead furniture behind the headline, and it looked at first like a
screenshot artifact from switching browser tabs; only reading `document.body.innerText`
showed it was real DOM content. Fixed with a `legend?: boolean` prop, default `true`, so
`/board`'s existing use is unaffected.

**A general safety net, added while fixing the above, not tied to this feature:**
`tests/layout.test.ts` now walks `globals.css` and fails on any class with a bare
`animation:` that has no `prefers-reduced-motion` override. Its own first draft passed by
finding nothing to check — the file has TWO `@media (prefers-reduced-motion: reduce)`
blocks, and an `indexOf`-based extraction found only the first, silently excluding both the
second block and every class defined after it from the check. Rewritten with a
balanced-brace extractor, with its own test pinning that it finds both blocks — a guard on
the guard, the same discipline this file's other tests already use.

492 tests, `tsc --noEmit` clean.

## Alert mail is proven, finally (2026-09-18)

**SMTP_PASS is set, and a real alert has been delivered.** This item sat unresolved since the
alerts pipeline was built: trigger, batching, state and the template were all covered by
tests, but delivery itself had only ever been exercised against a stubbed transport — nothing
had ever put a message in a real inbox.

**Two real bugs found getting there, both worth knowing before touching SMTP config again.**

First: the mailbox password Josh generated in hPanel contained a `#` and a space. Node's
built-in `--env-file` loader (`tsx --env-file-if-exists=.env.local`, what `npm run
alerts:check` actually uses) treats an **unquoted `#` as starting a comment**, so
`SMTP_PASS=abc#def ghi` in `.env.local` silently parsed as `SMTP_PASS=abc` — three characters,
not the real password, and `alerts-check.ts` correctly reported `(SMTP_PASS not set)` because
by the time Node handed it the value, it effectively wasn't. Confirmed with a synthetic value
before touching the real one: `TEST_VAL=abc#def ghi` unquoted parses to `"abc"`, the same
value double-quoted parses to the full string intact. **The fix is quoting the value in
`.env.local`** — `SMTP_PASS="<value>"` — and the more durable fix, which Josh did, was
generating a fresh **alphanumeric-only** password in hPanel, since that class of bug can recur
anywhere this credential passes through a shell, an SSH session, or a different config
dialect that parses `#` differently (systemd's `EnvironmentFile`, notably, does NOT treat a
mid-line `#` as a comment the way Node's `--env-file` does — the two dialects disagree, which
is exactly the kind of thing that makes a credential with special characters risky to carry
across systems).

Second, and this is why the very first send attempt failed even after the quoting fix: the
**production server's copy of the password was one character short of the local copy** (17
vs 18 raw characters, no quoting difference explaining the gap) — a transcription slip typing
it into `nano` over SSH. Caught by comparing lengths (never contents) in both places before
testing either.

**Verification, in order:** quoted the local value and confirmed via `node --env-file` that
the full string now parses intact → ran `npm run alerts:check -- --to=<address>` locally,
which authenticated and got a real `535 5.7.8 authentication failed` from Hostinger — proving
the plumbing worked and the credential itself was wrong, not a config problem → Josh reset the
password in hPanel to a clean alphanumeric one and re-entered it in both places → local and
production lengths now match (12 chars, no `#`, no space) → `npm run alerts:check` again,
**accepted by `smtp.hostinger.com` in 1.9s** → production restarted to load the same
credential → **Josh confirmed the message actually arrived**, not merely that the SMTP server
accepted it — the script's own output deliberately warns those are different claims.

**What is still NOT proven, stated plainly:** `alerts:check` sends from a LOCAL machine using
`.env.local`'s credentials, and production was separately restarted with a value confirmed to
be the identical length and shape — but `alerts:check` cannot run on the production server
itself (it ships as a Next.js standalone build with no `scripts/` directory and no `tsx`), so
no message has yet been sent *from* production's own process, only inferred to work because it
holds the same proven credential. The first REAL alert — triggered by an actual subscriber's
watched state crossing a ladder rung, not a manual test — is still the first genuine end-to-end
proof of the production path, and hasn't happened yet.

## Where 2026-09-19 ended

Three pieces of work (b522300, 01ac1cf, f09e5a8), pushed to the private repo and **deployed to
the production server the same evening** — see "Deployed" at the end of this section. 526 tests,
`tsc --noEmit` clean.

**The first alert email's links pointed at localhost, and production was never at fault.**
Root cause, found before any fix: the mail came from a manual `alerts:check` on the dev
machine, and `.env.local` pins `KAUTILYA_ORIGIN=http://localhost:3111` for local checkout
testing. `siteOrigin` accepted it, because localhost is a perfectly well-formed address, and
nothing asked whether an inbox could reach it. Production resolved to its real public address
— read without side effects from `GET /api/checkout/confirm`, which with no session redirects
to `${origin}/pricing` before touching any state — so alerts sent by the server carried correct
links.

The fix is a rule, not a setting. `isLoopbackOrigin()` in `lib/site.ts`, and `renderDigest()`
throws on one: it is the single place both the scheduled run and the manual check build a
digest, so both are covered. The ingest already contains a throw from `runAlerts`, logs
`alerts skipped`, and marks nothing delivered, so mail goes out once the address is public.
`alerts:check` gained `--origin=<public address>` for a one-off send without touching the
environment the dev server reads, and refuses a localhost origin with the exact command to
run instead. Leave `.env.local` alone — the same value is right for local development. The
check is a full dotted-quad match rather than a `127.` prefix so a real host such as
`127.example.com` is not blocked. **A corrected test email was then sent**, with `--origin` set
to the public address, and Hostinger accepted it in 1.8s. **Josh confirmed it arrived with
working links** — delivery, not merely acceptance, which is the distinction the script's own
output insists on. Still not proven: a send FROM the production process for a genuine
subscriber's watched state; every real send so far has been a manual one from a dev machine.

**A glossary, with the Chinese terms on their own page.** `/glossary` holds about 45
abbreviations — picked by measuring the corpus for the acronyms that actually recur, not from
a primer — plus the site's own vocabulary, the network measures and the 13-rung ladder.
`/glossary/chinese` holds the 87 terms in `data/glossary.zh.ts`, grouped, with pinyin and
weight. It is in the header menu between Why Kautilya and Methodology, and in the footer's
Understand column. The count is 87, not the 102 quoted while planning: that figure included
the 13 ladder rungs and a few other `zh:` fields.

It cannot drift silently. The ladder and the Chinese terms are read from the detector's own
file, never copied, and `tests/glossary.test.ts` holds exhaustive records keyed on `Domain`,
`Ownership` and `EventFlag` — so `tsc` stops when a member is added — plus a scrape of the
network panels' labels, failing until each has an entry.

**A bug found only by loading a real production build:** deep links (`/glossary#lac`) landed
the term underneath the sticky header at every width. The menu wraps onto more rows as the
window narrows — the header measures 92px at 1440 wide, 121px at 1024 and 171px on a phone —
and the first offset reserved 80px. `components/anchorOffset.ts` holds one constant sized to
those heights, and a test fails on any anchor target using less. Re-measured after the fix,
the term clears the header by 34, 36 and 49px at 375, 1024 and 1440. **If the header gains a
row or a link, re-measure.** No horizontal overflow at 375px.

**Tooling note.** The Browser pane cannot screenshot a scrolled page: one taken after
scrolling returns a blank frame, on untouched pages too, and a full-scale screenshot shows the
page cropped to the top-left. Verify anything below the fold with `getBoundingClientRect()`.

**Measured, not yet acted on — reprint inflation.** Of 670 events currently scored as having
two or more independent outlets, **147 (21.9%)** contain near-identical headlines (word
overlap of 0.8 or more) from different outlets, so the distinct originals number fewer than
the outlets counted: 110 lose one, 23 lose two, and the tail reaches ten. Two Chinese outlets
running the identical headline turn "2 independent outlets" into one. This is a floor, not a
ceiling: it catches reprints and misses rewritten wire copy. It is the same weakness the
Vietnam seat note describes — one story printed twice — and the strongest candidate for the
next piece of work. The open decision is whether collapsing reprints should change the
confidence score or only annotate it.

**Deployed, and what the deploy taught.** Shipped by the runbook's step 5 and verified against
the live site: the new build id is in the served HTML, twelve routes return 200, the glossary
and all 87 Chinese terms render, `http` redirects, `/_next/image` is 400, `/api/cron` is 401,
no `STRIPE_*` names appear on `/pricing`, and the server's database was untouched, with its
write-ahead log still advancing from the hourly refresh. The mirror PR into the public
monorepo is open, not merged.

Two defects in the runbook itself, found by following it and now fixed in "Deploying an
update". **Its rsync shortcut omitted the exclusions that keep the local database out** —
copied as written it would have shipped the corpus and a real user row's email and password
hash; the bundle checked before shipping did contain both that file and a macOS binary, exactly
as step 5 warns, and only the exclusions kept them off the server. **Its restart line could not
run**: `kautilya` is a service user with no sudo, so the restart runs as root. A dry run
(`-n --itemize-changes`) showing zero database or `darwin` paths is the check worth keeping
before any first transfer.

## Reprint collapse — built, merged and DEPLOYED (2026-09-19 evening)

Built on the branch `reprint-collapse` (a spec, a plan and seven commits), then — after Josh saw
the shift below and approved it — fast-forwarded into `main` and deployed the same evening. 569
tests, `tsc --noEmit` clean, verified against a real production build and then against the live
site. It deliberately lowers some scores, which is why Josh saw the shift first. Design:
`docs/specs/2026-09-19-reprint-collapse-design.md`; plan: `docs/plans/2026-09-19-reprint-collapse.md`.

**What it does.** A wire story printed by several outlets now counts once in EVERY signal that
rewards diversity — outlet count, ownership mix, country spread — not only the outlet count.
`lib/verify/reprints.ts` groups articles into families of near-identical headlines (0.8 overlap
after removing an outlet suffix and section label, figures must agree, minimum four words or
six Han characters); `scoreConfidence` reads one representative per family, except the
contradiction check, which still reads the whole cluster. The event page groups its evidence list
with the same function, so page and score cannot disagree, and a fold animation shuts each
family's reprints into a native `<details>` as it scrolls into view. No schema change: events
rebuild from articles on every ingest, so scores move on the first hourly refresh after a deploy.

**The shift, measured on the local corpus** (`npm run reprints:shift`, read-only): 4,267 events;
418 contain reprints; **155 change score (3.6%)**, by a median of 7 points, p90 18, max 35; no
event rises; 53 change band (31 Limited → Single report, 16 Corroborated → Limited, 5 Well →
Corroborated, 1 Corroborated → Single report); **"corroborated" (≥ 50) falls 262 → 245**; the
"single source" flag rises 3,468 → 3,567. The check that matters most: **events with no reprints
score exactly as before — 0 unexplained changes.** The biggest drops are official ministry
statements republished by a dozen portals, the case this exists for.

**Three things this build taught.**

1. **Read a sample, not just the totals.** The report prints an evenly spaced sample of the
   families it collapsed. The first one showed a daily VOA Chinese broadcast titled by its date
   collapsing into the next day's, because set overlap alone scores "… 9月3日" against "… 9月4日"
   above 0.86 — and "4 missiles" against "5 missiles" at 1.0. The fix is a rule: reprints carry
   identical figures. Aggregates would never have shown it.
2. **I leaked the domain into my own plan.** The plan's "run the leak scan" line contained the scan
   pattern, and the pattern names the domain. Caught by the scan itself, and repaired BEFORE any
   push: the one unpushed commit was dropped and recreated, and the feature branch rebased onto
   it, so no pushed history ever held it. **The pattern list now lives outside the repo, in
   `~/.claude/kautilya-leak-patterns.txt`**: run `git grep -n -i -E -f` on that file. A scan
   command written into a tracked file defeats itself.
3. **A copied database shows OLD scores until it is re-clustered**, because events store the score
   computed at their last ingest. Verifying the new panel text meant re-running only the
   clustering step against the copy. The same is true on the server after a deploy: scores move
   at the first ingest, not at restart.

**Verified in a real browser.** A fold caught mid-animation at 250px between 348px and closed,
resting closed with every inline style removed; folds below the viewport stay open until seen;
opening one by hand shows its natural height; no horizontal overflow at 375px; the confidence
panel reads "9 independent outlets of 21 reporting. 12 outlets reprinted a report already
counted." (62 → 57 on a widely reported story; 40 → 5 on a ministry statement reprinted by
seven portals).

**Deliberately not caught, and said so on `/methodology`:** rewritten wire copy and translated
copy, so the correction is a floor. Families of one outlet under one headline (a video beside
its article, daily programme titles) collapse too but are labelled "More from <outlet> under the
same headline", never "also printed by". The `timeout` command does not exist on macOS.

**Deployed, and verified on the live site.** Shipped by the runbook's step 5, the dry run first
(zero database or macOS paths in the transfer; both known traps were again in the bundle), the
restart as root. The build id is in the served HTML, twelve routes return 200, and every runbook
probe passes; the server's database is untouched. Scores only move at an ingest, so the hourly
job's exact command was run once by hand — 73 feeds, 71 ok (the same two datacenter 403s), 1,276
events in 9.8 s — and then the live corpus showed the new scoring: 18 of 80 sampled events carry
folded families, and a panel reads "25 independent outlets of 36 reporting. 5 outlets reprinted a
report already counted." In a real browser on the live site a fold went from 77px pinned open, to
46px at 250 ms, to closed with its styles removed by 900 ms.

**A note for the next burst test.** Requesting the live site rapidly (about 60 requests a minute
from one address) produced occasional connect timeouts — code 000 with a connect time of exactly
zero, so the connection never started — on a static icon as often as on an event page, while the
app answered 200 of 200 from inside the server. It is throttling of a rapid test, not the app.
Test bursts from inside the server (`ssh` and `curl` the loopback), or pace them.

To re-measure the shift against the live corpus, restore a nightly backup locally and run
`npm run reprints:shift` with `KAUTILYA_DB` pointed at it; the standalone server carries no
scripts. The backup holds accounts, so keep it off shared storage and delete it afterwards.

## Whose formula is it? — built, merged and DEPLOYED (2026-09-20)

Built on the branch `ladder-speaker` (a spec, a plan and five commits), then — at Josh's instruction —
fast-forwarded into `main` and deployed. 624 tests, `tsc --noEmit` clean, verified against a real
production build and then against the live site. It lowers numbers Josh already watches. Design:
`docs/specs/2026-09-19-ladder-speaker-design.md`; plan: `docs/plans/2026-09-19-ladder-speaker.md`.
This is Stage 1 of the two-stage ladder-timeline plan he approved ("A approved"); the evidence-trail
timeline itself is Stage 2 and gets its own spec after this ships.

**The flaw.** The ladder detector matches formula text whatever the speaker, yet the site labelled
every hit an "official PRC formula" in about fifteen places. Of the 47 rung-bearing headlines in the
90-day corpus, 17 are other governments using the same language — India and Pakistan protesting each
other, Vietnam, Russia to Japan, France to Iran — plus 3 that cannot be told. The single India-China
hit was India lodging representations with China, and the test alert email of 2026-09-19, "IND — PAK
moved to rung 8", was not a Beijing event. No real subscriber had received a server alert.

**The fix.** `lib/lang/speaker.ts` reads the headline's grammar: the nearest subject marker before the
formula, dropping the party being addressed (after 向 对 就 准, and verbs of address such as 谴责),
ignoring markers after the formula, reading a possessive directly before it ("遭到中国的坚决反对"), and
refusing to guess — a bare ministry after another state's name, or no marker at all, is `unclear`.
An article keeps its raw rung and gains `ladderSpeaker`; **an event's ladder now comes from Beijing's
articles only**, so the board and dashboard stats, China Watch, dyad pages, event badges, Ask and the
alert emails all become truthful without touching their own code. Escalation scoring is unchanged: an
India-Pakistan protest still counts as tension. On an event page another party's formula reads
"rung 8 · not Beijing", an unattributed one "speaker unclear"; `/methodology` says how and what the
method cannot see.

**The shift, measured on the local corpus** (`npm run ladder:shift`, read-only): of 47 hits, **27 are
Beijing's, 17 another party's, 3 unclear**. Events carrying a ladder fall **37 → 20**, none change
rung, and the board's "PRC ladder hits" reads 16 where it read 32 this morning. Against the
hand-labelled fixture Beijing is recognised on 27 of 29, no headline is called Beijing's that is not,
and no real Beijing formula is called another party's. Two real Beijing statements are left `unclear`
(a formula-first headline with no subject before it, and a bare ministry answering a US tariff) —
recall lost on purpose, and printed in the report.

**Four things this build taught.**

1. **The fixture is the whole hit set, so it is also the training set.** A passing score proves less
   than it seems. The only unseen sample is 4 headlines from the live server (4 of 4 agree), which is
   thin and is said so. New cases belong in `LIVE_FIXTURE` whenever the audit turns one up.
2. **Read the audit; my own labels were wrong.** The report prints every excluded headline in full.
   Reading it found one the rule called another party's that was Beijing: a VOA piece on Taiwan's vice
   president whose snippet says her trip "遭到中国的坚决反对" and that China lodged representations. I had
   labelled it from the title alone, so the fixture gate had passed on a wrong label. Both were fixed:
   29 Beijing formulae rather than 28, and the rule now reads that possessive.
3. **An ingest only re-analyses rows it re-fetches.** Feeds reach back seven days, so rows older than
   that keep their old analysis forever. `ladderPatches` and `updateLadders` back-fill the speaker on
   stored rows inside the ingest's existing re-evaluation, or every older event's ladder would have read
   as unclear.
4. **The `analyse-route` test is a latent flake.** Under the full suite its file takes 4.9-6.6 s on both
   `main` and this branch against vitest's 5 s limit, and it failed once right after a restart. Not
   caused by this work; flagged as its own task. **Fixed 2026-09-20** (`b58e1a2`): the file now sets a
   20 s `testTimeout` with `vi.setConfig`; the file takes ~2 s in the full suite.

**Verified in a real browser.** An India-Pakistan event shows no ladder gauge and two article rows reading
"rung 8 · not Beijing"; a Beijing event keeps its gauge and plain rung badges; `/china` and `/methodology`
load and carry the new text. A database copy was back-filled and re-clustered the way the first ingest
after a deploy would, giving the same 20 events with a ladder the report predicted.

**Deployed, and verified on the live site.** Shipped by the runbook after a dry run showing no database,
macOS-binary or duplicate-named file in the transfer. The service came up in 187 ms; the release directory
holds no database; ten routes return 200 and every runbook probe passes; the server's database is intact
and the migration added `ladder_speaker`. Scores and ladders only move at an ingest, so the hourly job's
exact command was run once by hand (73 feeds, 71 ok — the same two datacenter 403s). It back-filled the
speaker on the server's 12 rung-bearing rows — 4 Beijing, 8 another party's (India-Pakistan five times,
Russia-Japan, Pakistan to India, Hong Kong's government answering US lawmakers), all of which read right —
and left 4 events carrying a ladder. Live: the India-Pakistan event has no ladder gauge and its article
rows read "not Beijing"; a Beijing event keeps its gauge and plain rung badges; the board's "PRC ladder
hits" reads 4; `/methodology` carries the new paragraph.

**THE DESKTOP IS ICLOUD-SYNCED, AND IT CORRUPTS THE WORKING TREE.** `FXICloudDriveDesktop` is on, and this
repository lives under `~/Desktop`. iCloud makes " 2" and " 3" conflict copies and restores older versions
of files. Seen this session: a deleted `components/MarkEntered.tsx` came back and broke the test that guards
its absence; `.next/` filled with `* 2.ts`, `* 3.js` duplicates, which made `tsc` fail with duplicate-identifier
errors; and `.next/standalone/` held **`kautilya 2.db`, a stale copy of the local database with a real user
row**. The runbook's rsync excluded only the exact name `kautilya.db`, so it would NOT have excluded that
file. Nothing shipped it. Countermeasures now standing: **deploy only from a freshly rebuilt `.next`**
(`rm -rf .next` first — the source itself was clean), exclude `*.db` and `*.db-*` in the rsync rather than one
filename, run the dry run and read it, and check the server afterwards for `* 2*` names and databases in the
release directory. The lasting fix is to move the repository out of the synced Desktop — Josh's call.

Read `npm run ladder:shift` weekly beside the roster audit: a wrong "other" hides a real Beijing formula
silently, and reading that list is what found the one wrong call so far.

## The ladder evidence trail — built, merged and DEPLOYED (2026-09-20)

Stage 2 of the two-stage plan Josh approved ("A approved"). Built on the branch `ladder-trail` from
`docs/specs/2026-09-20-ladder-trail-design.md` and `docs/plans/2026-09-20-ladder-trail.md`: six commits
(`b474dad` target rule, `7fb39c7` storage, `5c7da11` trail, `8d72061` chart, `62370e8` placement,
`a786a72` what the real build showed). 724 tests (was 624), `tsc --noEmit` clean.

**What it is.** China Watch has an "Evidence trail" section after "Official statement detections", and a
China dyad page (`/dyad/CHN-JPN`) has the same chart narrowed to one country, inside the paywall's
allowed branch. One row per country Beijing aimed a formula at; one dot per day at that day's highest
rung, reprints folded; a ring on a rung higher than any earlier dot in the row (the row's first dot is
never ringed). Headlines whose target the grammar cannot settle go in a "target not stated" row. Under
the chart, always in the page, is a table of every dated headline behind every dot — the chart is a
picture of it. Nothing is a line: no dot means no formula found in a headline, not calm.

**The rule that names the target** (`lib/lang/target.ts`, stored as `articles.ladder_target`, back-filled by
the ingest like the speaker). Steps, first that finds one state decides, two different states → `null`:
a pair named with Beijing; a state introduced by 向/对/就/召 or written 日方 in Beijing's own clause; the
state an embassy sits in; a state named before Beijing's subject (the act being answered); a state
named after the formula; a named official's home state, only when no state is named at all. Never
China, never the EU. **Read `npm run ladder:shift`** — its new section lists every resolved target and
every unresolved headline in full.

**The numbers, local 90-day corpus.** 27 Beijing-attributed hits: **22 resolved** (Japan 10, South Korea
4, Philippines 4, United States 4), **5 left unstated on purpose**: the two 萧美琴 headlines (Taiwan and
the EU/Italy), the Anthropic report (a company), the Korea-and-Taiwan Biennale item, and the US-and-Iran
sanctions item (the answer is to the US, but the grammar cannot say so). Zero wrong on the hand-labelled
fixture — which is the whole hit set and so also what the rule was shaped on. The real held-out test is
the live corpus as it fills: after a few weeks, restore a nightly backup and read `ladder:shift`.

**What the real build showed** (production build, standalone server on a scratch copy of the DB, driven
from the Browser pane). Three defects no unit test could see, all fixed in `a786a72`, plus one more:
1. **Neighbouring dots took each other's clicks.** Days are ~9 px apart on a desktop axis (3 px on a
   phone); dots were 9-22 px with 24 px click targets, so a click on the centre of 4 of 15 dots opened the
   next day's event. Now 8-16 px, the target is the dot and never wider than two days of axis (taken from
   the real window length), and a halo separates overlapping dots: 15 of 15 reach themselves. **The spec
   said 24 px targets; that was wrong for a 90-day axis.** On a phone adjacent days still merge; the
   table's text links are the way in there, and the copy says so.
2. **The new-high ring was visual only.** Now also in each dot's accessible label and in the table.
3. **"Collecting since 22 Jun" was false** once the 90-day cap moved the window past the corpus's real
   start (20 Jun). The trail now carries `capped` and says "Showing the last 90 days."
4. **The oldest dots had no event link**, because `corpus()` holds only the newest 4,000 events and the
   local DB has 4,267: 11 of 15 dots linked. Now looked up directly (`eventIdsByArticle`): 15 of 15.
Also found: `toLocaleDateString('en-GB')` writes September "Sept" on this Node, so day labels come from a
fixed month table, not Intl (the server and a laptop could otherwise disagree).

**Also checked, and fine.** Reveal lifecycle (hydrated; dots held at `scale(0)`; on scroll `scale(1)`,
staggered 0-0.63 s). 375 px: no sideways page scroll, labels above lanes, the table scrolls inside its own
box. `/dyad/CHN-JPN` one row (5 dots, 10 headlines); `/dyad/IND-PAK` none; `/dyad/CHN-IND` says "No
Beijing formula about India found in headlines since 22 Jun." Contrast: dot vs lane 7.23:1, ring vs
panel 10.94:1; all three palettes are identical because the trail uses fixed tokens; the site is
dark-only. No console errors, no server errors.

**What was NOT verified — do this once.** **Nobody has looked at the pixels.** *(Done later the same day, live in real Chrome — see "Where 2026-09-20 continued"; a phone, real touch and reduced motion are still unseen.)* The Browser pane was
hidden, so screenshots came back blank at the wrong size and everything above is measured from the DOM
(geometry, hit-testing, computed styles), not seen. Reduced-motion could not be emulated (the markup test
and the hook's own early return cover it). Real touch was not tried. Open `/china` and scroll to
"Evidence trail". Separately: on the first load of a fresh browser profile, `/china` did a full
navigation to `/` by itself once; it did not repeat. Not investigated, and nothing here touches routing.

**Deployed, at Josh's instruction ("merge it and deploy"), and verified live.** `main` = `7bc21c5`
(a fast-forward of `ladder-trail` `21482c5` plus one fix), on the private repo. Two deploys, the current
build `VzKFTc2vPfm5P0p0wJTbm`. Before the first, a separately named backup on the server,
`/var/backups/kautilya/pre-ladder-trail-2026-09-20-0326.db.gz` (integrity ok; 2,618 articles, 1,385 events,
0 users). Then the hourly job's own command run once by hand as `kautilya`, which back-filled the live
rows: 68 of 73 feeds fetched (Indian Express and Dawn 403 as always, **and three YouTube channel feeds
404 — new; it was 71 of 73 — watch it, the channel ids may be stale**), 9 s.
Live afterwards: 13 rung-bearing articles, 5 Beijing's, **2 with a target** (Japan, United States, both
right on reading) and 3 unstated (the Anthropic report and the two 萧美琴 items, the same three the local
audit left unstated); the India-Pakistan hits are correctly "other". `/china` shows **4 dots in 3 rows**
and `/dyad/CHN-JPN` one; `/dyad/IND-PAK` no trail; `/dyad/CHN-IND` says "No Beijing formula about India
found in headlines since 10 Sep." Every runbook probe passes, the journal has no errors.

**What the live site showed that the local build could not** (fixed in `7bc21c5`, redeployed): the trail
said "Collecting since **3 Jul**", though ingesting began on 17 Sep. The corpus holds 98 articles dated
July and August, one to three a day — stragglers, not coverage — and `corpusSince()` started at the
earliest. That stretched the axis over 79 days and implied a formula-free July, when before about 10 Sep
nothing was collected systematically. The corpus now starts at the later of its earliest article and the
first ingest less the feeds' seven-day look-back: **10 Sep** live, unchanged for a corpus collected
throughout. **The spec's premise — that the corpus start is when collecting began — was wrong on live
data.** The live trail will fill in as the hourly job runs; by design it opens sparse.

**A deploy mistake, caught by a guard.** I put the rsync `--exclude` flags in a shell variable; zsh does
not word-split it, so rsync received one mangled pattern and the dry run planned to send `kautilya.db`
(with its user row) and the macOS binaries. The abort-unless-clean guard on the dry run stopped it
before anything was transferred. Pass each `--exclude` explicitly, as the runbook shows, and write the
guard with `|| true` (`grep -c` exits 1 on zero matches).

**The iCloud cost, measured.** The second clean build took over ten minutes; `fileproviderd` sat at ~98%
CPU uploading the fresh 600 MB `.next` from the synced Desktop. Moving the repo out of the synced
Desktop is still Josh's decision, and now has a second reason.

**Still open.** ~~Nobody has looked at the pixels of the live page~~ — done, see "Where 2026-09-20 continued". The public `AI_apps` mirror carries this work (PR #85, merged @ `e25ad77`); the
flaky-test merge (`b58e1a2`, six lines of a test file) is not mirrored yet — it needs its own small
PR whenever Josh wants one. The weekly audit now has a second list to read: `npm run ladder:shift` prints every resolved
target and every unstated headline — run it against a restored nightly backup once the live corpus has
weeks in it, since that is the held-out sample the rule has never seen.
The demo tour built on 2026-09-20 is a third thing waiting on a mirror: see "The demo tour — built".

## Where 2026-09-20 continued — the pixels, both audits, and two findings

Nothing was built. A pass to look at what shipped, run the two weekly audits, and chase the loose ends the
last section named. `main` unchanged in code; 724 tests as before.

**Both audits held their baselines.** Corpus 8,381 articles after an ingest (70 of 73 feeds; Indian Express
and Dawn answered locally this time). `roster:audit`: the same four flags as 2026-09-10 and nothing new —
Lula (noise: "ex-leader" is Bolsonaro), Xi (noise: he is the one doing the purging), Vietnam's 黎明兴 (still
one story, still no romanisation, still not guessed at), and the DPRK defence minister the corpus reports
dismissed (seat stays empty). Seats confirmed by the corpus 23 → 25; named 80, silent 42. `ladder:shift`:
51 rung-bearing articles, **29 Beijing's, 19 another party's, 3 unclear**; 24 of 29 Beijing formulae resolve
to a target (was 22 of 27) and the same five stay unstated. Every one of the 22 excluded headlines was read
and reads right; nothing was moved. That is a THIN held-out sample: rung-bearing headlines went from 47 to 51
since the rule was shaped, and the fixture is still the whole hit set it was built from. Four new cases that
all read right is a good sign and not a verdict — read the excluded list again next week.

**The three YouTube 404s are YouTube's, not ours.** `channel_id` was suspected stale. It is not: YouTube's own
channel and two others also return 404 from the same endpoint, the body is served by "YouTube RSS Feeds
server", a retry twenty seconds later is identical, and the channel *pages* return 200. Local ingest fails
exactly those three and nothing else. No change to `data/feeds.ts`. If it is still 404 in a week, that is when
to think about the feed rather than the IDs — re-run `curl -I` on a channel that certainly exists first.

**Somebody has now looked at the pixels of the evidence trail** — live, in real Chrome, at ~1000 px. It renders
as designed: three rows (United States, Japan, "target not stated"), a dated axis, the "Collecting since 10
Sep" caption, dots sized by rung, and the table under it with pinyin beneath each headline. Dot positions
match the audit's dates. Still not seen: a phone, real touch, and reduced motion.

**One finding, and it is about the data, not the drawing: a stale reprint from a junk site made a fresh dot.**
The live Japan row holds exactly one dot, 17 Sep, rung 8, and its headline is
`众赢国际手机版_体育_8·15日本政要又“拜鬼”…` from an outlet Google News labels 体坛. The prefix is
casino-style SEO, and "8·15" is the 15 August Yasukuni visits — so a page republished a month-old story and
the feed dated it 17 Sep. The formula in it is genuinely Beijing's; the DATE is not evidence of anything on
that day. It is the only spam-shaped headline among the 51 rung-bearing articles locally, so this is one case,
not a leak, but on the live site it is the whole basis of the Japan row. **Reprint collapse does not help** —
it folds duplicates of a story within a window, and this is an old story arriving new. Not fixed, because the
fix is a design choice: an outlet denylist (cheap, needs upkeep, and the prefix pattern is exactly what a
denylist is for) versus dating a formula by the event it names (a much larger job). Decide before the trail
has weeks in it, since every dot after this one inherits the question.
Still undecided; the demo tour built later that day guards against junk in its own selectors and does not
wait on it — see "The demo tour — built".

## The demo tour — built (2026-09-20)

Branch `demo-tour`, sixteen tasks: **not merged and not deployed.** `main` is untouched, the VPS is
untouched, and the public `AI_apps` mirror does not carry it. **939 tests** (915 when the code was
finished; the rest came with the fixes and the 2026-09-21 wave below), `tsc --noEmit` clean. Design:
`docs/specs/2026-09-20-demo-tour-design.md`; plan: `docs/plans/2026-09-20-demo-tour.md`.

**What it is.** `/demo`: eleven chapters that autoplay once and stop — the board, a Chinese headline
read syllable by syllable, reprint collapse and the confidence meter, the ladder and whose formula,
the evidence trail, the risk radar, a dyad, a walk through the network, Ask, what a reader can make
their own, and a closing button. Reached from a second splash button ("▶ Watch the 2-minute demo",
outlined, beside the filled "Enter →"), a plain `<a>`, so it is a full page load onto a chromeless
route. Scenes are the real components on the real corpus; a chapter with nothing to show is left out,
and one whose data is thin falls back to a captured example from `npm run demo:capture`.

**Watched in real Chrome, on a production build served from a scratch copy of the database** (ports
3199 full, 3198 empty — never the `kautilya.db` that `next build` traces into `.next/standalone`).
`/demo` is **506,903 B** and `/board` **643,787 B**: the tour renders all eleven scenes up front and is
still smaller than the board, so the spec's "stream the rest" risk did not materialise. `/demo` carries
no nav and no footer; the closing button is a plain anchor and lands on `/board` **with** its nav,
footer and the reader's palette.

**Every chapter was watched to its end.** Counters count from 0 to the real values (7,465 / 24 / 7 / 4,000;
radar 99; tension 99); 31 pinyin syllables arrive one at a time and the highlight sweeps 0 → 100% over
坚决反对; the reprint folds into its lead while the meter bars grow beside it; the gauge fills and both
headline badges land (rung 6 Beijing, "rung 8 · not Beijing"); the trail's ten dots draw staggered; the radar
scales out from its centre, visible from the first frame; the walked USA → CHN edge lights gold, and the
network chapter **does** appear on the live corpus; the question types and its reading appears ~1.2 s before
the answer; the star pops, the email slides in, the export control appears, the palette swaps and returns.
The dyad's defining-event markers sit on the right columns but do not animate — RevealOnView has no hook for
them, so that chapter's only motion is its count-up.

**Autoplay** ran **112.4 s** from hydration, every chapter within 100 ms of its registered length, and
**stopped** on chapter 11 without looping. Space freezes the bar and all ten map pulses and resumes them;
Home/End/←/→ work and Esc leaves for `/`; next on the last chapter, prev on the first and clicking the
current dot are true no-ops. Tab goes Close demo → ‹ → Play → ›, and the eight anchors inside the dyad
scene **cannot** take focus — the stage is `inert`. With Monochrome chosen on `/board`, chapter 10 swapped
to the accessible ramp at 7.4 s and returned to **monochrome** at 11.0 s, with
`localStorage['kautilya-palette']` read but never written. **Reduced motion** (emulated over CDP) opens
paused on chapter 1 with "Motion is off. Use ‹ and › to move between chapters.", every `.demo-*` animation
`none`, beats already at opacity 1, and the palette swap skipped. **With JavaScript really disabled**,
chapter 1 renders finished — coloured map, four real numbers, controls, dots, transcript. **At 375 px** no
chapter scrolls sideways, the radar fits, chapter 10 fits, the trail's headline table stays inside its own
`overflow-x-auto` behind a closed `<details>`, and the dots wrap to two rows (ten and one), still usable.
**On an empty corpus** `/demo` was 200 with eight chapters — risk, network and Ask left out, "Example
captured 20 Sep" on the other six. (Since 2026-09-21 it is seven: see "Re-watched after the last fixes".) The 体坛 casino headline of 17 Sep appears in neither chapter 2 nor
chapter 5. No console message of any kind on either port; both server logs clean.

**Three things were found by looking and fixed** (`2c388fe`, `47a6e9b`, `b879495`, each with a test): the
risk radar asked for size 340, at which `Radar` puts its MILI and INTE labels outside the viewBox and the
svg clipped them at every width (now 280, with a test pinning all six inside); the alert email's event link
is one unbroken token and lost its tail past the panel at 375 px (`break-words`); and the palette swatches
are the reader's live tokens, so a reduced-motion or no-JS reader saw their own ramp — grey under
Monochrome — captioned "Colour-blind-safe palette" (now "Choose a colour-blind-safe palette").

**One defect was found by looking, and is now FIXED** ("Demo tour: a scene entered while paused shows its
finished state instead of a frozen blank one"). Move to another chapter while the tour was paused and the new
scene's beats froze at their first keyframe, opacity 0: press Space then Home and the stage was blank but for
the caption. It was the mirror of the no-JS fix in `165d20d`. The stage now has three states, chosen by the
pure `stageFlags` in `lib/demo/stage.ts` and written by `DemoTour` as `data-paused` and `data-still`: paused or
tab-hidden MID-chapter (`elapsedMs > 0`) still freezes in place, and a scene entered while paused
(`elapsedMs === 0`, which includes the reduced-motion first paint) gets `data-still`, for which one CSS rule
shows every beat in its finished state, the same as the reduced-motion twin. From reading the CSS, not from
watching it: in the still state only the four `.demo-*` beat kinds are forced, so at this point the board's
continuous `.pulse-ring` flashpoint pulses (not `.demo-*`) were not frozen there and kept pulsing on a paused
tour. **Fixed the same day in `14dd8a6`**: `.demo-stage[data-still="true"] .pulse-ring` now gets
`animation-play-state: paused`, pinned by `tests/demo-css.test.ts` — the pulses do stop with everything else.

**Two known limitations, measured** (hard load, 6× CPU throttle): chapter 1's numbers paint at their final
server-rendered values for ~680 ms before hydration resets them to 0 to count up, and the beats start at that
paint while the clock starts at hydration, so the bar lags the scene by the same gap. Both are the price of the
no-JS fix; neither shows at full speed.

**What was NOT seen: a real phone, real touch, a screen reader.** Reduced motion and the JavaScript-disabled
render were emulated over CDP in a headless Chrome, not set by a person in their own browser. The watching ran
in a second Chrome over CDP because the extension's tab was occluded and `document.hidden` was true — the tour
paused itself, which is the hidden-tab rule working, but nothing animates in a background tab.

**Rules a maintainer must keep.** Every link out of `/demo` is a plain `<a>` — a guard test scans
`components/demo/**` for `next/link` imports, because a soft navigation off a chromeless route carries the
hidden chrome with it. Every `.demo-*` animation needs a reduced-motion twin; the CSS test counts them. A
component that animates itself on mount must not sit under a delayed `Beat`, or its effect finishes behind
opacity 0. `data/demo-fallbacks.ts` is generated by `npm run demo:capture`, never hand-edited — the capture
sanitises corpus links out of it.

**Re-watched after the last fixes (2026-09-21).** A clean production build (`.next` moved aside, static assets
copied, no ` 2`/` 3` conflict copies; the traced `.next/standalone/kautilya.db` present and never served), served
from scratch copies of the database on ports 3199 (full) and 3198 (empty), and driven in a visible, focused
Chrome over the chrome-devtools MCP. Seen: **paused mid-chapter freezes in place** (35 beat elements held identical
opacities over 1.2 s, `animation-play-state: paused`, `data-still` false); **pause, then →, lands on a finished
chapter 3** (`data-still="true"`, every beat at opacity 1, the reports, fold and meter all on screen, not blank);
**pause, then Home, gives a finished chapter 1**, and pressing Play from that still scene restarts its animation;
**the empty corpus now opens on the language chapter with seven chapters and no board scene in the DOM**; the full
corpus still has all eleven in the approved order (chapter 1 "The world, scored", chapter 6 "Six vectors of risk").
Console silent on both, both server logs clean, `kautilya-palette` never written, both servers stopped. **Not
re-watched:** the ask-scene timing change (unit-tested and mutation-checked, not looked at), and everything the
first pass did not see (a real phone, real touch, a screen reader).

**The 2026-09-21 wave**, four commits after `2f26cda`: the stage's third state (above), the empty-board chapter
omitted (`289104e`), the ask reading beat derived from the question's length so the longest country pair no longer
has a 20 ms margin over its own typing (`fe47399`), a scene-level pinyin timeline test, the "no delayed Beat"
guards rewritten as exact beat lists so a wrapper of ANY delay fails them rather than one named value, the stale
"splash is the only chromeless route" comments corrected, and the a11y h1 waiver for `/demo` now also asserts the
page renders `<DemoTour` (a first draft used `toContain` and passed on `<DemoTourX`; found by mutation, fixed with a
tag-boundary regex). It was done inline, without the independent whole-branch review the process calls for.

**Two decisions still open**, neither blocking: free versus billing (the tour reads `QUOTA_ENFORCED` and
`billing()`, so opening subscriptions turns the closing chapter's one button into two with no edit here), and
the junk-outlet denylist at ingest, which the tour guards against in its own selectors.

**Sound, added 2026-09-22** (`3c8024c`, on top of the wave above): a new toggle in the controls row, off by
default, that turns on a synthesized tanpura drone (`lib/demo/audio.ts` — Bhairavi's ratios, four sustained
tones voiced Sa-Pa-Sa-Sa′, a fixed seven-note pluck phrase) under spoken narration of each chapter's own
title and caption, read by the browser's own `speechSynthesis` — nothing said that is not already shown.
Every tone is an oscillator built from ratios at the moment it plays; nothing is fetched, sampled, or
downloaded, so nothing here can carry a copyright claim. `components/demo/DemoAudio.tsx` owns the
`AudioContext` and speech calls, ducks the drone under the voice, and mirrors the tour's pause/hidden-tab
state by pausing and resuming speech with it. No localStorage — resets every visit, like the palette.
973 tests, `tsc` clean. **Verified in a real running server**, not just tests: the button toggles with no
console errors across several enable/disable/navigate/pause cycles, `speechSynthesis.speaking` genuinely
flips true within 700 ms of enabling and again on every chapter change, and the five-control row does not
overflow at 375px. **Not yet seen:** whether it actually sounds good to a human ear, or how it reads on a
screen reader that also has its own speech going. This did not touch the independent whole-branch review
gap above, which is still open.

**One caveat worth writing down:** some platforms' `speechSynthesis` voices (Chrome's "Google" voices in
particular) are cloud-synthesized, so turning sound on can send the shown chapter caption — public copy
already on screen, after an explicit opt-in — to a speech backend. No app-side telemetry is added (the
spec's "no analytics on tour views" non-goal still holds), but that browser-level request is real and
outside this app's control.

**2026-09-23 — reviewed and fixed.** The independent whole-branch review found 0 Critical, 4 Important, 10
Minor across the full branch. All 4 Important and 3 of the Minors were fixed in one wave: the chapter-dot targets grew to a 24x28 hit area (WCAG 2.5.8) while keeping the visible 10px pill; the
stage now also gets `pointer-events-none` when inert, so a browser without `inert` support can't reach the
scene's links; the drone now suspends/resumes the AudioContext in step with speechSynthesis, so it actually
stops on pause, a hidden tab, or the tour reaching its end (before, only the voice stopped); the toggle's
start/teardown moved out of the `enabled` state updater into an effect, closing a Strict-Mode double-
AudioContext leak; voices are now cached via `voiceschanged` so the very first narration also gets the en-IN
preference; `aria-pressed` was dropped in favour of the site's existing flipping-label convention (matches
Play/Pause); and a new test (`tests/demo-audio.test.ts`) scans the source for any audio file, sample, or
third-party audio dependency, any `fetch`, and any `localStorage` use, making the copyright and no-tracking
claims self-enforcing rather than only a comment. Left open, all low-impact and explained in the review: the
dyad chapter's markers still don't animate, one pre-existing captured fallback string still embeds an event
id inside a URL (harmless — inert text on an inert stage), and narration is not reconciled against each
chapter's length (the longest captions can be cut off by the next chapter change — unverified by ear).


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
3. **DONE 2026-09-18 — sent one real alert email.** See "Alert mail is proven, finally"
   above for the two bugs found getting there (an unquoted `#`/space in the password truncated
   by Node's `--env-file` parser, then a one-character transcription slip between local and
   production). Josh confirmed the message actually arrived, not merely that the SMTP server
   accepted it. Still open: a send triggered by a genuine subscriber condition, from
   production's own process — see that section for exactly what remains unproven.

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