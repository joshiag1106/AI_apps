# Network graph — states, friction, and a walkable neighbourhood

**Status: implemented and shipped 2026-09-05 on branch `network-graph`.** Where the code
and this document disagree, the code is what runs — the deltas known at time of shipping
are recorded inline below.

## Purpose

Kautilya scores states individually (`countryRisk`) and in pairs (`dyadTension`), but never
as a structure. A reader can see that India–China is tense and that China–Philippines is
tense; nothing tells them China is the state through which otherwise-unconnected disputes
connect, or that a given state's rivals do not fight each other and so its frictions are
separate fronts rather than one theatre.

This adds a walkable graph over the actors already in the corpus, and the network measures
that make structure legible. It answers questions the per-country and per-dyad pages
cannot, using data that already exists.

## Non-goals

- **People.** The request that prompted this asked for a network of *people*. The corpus
  has none: `Article.actors` and `GeoEvent.actors` are ISO3 country codes, there is no
  persons table, and the only named individual anywhere in the repository is
  `data/sources.ts:119`, which is the name of a publication. Person nodes require a
  cross-lingual extraction and resolution pipeline, which is a separate project. The graph
  engine here is built node-agnostic so that pipeline can feed it later without rework.
- **Saved or annotated walks.** A walk is a URL; that is enough.
- **Graph export.** The existing CSV/JSON export may grow to cover it later.
- **Time-travel across the 90-day window.** The graph is as-of-now.
- **Re-scoring cooperation.** See "The alignment signal is thin", below. Fixing it is a
  change to the analyser, not to this view.

## What the corpus actually contains

Measured 2026-09-03 against the live corpus (2,203 events), because the design depends on
these numbers rather than on assumptions about them:

| | |
|---|---|
| Nodes (states appearing with at least one other) | 66 |
| Edges (distinct co-occurring pairs) | 526 |
| Density | 24.5% |
| Degree — max / median / min | 59 / 12 / 1 |
| Events with more than one actor | 1,988 of 2,203 |
| Events with `escalation < 0` | **41 of 2,203 (1.9%)** |
| Edges carrying any friction event | 241 |
| Edges carrying any alignment event | **32** |

Two consequences drove the design.

**The graph is hub-dominated.** One hop from a degree-59 node reaches nearly the whole
network, so an unbounded "expand to neighbours" saturates on the first click and produces a
hairball. Fan-out must be capped.

**The alignment signal is thin.** `impact()` in `lib/risk/index.ts` computes
`Math.max(0, e.escalation) * ...`, so every existing risk number discards de-escalation.
That clamp is not the cause, though: only 41 events carry a negative score at all, because
`isRelevant()` filters the feed for security signals before scoring happens. The corpus
selects for conflict. An alignment dimension therefore cannot carry community detection or
any claim about blocs, and the design does not ask it to.

## Architecture

Six units. The first three are pure functions with no database or React dependency, so the
engine is testable in isolation and reusable for a different node type.

### 1. Graph construction (`lib/graph/build.ts`)

Turns a list of items into a weighted signed graph. Node-agnostic by construction: it takes
the items and an extractor that yields participant ids, so feeding it people instead of
states is a change of argument, not of implementation.

Each edge carries two independent weights:

- **friction** — accumulated `impact()` over the pair's shared events, reusing the existing
  function so an edge here and a tension score on `/dyad` cannot disagree.
- **alignment** — the same accumulation over events with `escalation < 0`, which is the
  half the product currently throws away.

Edges also carry the shared event count and their eight strongest events — matching what
`dyadTension` already returns in `topEvents`, so the two agree — letting the UI show the
evidence behind a line rather than only its thickness.

### 2. Metrics (`lib/graph/metrics.ts`)

Pure functions over a graph. All are computed on the **full** graph.

- Degree and weighted degree
- Betweenness (Brandes)
- Eigenvector centrality (power iteration, fixed iteration count for determinism)
- Closeness centrality
- Local clustering coefficient
- k-core decomposition
- Community detection (**shipped as label propagation, not Louvain**: a fraction of the
  code, no modularity bookkeeping, and at this node count the quality difference is not
  visible. Made deterministic by visiting nodes in sorted order and breaking ties on the
  lowest label, since ordinary label propagation is randomised and would give a different
  answer on every load. Rationale is at the function in `lib/graph/metrics.ts`.)

Brandes on 66 nodes and 526 edges runs in microseconds, so nothing is cached and nothing is
precomputed at ingest. (As shipped: betweenness and closeness share one all-sources sweep
via `centrality()`, because they are functions of the same shortest-path trees and running
them apart doubled the O(V^3) term — 27ms to 13ms on the live graph.) If the node count ever grows by two orders of magnitude — which
person nodes would do — this is the module that needs revisiting first.

### 3. Ego extraction (`lib/graph/ego.ts`)

Given a focal node, returns the subgraph of its strongest `N` neighbours (default 10,
adjustable), along with the edges *among* those neighbours — without which the clustering
coefficient is invisible on screen even though it is reported.

Depth is always one. The walk supplies depth: re-centring on a neighbour is what moves you
outward, and a depth parameter would be a second, redundant way to do the same thing that
reintroduces exactly the saturation the fan-out cap exists to prevent.

Also owns walk-trail integrity: a trail is a list of visited nodes, deduplicated, with the
focal node last.

### 4. Page (`app/network/[iso]/page.tsx`)

Server component. Builds the graph, computes metrics on all of it, extracts the ego view for
`[iso]`, and renders.

Quota is charged **once for entering the network view, not once per hop.** Metering each
re-centre would spend the entire five-action free allowance in five clicks, on the one
feature whose whole value is walking further than five steps — the tier would forbid the
thing being demonstrated. Entering costs one action, consistent with `/country/[iso]` and
`/dyad/[pair]`; the walk that follows is free.

No new quota machinery is needed for this. `consume()` already keys on the unique
`(action, target)` pair so that a refresh or a back button cannot cost a second credit —
calling it with a constant target therefore charges once for the feature and never again.

Drilldown is URL-driven: `/network/CHN?trail=IND,PAK`. Walks are therefore shareable and
linkable, the browser back button is the undo, and no graph state lives on the client.

### 5. Graph view (`components/NetworkGraph.tsx`)

**Server** component rendering SVG, following `components/charts.tsx`, which hand-rolls
every chart in this product precisely so each is server-renderable. Nothing here needs the
client: drilldown is a `<Link>`, hover detail is an SVG `<title>`, and the fan-out cap is a
query parameter. A client component would buy nothing and cost hydration.

Deterministic radial layout: focal node centred, neighbours placed on a ring in weight
order. No force simulation — at ten nodes physics buys nothing and costs reproducibility,
and a layout that differs between loads cannot be tested or screenshotted for regression.
Layout is a pure function in `lib/graph/layout.ts` rather than logic inside the component,
so determinism can be asserted directly.

**(Superseded 2026-09-05: the layout is now ForceAtlas2.)** The reproducibility argument
above was right and is preserved — this ForceAtlas2 seeds from that same ring rather than
from random positions and runs a fixed number of steps with a fixed cooling schedule, so
identical input still gives byte-identical output and the determinism test still holds. What
the ring could not express is structure: neighbours that fight *each other* as well as the
focus now settle together, so one look distinguishes an entangled theatre from separate
fronts. The cost is that ANGLE no longer encodes rank — twelve o'clock was the strongest tie
on the ring and nothing on this picture means that now. Rank is carried by node radius and
edge thickness alone.

Friction sets edge thickness. Alignment edges are drawn in a visually distinct style and are
always accompanied by the count they rest on.

### 6. Metrics panel (`components/NetworkMetrics.tsx`)

The focal state's measures, each with a plain-language reading of what it means, plus
leaderboards across the whole network.

## The rule that matters most

**Metrics are computed on the full 66-node graph and never on the visible ego subgraph.**

Betweenness computed over ten visible neighbours is a different quantity from betweenness,
and it would look every bit as authoritative. This is the most likely way this feature
degrades silently during a later refactor, so it is asserted directly in tests rather than
left as a convention.

## What each measure is for

Chosen because each answers something the rest of the product cannot:

| Measure | Reading |
|---|---|
| Weighted degree | Total friction carried. Cross-checks `countryRisk`; divergence between the two is itself worth noticing. |
| **Betweenness** | Brokerage — which states connect otherwise-separate conflict clusters. Nothing in Kautilya surfaces this today. |
| Eigenvector centrality | Embroiled with the embroiled: exposure to escalation contagion rather than raw volume. |
| Clustering coefficient | Whether a state's rivals also fight each other — one coherent theatre — or do not, meaning independent fronts. |
| k-core | The dense conflict core, and who sits on the periphery. |
| Communities | Rendered, but labelled **conflict clusters**. On friction edges that is what they are; calling them blocs would invert their meaning. |

## Honesty constraints

Consistent with how every other number in this product is treated:

- The alignment overlay states on screen that it rests on 41 events.
- Nodes of degree 1–2 have their metrics flagged as thin evidence rather than presented with
  the same weight as a hub's.
- Every measure carries a plain-language explanation in the UI and an entry on
  `/methodology`, alongside the scoring weights already documented there.
- Community output is never described as blocs, alliances, or alignment.

## Testing

- **Metrics against known answers.** A path graph, a star, and a clique have betweenness,
  clustering and centrality values derivable by hand. Tests assert those, not the
  implementation's own output.
- **The full-graph rule.** A node's betweenness from the page equals its betweenness from
  the whole graph, and differs from the same node's value within its ego subgraph — so the
  test fails if someone later "optimises" by computing on the subgraph.
- **Hub containment.** The degree-59 node yields a capped ego view.
- **Determinism.** Identical input produces identical coordinates.
- **Trail integrity.** No duplicate nodes; focal node last; a cycle in the walk is handled.
- **Empty and thin corpora.** Renders the existing first-run panel rather than an empty SVG.

## Known limitations, to surface on `/methodology`

- Alignment rests on 41 events and is an overlay, not a measurement of cooperation. The
  corpus is filtered for security relevance and therefore selects for conflict.
- An edge means co-occurrence in a clustered event, which is a reporting relationship, not a
  diplomatic one. Two states in the same article are not necessarily interacting.
- Clustering inherits the corroboration pipeline's known property that a very large story
  divides by angle, so a single crisis can contribute several events to the same pair.
- Metrics are as-of-now over a 90-day retention window and will move as the corpus turns
  over. They are not a historical series.
