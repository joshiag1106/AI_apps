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
- **Maps the network.** Every state that shares a clustered event with another is a node;
  the line between them is their accumulated friction. Eight structural measures —
  brokerage, contagion exposure, reach, entanglement, core depth and conflict clustering
  among them — all computed on the whole graph, never on the ten neighbours being drawn.
  Drilldown is URL-driven, so a walk through the network is a link you can send.
- **Puts people on the map.** A curated roster of senior officials, matched in the languages
  outlets actually print, linked to the states they are named alongside. Their own country is
  drawn but not counted, so the figures read as cross-border activity rather than as who
  governs a busy country.
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
| `npm run llm:check` | Send one real analysis and report what it cost. Needs a key; charges nothing without one. |
| `npm run alerts:check -- --to=you@example.com` | Send one real alert email. Recipient must be explicit; sends nothing without a key. |
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

For local development everything in `.env.example` is optional; the engine runs fully
without any of it. A production deployment needs three settings — see
[What production needs](#what-production-needs).

- `ANTHROPIC_API_KEY` — enables the cross-language framing comparison on event pages
  (`lib/llm/`). Absent, the panel says so and every other feature works unchanged.
  `KAUTILYA_LLM_MODEL` overrides the model (default `claude-opus-5`). It has run live
  (2026-09-02, on Sonnet 5), and `npm run llm:check` sends one request and reports what it
  cost. It is the only feature that spends money per click, so it needs a signed-in
  account, and the key's workspace should carry a spend limit.
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` — live billing; both are needed. Without them a
  development server runs checkout in test mode, activating Pro without payment, and
  production closes checkout and says subscriptions are not open yet (`lib/billing.ts`).
- `KAUTILYA_ORIGIN`, `KAUTILYA_DB`, `CRON_SECRET` — required in production.

## Deploying

**Read this before choosing a host.** Storage is a SQLite file. That is a deliberate
trade — no native module, no external database, one file to back up — but it dictates
where this can run.

| Host | Works? | Why |
|---|---|---|
| VPS / bare metal / Fly.io / Railway / Render | **Yes** | Persistent disk; mount it and set `KAUTILYA_DB` |
| Managed hosts that replace the app folder on every deploy | **Only with care** | The database must live outside that folder, or each deploy deletes every account |
| **Vercel / Netlify / Cloudflare Workers** | **No** | Read-only, ephemeral filesystem. Ingest would report success and the data would vanish on the next cold start — a silent failure, not a crash |

There is no Dockerfile. An earlier version of this section described one, and a compose
file, that were never committed; the standalone path below is the one that exists.

To run on a serverless host you would need to replace `lib/db/` with a hosted database.
The rest of the codebase does not care: every stage reads and writes rows through that
one module.

### What production needs

Three settings, each of which fails in its own way without it:

- **`KAUTILYA_ORIGIN`** — the address readers use, e.g. `https://example.com`. Behind a
  reverse proxy, Next builds a route handler's `req.url` from the server's own listening
  address, so checkout redirects and alert-mail links cannot be taken from the request.
  They come from here, and in production the server throws rather than guess
  (`lib/site.ts`).
- **`KAUTILYA_DB`** — an absolute path outside the build. The standalone server changes
  directory into `.next/standalone` at startup, so the default `./kautilya.db` lands in the
  folder `npm run build` replaces. In production that file holds accounts, plans and
  watchlists as well as the rebuildable corpus, so it is not a cache there: back it up.
- **`CRON_SECRET`** — `/api/cron` returns 403 in production without it.

Refresh the corpus one way: host cron calling `/api/cron`, or `KAUTILYA_AUTO_INGEST=1` in
the server process — not both, since nothing stops the two overlapping. Serve it over
HTTPS: session cookies are `secure` in production, so over plain HTTP a sign-in never
sticks.

### Standalone Node (verified)

```bash
npm run build
cp -r .next/static .next/standalone/.next/static
KAUTILYA_ORIGIN=https://example.com KAUTILYA_DB=/var/lib/kautilya/kautilya.db \
  CRON_SECRET=… HOSTNAME=127.0.0.1 PORT=3000 node .next/standalone/server.js
```

Boots in about 250 ms. `HOSTNAME=127.0.0.1` keeps it reachable only through the reverse
proxy in front of it. Schedule refreshes with host cron:

```
0 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron
```

`npm run ingest` works on the server too, but it reads only what its shell exports, not
the server's environment. Export the same settings first: with mail credentials and no
`KAUTILYA_ORIGIN`, its alerts would link to localhost.

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

- **Redirects to localhost (fixed).** Checkout built its redirects from `req.url`, which
  behind a reverse proxy is the server's own address — a reader returning from payment
  would have landed on `localhost`. Redirects and mail links now come from
  `KAUTILYA_ORIGIN`.
- **Free Pro in production (fixed).** With no Stripe keys, checkout's test mode activated
  Pro for anyone who pressed the button, and the pricing page named the server's settings
  to every visitor. Test mode is now development-only.
- **Open image proxy (fixed).** `next.config.mjs` allowed `/_next/image` to fetch from any
  host and re-serve the result from this domain. Nothing used it; it is gone.
- **The paid call needs an account.** The anonymous allowance is keyed on a device cookie
  that a script simply does not store, so it bounded nothing on the one endpoint that
  spends money per click.

Not done: no penetration test, no formal screen-reader pass, no rate limiting beyond the
usage quota — which for anonymous readers is advisory, for the reason just given.

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

## Ladder alerts

A Desk Pro reader who has opted in on `/account` gets an email when a file on their
watchlist moves **up** the PRC official escalation ladder — not when it stays where it is,
because Beijing repeats a formula for weeks and an alert on every repetition is one you
learn to ignore. One message per refresh however many files moved, each linking to the
event that justifies it.

Delivery is SMTP, through `nodemailer`. Without `SMTP_USER` and `SMTP_PASS` nothing is
sent and the ingest logs what it would have delivered, so the pipeline is exercisable
without mailing anyone. `SMTP_HOST` and `SMTP_PORT` default to Gmail's.

An HTTP provider came first and was replaced. Resend, like every service of that shape,
sends only from a domain you have verified in its dashboard — which a personal address can
never be, so the delivery half stayed unprovable for as long as it was in place. SMTP
authenticates as a mailbox that already exists, which is the whole reason it works here.
Which host to use follows from where the sending address's mail is actually hosted, which
is a question for its MX records rather than its domain name — an address on your own
domain is very often relayed by whoever hosts the domain rather than by Google. On
Hostinger it is `smtp.hostinger.com` and the mailbox's own hPanel password; on Gmail it is
`smtp.gmail.com` and a 16-character App Password from `myaccount.google.com/apppasswords`,
which exists only once 2-Step Verification is on. Sending from a domain you control is
also what makes the alerts mailable to a reader rather than merely provable, since the
domain carries its own SPF record.

Alerts are off until a reader turns them on. Signing up for an account is not consent to
be emailed.

## The network of states

`/network/[iso]` draws one state and its strongest connections. A node is a state, a line
is the friction across every clustered event the two appeared in together, and thickness
is that friction. Dashed lines mark the de-escalatory signal, which rests on roughly 2% of
the corpus and is therefore an overlay rather than a measure — it is not a map of
alliances.

An edge is a **reporting** relationship, not a diplomatic one. Two states named in the
same article are not necessarily interacting, and the engine does not pretend to know
which. Friction reuses `impact()`, the same function behind the dyad tension scores, so
the network and the dyad pages cannot tell you different things about the same pair.

Walking it is ordinary navigation. Every neighbour is a link, the trail rides in the query
string, and the page is server-rendered — so the back button is the undo, a walk is a URL
you can paste to someone, and there is no graph state to hydrate or lose.

The fan-out is capped at ten neighbours by default, `?n=` to change it. That cap is the
reason the module exists: the busiest state in the corpus is connected to 59 others, so an
uncapped neighbourhood is very nearly the whole network and the first click shows a
hairball. What the cap omits is always counted on the page rather than
silently dropped.

The picture is ForceAtlas2, seeded deterministically: neighbours that are also in dispute
with each other settle into the same region, so an entangled theatre looks different from
separate fronts at a glance. It seeds from a fixed ring rather than random positions and
runs a fixed number of steps, so the same corpus always draws the same picture — two
screenshots are comparable. Angle carries no meaning; size and thickness carry the weight.

A credit is spent where a walk *begins*, not per state. Stepping from CHN to USA to IRN
costs one; coming back tomorrow and starting fresh from IND costs another. The trail in the
query string is what identifies the walk, so this is soft in the same way the device cookie
is soft — it prices ordinary reading correctly and does not pretend to be enforcement.

Every measure beside the drawing — Connections, Total friction, Brokerage, Contagion
exposure, Reach, Entanglement, Core depth, Conflict cluster — is computed on the **whole
graph, never on the neighbourhood being drawn**. The denominator in a rank is every state
in the network, not the ten on screen. This is the constraint most likely to be broken by a
well-meaning optimisation that measures what is visible, so it is pinned by a test rather
than left to care.

Conflict clusters group states most embroiled **with each other**. They are mutual
antagonists, not blocs. The corpus carries almost no cooperative signal — 44 of 2,435
events score negative escalation — so there is nothing here from which an alliance could
honestly be inferred.

## People in the network

`/person` lists the roster; `/person/[id]` draws one official and both the states and the
other officials they are named alongside. An edge is a reporting relationship — the two
appeared in the same clustered event — not a claim that either acted toward the other.

Coverage is exactly the roster, which is hand-written and dated. An unlisted official is
invisible, so an absence here is not evidence of non-involvement, and the index says outright
which figures the corpus currently has nothing on rather than letting you find out one
metered click at a time. `npm run backfill:people` re-scans stored articles, which is needed
after adding a name: the ingest only analyses articles it fetches, and articles age out of
feeds.

**Two officials are linked when they were named in the same clustered event**, and the states
those events concerned are carried on the edge — accumulated across every contributing event,
not sampled from the strongest few, with the three most frequent shown and the rest counted.

A line between two people is **not a meeting**. It is not a call, an agreement or a dispute,
and the engine cannot tell which. No edge carries an action, and that limit is firmer than the
edge count ever was: a headline naming two figures usually points its verb at a third party.
*"Zelensky warns airlines Russian skies not safe"* names Zelensky and Putin, so the two share a
line here — but Zelensky warned airlines, and the two did not speak. Labelling that edge from
its verb would assert *Zelensky warned Putin*, which is not a thin signal but a confidently
wrong one. Resolving a verb to its object needs the sentence, which needs article bodies —
a licensing question before it is an engineering one. The states on an edge are likewise where
the reporting was *set*, not where anyone stood.

All eight state measures now carry over. Entanglement and conflict clusters were absent until
2026-09-06, and not by oversight: both count triangles, and a bipartite person-to-state graph
has none. Mixing the graph gave that up, so both mean something again.

This layer is thin beside the state graph — person-to-person ties rest on the small share of
events naming two or more listed officials — and coverage is bounded by the roster, so a
missing line means "not both named in one event", never "no relationship".

Until 2026-09-06 this section said there were no person-to-person edges at all, on a measured
1% of articles. That figure was taken against a **twelve-name** roster and never redone when
the roster reached 120. Re-measured, it is 128 events and 73 distinct pairs. A measurement is
scoped to the inputs it was taken with, and nothing in the repository knew the difference.

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
7. **The Chinese typeface is bundled, and it is not small.** Chinese rendering used to
   depend on the reader's operating system — acceptable on macOS via PingFang SC, worse on
   Windows, and on Linux frequently a fallback with the wrong regional glyph forms. Noto
   Sans SC is now self-hosted, so every reader sees the same characters and nothing is
   requested from a third party. The cost is real: split across ~200 unicode ranges a
   reader fetches only what a page uses, measured at ~619 KB for the methodology tables and
   ~1.4 MB for a page dense with Chinese headlines, cached after the first visit. Two
   weights are bundled because Chinese headings render semibold; dropping to one would
   halve it at the cost of synthetic bold, which CJK tolerates badly.
8. **The corpus is a rolling window, not an archive.** Aggregator queries ask for the last
   seven days and stored articles are dropped after ninety, because Google News search
   ranks by relevance over all time rather than by recency — left unconstrained it returned
   results back to 2003, and a corpus spread across decades cannot corroborate itself. The
   consequence is that this system cannot answer historical questions; it reports what is
   being said now.
9. **A very large story divides by angle rather than sitting in one event.** Clustering
   admits a report only where it matches a share of the cluster, so a disaster covered from
   many directions separates — the dead and missing in one event, foreign nationals and
   relief in another. Each is separately corroborated, which is the intent, but a reader
   expecting one entry per incident will find several. Before changing any threshold in
   `lib/verify/cluster.ts`, run `npx tsx scripts/cluster-gates.ts`, then check both failure
   directions: the largest cluster (read its members, do not trust the size) and whether a
   known-large story has shattered. `tests/cohesion.test.ts` guards both.

Full detail, including the exact scoring weights, is at `/methodology` in the running app
and in `docs/specs/2026-08-29-kautilya-design.md`.
