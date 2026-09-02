# Where this project stands

**Last worked: 2026-09-02.** Everything below was verified, not assumed. Where something
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
| Tests | 151 passing (`npm test`) |
| Build | `npm run build` passes; standalone server verified |
| Corpus at last run | ~2,020 events from ~3,380 reports; median article age under a week |
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
2. **Bundle webfonts.** The app loads none, so Chinese rendering depends on the viewer's
   OS — fine on macOS via PingFang SC, degraded on Windows, wrong on some Linux. Designed
   but not built; see the bench items below.
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