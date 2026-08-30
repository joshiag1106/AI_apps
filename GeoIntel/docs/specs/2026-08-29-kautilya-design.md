# Kautilya — Geopolitical Risk Intelligence
**Design spec — 2026-08-29**

## Purpose
A multilingual geopolitical event-monitoring and security-risk analysis platform for
professional analysts. Ingests news and primary-source statements in their **original
languages** — with deliberate depth on Chinese — scores each event for corroboration
and provenance, and renders risk and relationship analytics through an English interface.

Vantage point is India: the default watchboard, the seeded dyads, and the depth of the
Chinese-language layer all reflect an Indian strategic-analysis audience. The engine
itself is country-agnostic and any state or pair of states can be analysed.

## Non-goals
- Determining ground truth. The engine measures **corroboration and provenance**, never
  veracity. No TRUE/FALSE verdict is rendered anywhere in the product.
- Predicting conflict. Indices describe observable signal density and rhetoric, not outcomes.
- Replacing primary-source reading. Every claim links back to its sources.

## Architecture

    sources ──▶ ingest ──▶ lang ──▶ analyze ──▶ cluster ──▶ verify ──▶ risk ──▶ web
              (adapters)  (detect,  (entities,  (events)   (confidence) (indices)
                          glossary,  dyads,
                          ladder)    domains)

Each stage is a pure module with a typed interface and its own tests. Storage is SQLite;
every stage reads and writes rows rather than calling the next stage directly, so any
stage can be re-run over stored data without re-fetching.

### 1. Ingestion (`lib/ingest`)
Source adapters emit a common `RawArticle`. Two adapter families:
- **Aggregator queries** — the same topic queried per language/region, so the PRC framing
  of an LAC incident is captured alongside the Indian one. Locales: zh-CN, zh-TW, en-IN,
  hi, ur, ru, fa, ar, ja, ko, en-GB, en-US.
- **Primary sources** — direct feeds from PIB India, MEA, PRC MOFA, PLA/mod.gov.cn,
  US DoD, NATO, UN.

`data/sources.ts` is the source registry. Every outlet carries `country`, `language`, and
`ownership` (state | state_affiliated | public | independent | tabloid) plus a reliability
tier. Verification depends entirely on this metadata being honest, so it is curated by hand
and cited, not inferred.

Dedup: URL normalisation, then title-shingle Jaccard similarity above threshold.

### 2. Language layer (`lib/lang`)
- Script detection (Han, Devanagari, Cyrillic, Arabic, Hangul, Kana, Latin).
- **Chinese geopolitical glossary** — curated bilingual term map covering territorial,
  military, diplomatic and economic vocabulary, including PRC-specific exonyms
  (藏南 for Arunachal Pradesh) that signal framing by their mere use.
- **PRC escalation ladder** — ordered official-rhetoric formulae, rung 1..8:
  交涉 → 严正交涉 → 强烈不满 → 强烈抗议 → 坚决反制 → 一切必要措施 → 勿谓言之不预也.
  The rung matters more than the volume. `勿谓言之不预也` preceded the 1962 India war and
  the 1979 Vietnam war; its appearance is a documented high-signal indicator no
  English-language service surfaces.
- Optional LLM layer: when `ANTHROPIC_API_KEY` is present, adds true translation and
  framing analysis. Absent, every feature above still functions. Never required.

### 3. Analysis (`lib/analyze`)
Actor extraction against a multilingual country gazetteer (中国/भारत/Китай/چین all resolve).
Dyad detection, domain classification (Military, Maritime, Cyber, Economic, Energy, Space,
Nuclear, Diplomatic, Internal, Technology), and weighted multilingual escalation scoring.

### 4. Clustering + verification (`lib/verify`)
Articles cluster into events by entity, time-window and title similarity. Each event gets a
0-100 **Confidence Score** from auditable signals, each independently displayed:
- independent outlet count
- ownership diversity (state vs independent)
- country diversity, language diversity
- primary-source presence
- first-report latency
- contradiction detection between sources

Flags: `single_source`, `state_media_only`, `disputed`, `uncorroborated`.
Every score is expandable to its evidence. `/methodology` documents the weights.

### 5. Risk model (`lib/risk`)
- **Composite Risk Index** per country, 0-100, over six vectors: Military, Economic,
  Cyber, Internal, Diplomatic, Energy.
- **Tension Index** per dyad with 90-day trend.
- India watchboard seeded: China/LAC, Pakistan, Bangladesh, Myanmar, Nepal, Sri Lanka,
  Maldives, Afghanistan, Indian Ocean/PLAN.

### 6. Web (`app`)
`/` Global Threat Board · `/india` · `/china` · `/country/[iso]` · `/dyad/[a]-[b]` ·
`/events` · `/events/[id]` · `/dashboard` · `/methodology` · `/pricing` · `/login` · `/account`

All charts are hand-rolled SVG components (no charting library) for design control and
zero React peer-dependency risk. The world choropleth uses `world-atlas` + `d3-geo`.
The relationship view uses a deterministic mandala layout — concentric rings of ally,
neutral and rival states — rather than a force simulation.

Imagery is real article thumbnails and source video from feed metadata. Nothing fabricated.

### 7. Accounts, quota, billing (`lib/auth`, `lib/quota`)
Cookie-session accounts, bcrypt password hashes, SQLite. **5 free analyst actions** —
deep event view, dyad analysis, country deep-dive, export, LLM analysis — then paywall.
Stripe behind env keys, with a mock-checkout mode so the flow is exercisable without an
account. Anonymous quota is device-cookie based and therefore bypassable by design;
only account-bound quota is real enforcement. This is stated in the product, not hidden.

## Testing
Vitest. Unit coverage on the parts where a silent error would be invisible in the UI:
glossary and ladder detection, dedup and clustering, verification scoring, risk maths,
quota enforcement.

## Known limitations (surfaced in `/methodology`)
1. Corroboration is not truth. Widely-repeated false claims score well on outlet count;
   ownership and country diversity are the partial mitigation, not a cure.
2. Aggregator coverage of PRC domestic media is partial. Absence of signal is not
   absence of event.
3. The escalation ladder is a rhetoric indicator with a small historical sample. It is
   evidence, not prophecy.
4. Publisher and aggregator terms of service govern commercial redistribution. Review
   before charging subscribers.
