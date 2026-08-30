# Where this project stands

**Last worked: 2026-08-30.** Everything below was verified, not assumed. Where something
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
| Tests | 147 passing (`npm test`) |
| Build | `npm run build` passes; standalone server verified |
| Corpus at last run | ~1,325 events from ~2,400 reports; median article age under a week |
| Feeds | 25 direct + 3 video + 48 aggregator queries = 73, all health-checked |

There is one real account in the local database (the one created while testing the
signup flow). It is only in this local file.

## What is done

The full product: multilingual ingestion, the Chinese glossary and PRC escalation-ladder
detector, corroboration scoring with per-signal evidence, six-vector country risk and
dyad tension, all nine pages, accounts with a 5-action free quota, Stripe behind env keys
with a working mock mode, CSV/JSON export, device-local watchlists, imagery and
click-to-play video, and the optional LLM framing layer.

Corpus freshness is bounded at both ends as of 2026-08-30: aggregator queries ask for the
last seven days (`QUERY_WINDOW_DAYS`) and stored articles are dropped after ninety
(`CORPUS_RETENTION_DAYS`, pinned to `TREND_SERIES_DAYS` so retention cannot starve the dyad
trend chart). `npm run stats` now leads with corpus age — a rising median there is that bug
coming back.

Design rationale is in `docs/specs/2026-08-29-kautilya-design.md`; the scoring weights and
every known limitation are on `/methodology` in the running app and in `README.md`.

## Three things that are NOT verified — read before relying on them

1. **The LLM layer has never made a live API call.** No `ANTHROPIC_API_KEY` existed in the
   build environment. Its schema, cache and disabled paths are tested; the request itself
   has never been sent. Exercise it once against a real key before trusting it.
2. **The Dockerfile has never been built.** Docker was not installed. The standalone Node
   path in `README.md` *was* tested end to end and works.
3. **No penetration test and no screen-reader pass.** The security and contrast work was
   audited and is covered by tests, but neither of those two exercises was done.

## One piece of housekeeping left

Commit `e3de7cc` contains a SQLite WAL blob holding the test account's email and bcrypt
hash — `.gitignore` originally missed the `-wal`/`-shm` sidecars. Nothing was exposed:
there is no remote and the repo has never been pushed. The sidecars are untracked now.
**Before ever adding a remote**, either scrub it:

```bash
git filter-branch --index-filter \
  'git rm --cached --ignore-unmatch kautilya.db-wal kautilya.db-shm' --prune-empty HEAD
```

or start a fresh history — the database is rebuildable, so nothing of value is lost.

## Where to go next, in the order I would do it

1. **Run the LLM layer once with a real key.** Still the only unproven part of the
   product, and now two features are waiting on it: event-page framing analysis, and the
   sentence translations that would supersede the dictionary gloss under every Chinese
   headline. `/ask` would also gain grounded prose over its deterministic results.
2. **Give clustering a cohesion rule** — see the section below. This is the live lead on
   corroboration and the most interesting problem left in the codebase.
3. **Legal review before charging anyone.** Publisher and aggregator terms of service
   govern commercial redistribution of this material.
4. Account-bound watchlists (they are device-local today) and email alerts on a
   ladder-rung jump would be the next genuinely useful features.

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

- **Bundled webfonts.** The app loads none, so Chinese rendering depends on the viewer's
  OS. Fine on macOS via PingFang SC; degrades on Windows and can be wrong on Linux. The
  plan was `next/font/google` self-hosting Noto Sans SC (202 unicode-range subsets, ~100-200KB
  per page, not the full 2.4MB) plus a `postinstall` that reports what was bundled.
- **Tooltips are invisible on touch.** The dense one-line rows carry pinyin in a `title`
  attribute, which never appears on iPad or iPhone.

## The clustering lead — read this before touching `lib/verify/cluster.ts`

Corroboration was diagnosed properly on 2026-08-30 and the intake half was fixed. What
remains is a real algorithmic problem, and the obvious fix for it is already known to fail.

**What was wrong and is now fixed.** Google News search ranks by relevance over all time,
not recency, and the queries carried no date constraint — so `台海 军演` returned a corpus
whose median item was 242 days old, every `Taiwan Strait PLA incursion` result was over a
month old, and the corpus spanned 23 years back to 2003. Two reports only group into one
event if they fall within 60 hours of each other, so that corpus could not corroborate
itself: adding feeds had never moved the number because it added more archive. Intake is
now pinned to seven days and storage to ninety. Corroboration depth went from a mean of
1.43 articles/event to 2.00 in the steady-state band, largest cluster 49 → 117.

**What is still wrong.** With time fixed, the binding constraint is the `domain` gate:
3,299 pairs agree on time, actors and text and are rejected purely because their domain
labels differ. That label is a keyword tally that silently falls back to `'Diplomatic'`
when nothing matches, so 59% of the corpus carries it by default rather than by evidence —
90% of those blocked pairs involve it, and one Nepal-Tibet flood was split across
Diplomatic and Military more than ten ways.

**Why the obvious fix fails.** Forgiving the mismatch when either label is a fallback
produced a single **601-article cluster** spanning 40 countries — Russia/Ukraine, a Kashmir
film festival, Trump's trade wars and a Korean dating show in one event. Requiring strong
textual evidence for those merges instead still gave 608. Both were reverted.
`docs/experiments/2026-08-30-domain-gate-failed.patch` holds the second attempt; the first
is the same patch minus the `!domainDisagrees &&` guard on the hotspot rule.

The reason is structural: clustering is union-find over pairwise similarity, which is
**single-link and transitive**, so one loose pair welds two clusters together. The domain
gate was never a brake by design — it was holding average node degree below the percolation
threshold. Any relaxation in isolation tips it over, so no threshold tweak will work.

The fix has to be a **cohesion rule**: require a joining article to match the cluster it is
joining — a centroid, or a minimum share of existing members — rather than any single member.
That is a genuine redesign of `clusterArticles`, not a parameter change.

**Measure before and after, always.** `npx tsx scripts/cluster-gates.ts` reports what each
gate costs (`related()` short-circuits, so its own rejections tell you nothing). Then check
the largest cluster: the mean articles/event *improved* to 2.02 while the output was
collapsing into that 601-item blob, so the headline metric will lie to you. Read the
members.