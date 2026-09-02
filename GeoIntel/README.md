# Kautilya — Geopolitical Risk Intelligence

Multilingual geopolitical event monitoring and security-risk analysis, with deliberate depth
on Chinese-language sources. English interface, India in focus, any state analysable.

Named for the author of the *Arthashastra* — and for his mandala theory of concentric
friend and rival states, which is literally the relationship graph the site renders.

---

## What it actually does

- **Ingests in the source language.** 25 direct publisher, broadcaster and institutional feeds plus 48
  aggregator queries across 11 language-region locales. Each watched relationship is
  queried *in the languages of its parties*, so the PRC framing of an LAC incident arrives
  alongside the Indian one rather than filtered through it. Five of the direct feeds are
  **Chinese-language services of independent and public broadcasters** (BBC, DW, RFI, VOA,
  NYT) — without them, Chinese-topic clusters contain only PRC-controlled outlets and can
  never score on ownership diversity however many of them repeat a story.
- **Reads Chinese as an analyst would.** A curated geopolitical glossary (100 terms) plus
  the **PRC official escalation ladder** — 13 set-piece formulae, from 表示关切 through
  严正交涉 and 坚决反制 up to 勿谓言之不预也, the phrase People's Daily carried before the
  1962 India war and the 1979 Vietnam war. The rung Beijing chooses carries more
  information than volume or tone, and no English-language monitor surfaces it.
- **Scores corroboration, never truth.** Every event carries a 0–100 score built from
  auditable signals — independent outlet count, ownership diversity, source-country and
  language spread, primary-source presence, outlet track record, contradiction penalty —
  each shown with its own evidence line.
- **Models risk.** Six-vector country risk indices and 90-day dyad tension series, with
  escalation gated by corroboration and decayed on a 14-day half-life.
- **Compares framings across languages (optional).** With an `ANTHROPIC_API_KEY` set, an
  event page can ask Claude to read the cluster's reports in their own languages and set
  out how each bloc frames the same event, what they agree on, what they contest, and what
  evidence would settle it. Cached per (model, event, article set). Everything else on the
  page is deterministic and runs with no key.
- **Exports.** CSV (UTF-8 with BOM, so Excel renders Chinese correctly) or JSON, for a
  single event's full source table or any filtered slice of the corpus.
- **Imagery and video.** Publisher feed images, chosen largest-first, and video from
  official broadcaster channels (Al Jazeera, DW, SCMP) where nothing loads until the
  reader presses play. Aggregator items carry no media at all, so roughly 8% of events
  have a picture — the layouts are built to look right without one, and nothing is
  generated or fabricated to fill the gap.
- **Freemium.** Browsing, filtering, search and methodology are free and unmetered.
  5 free deep analyses, then a paywall. Stripe behind env keys, mock checkout without them.

## Quick start

```bash
npm install
npm run ingest     # ~6s: fetches live feeds, analyses, clusters, scores
npm run dev        # http://localhost:3111
```

No API keys are required. The engine is fully deterministic and runs without any AI service.

| Command | Purpose |
|---|---|
| `npm run ingest` | Fetch, analyse, cluster and score. Re-run to refresh. |
| `npm run ingest -- --health` | Check every configured feed for real content. |
| `npm run stats` | Corpus quality report: freshness, cluster sizes, confidence distribution, ladder hits. |
| `npx tsx scripts/cluster-gates.ts` | What each clustering gate costs. Run before changing a threshold. |
| `npx tsx scripts/cluster-shape.ts` | Cluster sizes and the members behind the largest. Run after. |
| `KAUTILYA_AUTO_INGEST=1 npm run dev` | Refresh the corpus in the background every 30 minutes. |
| `npm test` | 61 unit tests over the analytical core. |
| `npm run build` | Production build. |

Scheduled refresh: `GET /api/cron` (set `CRON_SECRET`, required in production).

## Architecture

```
sources ─▶ ingest ─▶ lang ─▶ analyze ─▶ cluster ─▶ verify ─▶ risk ─▶ web
         (adapters) (script,  (actors,   (events)  (0-100 +   (indices)
                    glossary,  dyads,              evidence)
                    ladder)    domains)
```

Each stage is a typed module with its own tests, reading and writing rows rather than
calling the next stage directly — so any stage can be re-run over stored data without
re-fetching. Re-ingesting recomputes provenance and analysis for already-stored rows, so
a corrected source registry or lexicon repairs the existing corpus.

| Path | Contents |
|---|---|
| `data/` | Gazetteer, Chinese glossary + ladder, multilingual lexicon, source registry, feed/query matrix |
| `lib/lang/` | Script detection, glossary translation, escalation-ladder detection |
| `lib/ingest/` | Feed fetch/parse, enrichment, relevance gate, dedup, pipeline |
| `lib/analyze/` | Actor and hotspot extraction, dyads, escalation scoring, domain classification |
| `lib/verify/` | Event clustering (inverted index + union-find), corroboration scoring |
| `lib/risk/` | Country and dyad indices |
| `lib/llm/` | Optional Anthropic layer: framing comparison, schema, caching |
| `lib/db/` | `node:sqlite` storage — no native module to compile |
| `components/` | Hand-rolled SVG charts, world map, mandala, verification meter |

## Storage

`node:sqlite`, built into Node 24 — no native compilation, nothing to rebuild on deploy.
(`better-sqlite3`'s prebuilt binary aborts during GC teardown on this Node version.)
Database path defaults to `./kautilya.db`, override with `KAUTILYA_DB`.

## Configuration

Everything in `.env.example` is optional; the engine runs fully without any of it.

- `ANTHROPIC_API_KEY` — enables the cross-language framing comparison on event pages
  (`lib/llm/`). Absent, the panel says so and every other feature works unchanged.
  `KAUTILYA_LLM_MODEL` overrides the model (default `claude-opus-5`).

  > **Not verified against a live call.** This layer was written against the documented
  > API contract and is covered by tests for its schema, cache and disabled paths, but no
  > API key was available in the environment where it was built, so the request has never
  > actually been sent. Exercise it once against your own key before relying on it.
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` — live billing. Absent, checkout runs in mock mode.
- `CRON_SECRET` — protects the refresh endpoint. Required in production.

## Deploying

**Read this before choosing a host.** Storage is a SQLite file. That is a deliberate
trade — no native module, no external database, one file to back up — but it dictates
where this can run.

| Host | Works? | Why |
|---|---|---|
| VPS / bare metal / Fly.io / Railway / Render | **Yes** | Persistent disk; mount it and set `KAUTILYA_DB` |
| Docker anywhere | **Yes** | `docker compose up` with the bundled volume |
| **Vercel / Netlify / Cloudflare Workers** | **No** | Read-only, ephemeral filesystem. Ingest would report success and the data would vanish on the next cold start — a silent failure, not a crash |

To run on a serverless host you would need to replace `lib/db/` with a hosted database.
The rest of the codebase does not care: every stage reads and writes rows through that
one module.

### Docker

```bash
CRON_SECRET=$(openssl rand -hex 32) docker compose up --build
```

The bundled `refresher` service calls `/api/cron` hourly. The database lives on the
`kautilya-data` volume, never in the image layer.

> **Not verified.** Docker was not installed in the environment where this was built,
> so the Dockerfile and compose file are written but have never been executed. The
> standalone Node path below **was** tested and works.

### Standalone Node (verified)

```bash
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
KAUTILYA_DB=/var/lib/kautilya/kautilya.db PORT=3000 node .next/standalone/server.js
```

Boots in about 250 ms. Schedule refreshes with host cron:

```
0 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

`/api/cron` refuses to run unauthenticated when `NODE_ENV=production`, so set
`CRON_SECRET` or the endpoint returns 403.

## Security and accessibility

Both were audited rather than assumed, and both found real defects that are now fixed and
covered by tests (`tests/security.test.ts`).

- **Open redirect (fixed).** `/login?next=https://evil.example` sent the user off-site
  *after a successful sign-in* — the most convincing possible setup for a fake
  "session expired, re-enter your password" page. `safeRedirect()` now permits same-site
  paths only, and rejects protocol-relative, backslash, encoded-slash and control-character
  variants.
- **Reflected error text (fixed).** The login page echoed arbitrary `?error=` text into the
  UI, letting an attacker render their own copy inside a genuine page. Only known error
  codes render now.
- **Login throttling (added).** Eight failed attempts per account in fifteen minutes.
  Counts failures rather than attempts, so mistyping a password twice costs nothing; keyed
  per account rather than per IP, because an attacker controls their address far more
  easily than they control whose account they are attacking.
- **Contrast (fixed).** Measured every text colour against every background it can appear
  on. `--color-faint` was 3.0:1 — below WCAG AA — and it was used for the *smallest* text
  in the product: timestamps, captions, source metadata. The severe red was 2.9:1. There
  are now two severe reds: a deep one for fills, an accessible one for text. A test fails
  the build if any text colour drops below 4.5:1.
- **Colour is never the only encoding.** Escalation dots carry screen-reader labels, the
  world map has a spoken summary naming the highest-risk states and links to the same data
  as a sortable table, and timestamps are real `<time>` elements.
- **Keyboard focus.** `outline-none` on the inputs had removed the only affordance keyboard
  users had; a global `:focus-visible` ring restores it without affecting mouse users.

Not done: no penetration test, no formal screen-reader pass, no rate limiting on the
export or analysis endpoints beyond the usage quota.

## Asking it questions

`/ask` answers from the scored corpus rather than generating an answer. It resolves the
states, flashpoints, domains, ladder rungs, time windows and source languages named in a
question — 中国 and भारत included — and returns the matching events with their evidence.

It shows how it read your question. That is not decoration: pattern matching misreads
things, and without the reading an empty result looks the same whether nothing happened or
nothing was understood.

Signals that are facts are treated differently from signals that are guesses. States,
time, language and ladder rung filter hard. `domain` does not — it is a keyword tally that
falls back to `Diplomatic` for most of the corpus, so it narrows only when that leaves
something and says so when it stands down.

## Staying current

The corpus refreshes in one of three ways: `npm run ingest` by hand, the `/api/cron`
endpoint driven by an external scheduler, or the in-process loop enabled with
`KAUTILYA_AUTO_INGEST=1`.

Any open page keeps itself current regardless of which. It polls `/api/pulse` for the
corpus version once a minute and re-renders in place when that moves — no reload, no
socket, scroll position preserved. The header shows whether it is watching, because a page
that silently rewrites itself hides the one thing an analyst needs to know: how old the
reporting in front of them is.

The refresh interval has a **15-minute floor that cannot be overridden**, and auto-refresh
is off unless explicitly enabled. Each cycle fetches 73 real publisher and aggregator
feeds; that is other people's infrastructure.

## Limitations — read these

1. **Corroboration is not truth.** A widely repeated falsehood scores well; a correct
   exclusive scores low. Ownership and country diversity are a partial mitigation, not a cure.
2. **PRC domestic coverage is partial.** The MOFA and mod.gov.cn RSS endpoints return HTML
   maintenance pages, not feeds. Chinese material arrives via aggregator queries, which
   under-represent domestic-only outlets. Absence of signal is not absence of event.
3. **Lexicon scoring is shallow.** Keyword weights do not understand negation or
   hypotheticals — "rules out invasion" scores as escalatory.
4. **The ladder has a small sample.** Its top rung has been used a handful of times in
   seventy years. Detections are prompts to investigate, not predictions.
5. **Anonymous quota is bypassable.** Device-cookie metering is cleared by clearing cookies.
   Only account-bound metering is real enforcement. This is stated in the product too.
6. **Redistribution terms.** Publisher and aggregator terms of service govern commercial
   use of source material. Review them before charging subscribers.
7. **The corpus is a rolling window, not an archive.** Aggregator queries ask for the last
   seven days and stored articles are dropped after ninety, because Google News search
   ranks by relevance over all time rather than by recency — left unconstrained it returned
   results back to 2003, and a corpus spread across decades cannot corroborate itself. The
   consequence is that this system cannot answer historical questions; it reports what is
   being said now.
8. **A very large story divides by angle rather than sitting in one event.** Clustering
   admits a report only where it matches a share of the cluster, so a disaster covered from
   many directions separates — the dead and missing in one event, foreign nationals and
   relief in another. Each is separately corroborated, which is the intent, but a reader
   expecting one entry per incident will find several. Before changing any threshold in
   `lib/verify/cluster.ts`, run `npx tsx scripts/cluster-gates.ts`, then check both failure
   directions: the largest cluster (read its members, do not trust the size) and whether a
   known-large story has shattered. `tests/cohesion.test.ts` guards both.

Full detail, including the exact scoring weights, is at `/methodology` in the running app
and in `docs/specs/2026-08-29-kautilya-design.md`.
