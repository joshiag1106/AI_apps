# Network Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a walkable network graph of states at `/network/[iso]`, showing friction-weighted connections with betweenness, centrality and clustering measures computed over the whole corpus.

**Architecture:** Four pure modules (`build`, `metrics`, `ego`, `layout`) with no database or React dependency, consumed by one server-rendered page and two server components. The graph builder takes an extractor rather than reading events directly, so a future person-extraction pipeline feeds the same engine. Drilldown is URL-driven, so no client JavaScript is required.

**Tech Stack:** TypeScript, Next.js 15 App Router (server components), vitest, hand-rolled SVG. **No new dependencies.**

**Spec:** `docs/specs/2026-09-03-network-graph-design.md` — read it before starting. It records the corpus measurements the design rests on and the honesty constraints that are not negotiable.

## Global Constraints

- **No new npm dependencies.** This repo hand-rolls its charts (`components/charts.tsx`) and its clustering for stated reasons. Do not add d3-force, graphology, cytoscape or similar.
- **Metrics are computed on the full graph, never on an ego subgraph.** Asserted by test in Task 6.
- **Communities are labelled "conflict clusters" in all user-facing copy.** Never "blocs", "alliances" or "alignment".
- **The alignment overlay must state the event count it rests on** wherever it is drawn.
- All SVG components are **server components**. Do not add `'use client'`.
- Colours come from CSS custom properties (`var(--color-accent)` etc.), never hex literals. Available: `--color-accent`, `--color-accent-dim`, `--color-low`, `--color-guarded`, `--color-elevated`, `--color-high`, `--color-severe`, `--color-text`, `--color-muted`, `--color-faint`, `--color-line`, `--color-panel`, `--color-verified`.
- Every file gets a header comment explaining *why*, matching the surrounding code's density.
- Run `npm test` before every commit. Currently 207 passing; the count only goes up.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/graph/types.ts` | `Graph`, `GraphEdge`, `NodeMetrics` — shared shapes, no logic. |
| `lib/graph/build.ts` | Items → weighted signed graph. Node-agnostic via an extractor. Plus `stateGraph()`, the states adapter. |
| `lib/graph/metrics.ts` | Degree, betweenness, eigenvector, closeness, clustering coefficient, k-core, communities. |
| `lib/graph/ego.ts` | Top-N ego subgraph and walk-trail integrity. |
| `lib/graph/layout.ts` | Deterministic radial coordinates. Pure, so determinism is testable. |
| `components/NetworkGraph.tsx` | Server-rendered SVG of an ego view. |
| `components/NetworkMetrics.tsx` | Focal-node measures and whole-network leaderboards. |
| `app/network/[iso]/page.tsx` | Server page: build, measure, extract, render, meter. |
| `tests/graph-build.test.ts`, `tests/graph-metrics.test.ts`, `tests/graph-ego.test.ts`, `tests/graph-layout.test.ts` | One test file per pure module. |

Modified: `lib/risk/index.ts` (export `squash`), `components/Nav.tsx` (add link), `lib/quota/index.ts` (add action), `app/methodology/page.tsx` (document measures), `README.md`, `STATE.md`.

---

### Task 1: Graph types and construction

**Files:**
- Create: `lib/graph/types.ts`, `lib/graph/build.ts`
- Modify: `lib/risk/index.ts` (export the existing `squash` function — change `function squash(` to `export function squash(`)
- Test: `tests/graph-build.test.ts`

**Interfaces:**
- Consumes: `impact`, `decay`, `squash` from `@/lib/risk`; `GeoEvent` from `@/lib/types`.
- Produces:
  - `interface GraphEdge { a: string; b: string; friction: number; alignment: number; events: number; alignmentEvents: number }`
  - `interface Graph<T> { nodes: string[]; edges: GraphEdge[]; adjacency: Map<string, Map<string, GraphEdge>>; topEvents: Map<string, T[]> }`
  - `function buildGraph<T>(items: T[], extract: (item: T) => { participants: string[]; friction: number; alignment: number }, opts?: { topPerEdge?: number; rank?: (item: T) => number }): Graph<T>`
  - `function stateGraph(events: GeoEvent[], now?: number): Graph<GeoEvent>`
  - `function edgeKey(a: string, b: string): string`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/graph-build.test.ts
import { describe, it, expect } from 'vitest';
import { buildGraph, stateGraph, edgeKey } from '@/lib/graph/build';
import type { GeoEvent } from '@/lib/types';

interface Item { who: string[]; f: number; a: number }
const extract = (i: Item) => ({ participants: i.who, friction: i.f, alignment: i.a });

describe('graph construction', () => {
  it('makes one undirected edge per co-occurring pair, keyed consistently', () => {
    const g = buildGraph<Item>([{ who: ['B', 'A'], f: 1, a: 0 }], extract);
    expect(g.nodes.sort()).toEqual(['A', 'B']);
    expect(g.edges).toHaveLength(1);
    // Endpoints are ordered so that A|B and B|A are the same edge.
    expect(g.edges[0].a).toBe('A');
    expect(g.edges[0].b).toBe('B');
    expect(edgeKey('B', 'A')).toBe(edgeKey('A', 'B'));
  });

  it('turns a three-way event into all three pairs', () => {
    // A single event naming three states means each pair co-occurred, not a chain.
    const g = buildGraph<Item>([{ who: ['A', 'B', 'C'], f: 1, a: 0 }], extract);
    expect(g.edges).toHaveLength(3);
  });

  it('ignores an item with fewer than two participants', () => {
    const g = buildGraph<Item>([{ who: ['A'], f: 9, a: 0 }], extract);
    expect(g.edges).toHaveLength(0);
    expect(g.nodes).toHaveLength(0);
  });

  it('de-duplicates a participant repeated within one item', () => {
    const g = buildGraph<Item>([{ who: ['A', 'A', 'B'], f: 1, a: 0 }], extract);
    expect(g.edges).toHaveLength(1);
  });

  it('accumulates friction and alignment separately across items', () => {
    const g = buildGraph<Item>([
      { who: ['A', 'B'], f: 10, a: 0 },
      { who: ['A', 'B'], f: 10, a: 5 },
    ], extract);
    const e = g.edges[0];
    expect(e.events).toBe(2);
    expect(e.alignmentEvents).toBe(1);   // only the second item carried alignment
    expect(e.friction).toBeGreaterThan(0);
    expect(e.alignment).toBeGreaterThan(0);
    expect(e.friction).toBeGreaterThan(e.alignment);
  });

  it('scores on the same 0-100 scale as dyadTension', () => {
    // Both squash through lib/risk, so an edge here cannot contradict a /dyad page.
    const g = buildGraph<Item>([{ who: ['A', 'B'], f: 10_000, a: 0 }], extract);
    expect(g.edges[0].friction).toBeLessThanOrEqual(100);
    expect(g.edges[0].friction).toBeGreaterThan(0);
  });

  it('indexes adjacency in both directions', () => {
    const g = buildGraph<Item>([{ who: ['A', 'B'], f: 1, a: 0 }], extract);
    expect(g.adjacency.get('A')!.get('B')).toBeDefined();
    expect(g.adjacency.get('B')!.get('A')).toBeDefined();
    expect(g.adjacency.get('A')!.get('B')).toBe(g.adjacency.get('B')!.get('A'));
  });

  it('keeps the highest-ranked items per edge, capped', () => {
    const items: Item[] = [1, 2, 3, 4].map((n) => ({ who: ['A', 'B'], f: n, a: 0 }));
    const g = buildGraph<Item>(items, extract, { topPerEdge: 2, rank: (i) => i.f });
    const top = g.topEvents.get(edgeKey('A', 'B'))!;
    expect(top).toHaveLength(2);
    expect(top.map((i) => i.f)).toEqual([4, 3]);
  });
});

describe('stateGraph', () => {
  let n = 0;
  const ev = (actors: string[], escalation: number): GeoEvent => {
    n += 1;
    const iso = new Date().toISOString();
    return {
      id: `e${n}`, title: `E${n}`, summary: '', firstSeen: iso, lastSeen: iso,
      actors, hotspots: [], domain: 'Diplomatic', escalation, confidence: 100,
      signals: [], flags: [], articleIds: [`a${n}`], languages: ['en'], countries: actors,
      imageUrl: null, videoId: null, ladderRung: null, ladderZh: null, ladderEn: null,
    };
  };

  it('routes positive escalation to friction and negative to alignment', () => {
    const g = stateGraph([ev(['IND', 'CHN'], 60), ev(['IND', 'PAK'], -60)]);
    const ic = g.adjacency.get('IND')!.get('CHN')!;
    const ip = g.adjacency.get('IND')!.get('PAK')!;
    expect(ic.friction).toBeGreaterThan(0);
    expect(ic.alignment).toBe(0);
    expect(ip.alignment).toBeGreaterThan(0);
    expect(ip.friction).toBe(0);
  });

  it('counts alignment events so the UI can state what the overlay rests on', () => {
    const g = stateGraph([ev(['IND', 'PAK'], -60), ev(['IND', 'PAK'], 20)]);
    const e = g.adjacency.get('IND')!.get('PAK')!;
    expect(e.events).toBe(2);
    expect(e.alignmentEvents).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/graph-build.test.ts`
Expected: FAIL — cannot resolve `@/lib/graph/build`.

- [ ] **Step 3: Write the types**

```typescript
// lib/graph/types.ts
/**
 * Shapes shared by the graph modules. Deliberately free of any node semantics: nothing
 * here knows that a node is a country, which is what lets a person-extraction pipeline
 * feed the same engine later without touching the algorithms.
 */

export interface GraphEdge {
  /** Endpoints, ordered so that a < b. One undirected edge has exactly one representation. */
  a: string;
  b: string;
  /** 0-100, squashed on the same curve as dyadTension so the two cannot disagree. */
  friction: number;
  /** 0-100. Thin by nature — see the spec. Always shown with alignmentEvents beside it. */
  alignment: number;
  events: number;
  alignmentEvents: number;
}

export interface Graph<T> {
  nodes: string[];
  edges: GraphEdge[];
  /** Both directions point at the same GraphEdge object, so identity comparison works. */
  adjacency: Map<string, Map<string, GraphEdge>>;
  /** Strongest source items per edge, keyed by edgeKey. Evidence behind a line. */
  topEvents: Map<string, T[]>;
}
```

- [ ] **Step 4: Write the builder**

```typescript
// lib/graph/build.ts
import { impact, decay, squash } from '@/lib/risk';
import type { GeoEvent } from '@/lib/types';
import type { Graph, GraphEdge } from '@/lib/graph/types';

/**
 * Turning co-occurrence into a weighted signed graph.
 *
 * The extractor is the whole point of the signature. This module never sees a GeoEvent
 * unless stateGraph hands it one, so pointing it at extracted people later is a change of
 * argument rather than a rewrite.
 *
 * Friction and alignment accumulate separately because they are not two ends of one scale:
 * the corpus carries a great deal of the first and very little of the second, and averaging
 * them would hide that asymmetry rather than report it.
 */

export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface Extracted { participants: string[]; friction: number; alignment: number }

export function buildGraph<T>(
  items: T[],
  extract: (item: T) => Extracted,
  opts: { topPerEdge?: number; rank?: (item: T) => number } = {},
): Graph<T> {
  const topPerEdge = opts.topPerEdge ?? 8;
  const raw = new Map<string, { a: string; b: string; f: number; al: number; n: number; an: number }>();
  const contributors = new Map<string, T[]>();

  for (const item of items) {
    const { participants, friction, alignment } = extract(item);
    const ps = [...new Set(participants)].sort();
    if (ps.length < 2) continue;

    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const k = edgeKey(ps[i], ps[j]);
        const cur = raw.get(k) ?? { a: ps[i], b: ps[j], f: 0, al: 0, n: 0, an: 0 };
        cur.f += friction;
        cur.al += alignment;
        cur.n += 1;
        if (alignment > 0) cur.an += 1;
        raw.set(k, cur);
        const list = contributors.get(k) ?? [];
        list.push(item);
        contributors.set(k, list);
      }
    }
  }

  const edges: GraphEdge[] = [];
  const adjacency = new Map<string, Map<string, GraphEdge>>();
  const nodes = new Set<string>();

  for (const [, v] of [...raw.entries()].sort(([x], [y]) => (x < y ? -1 : 1))) {
    // squash matches dyadTension's curve; the x2 factor matches its score line too.
    const edge: GraphEdge = {
      a: v.a, b: v.b,
      friction: squash(v.f * 2),
      alignment: squash(v.al * 2),
      events: v.n,
      alignmentEvents: v.an,
    };
    edges.push(edge);
    nodes.add(v.a); nodes.add(v.b);
    if (!adjacency.has(v.a)) adjacency.set(v.a, new Map());
    if (!adjacency.has(v.b)) adjacency.set(v.b, new Map());
    adjacency.get(v.a)!.set(v.b, edge);
    adjacency.get(v.b)!.set(v.a, edge);
  }

  const topEvents = new Map<string, T[]>();
  const rank = opts.rank;
  for (const [k, list] of contributors) {
    const sorted = rank ? [...list].sort((x, y) => rank(y) - rank(x)) : list;
    topEvents.set(k, sorted.slice(0, topPerEdge));
  }

  return { nodes: [...nodes].sort(), edges, adjacency, topEvents };
}

/**
 * The states adapter. Friction reuses impact() unchanged; alignment mirrors it across
 * zero, applying the same confidence gate and recency decay to the negative half that
 * impact() discards.
 */
export function stateGraph(events: GeoEvent[], now = Date.now()): Graph<GeoEvent> {
  return buildGraph(
    events,
    (e) => ({
      participants: e.actors,
      friction: impact(e, now),
      alignment: Math.max(0, -e.escalation) * (e.confidence / 100) * decay(e.lastSeen, now),
    }),
    { topPerEdge: 8, rank: (e) => impact(e, now) },
  );
}
```

- [ ] **Step 5: Export squash from lib/risk**

In `lib/risk/index.ts`, change `function squash(raw: number): number {` to `export function squash(raw: number): number {`. Leave the body and its comment alone — the graph reuses this exact curve so that an edge weight and a dyad score cannot diverge.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/graph-build.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS, 217 tests (207 + 10).

- [ ] **Step 8: Commit**

```bash
git add lib/graph/types.ts lib/graph/build.ts lib/risk/index.ts tests/graph-build.test.ts
git commit -m "Build a weighted signed graph from anything with participants

The extractor argument is the design. Nothing in this module knows a node is a country,
so pointing it at extracted people later changes an argument rather than the algorithms.

Friction and alignment accumulate separately rather than netting off, because the corpus
carries a great deal of the first and almost none of the second, and a single signed
number would hide that asymmetry instead of reporting it. Both squash through the curve
lib/risk already uses, so an edge weight here cannot contradict a dyad score there.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Degree, betweenness and closeness

**Files:**
- Create: `lib/graph/metrics.ts`
- Test: `tests/graph-metrics.test.ts`

**Interfaces:**
- Consumes: `Graph`, `GraphEdge` from `@/lib/graph/types`.
- Produces:
  - `function degree(g: Graph<unknown>, node: string): number`
  - `function weightedDegree(g: Graph<unknown>, node: string): number`
  - `function betweenness(g: Graph<unknown>): Map<string, number>`
  - `function closeness(g: Graph<unknown>): Map<string, number>`

**Why weighted distance:** a strong tie means two states are *closer*, so path cost is `1 / friction`. Betweenness on raw weights would treat the strongest relationship as the longest detour, which inverts the meaning.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/graph-metrics.test.ts
import { describe, it, expect } from 'vitest';
import { buildGraph } from '@/lib/graph/build';
import { degree, weightedDegree, betweenness, closeness } from '@/lib/graph/metrics';

/**
 * Every expected value below is derivable by hand from the graph's shape. Asserting
 * against an implementation's own output would only prove it is consistent with itself.
 */
interface I { who: string[]; f: number }
const g = (pairs: [string, string, number?][]) =>
  buildGraph<I>(pairs.map(([a, b, f]) => ({ who: [a, b], f: f ?? 50 })),
    (i) => ({ participants: i.who, friction: i.f, alignment: 0 }));

describe('degree', () => {
  it('counts neighbours', () => {
    const star = g([['C', 'A'], ['C', 'B'], ['C', 'D']]);   // C is the hub
    expect(degree(star, 'C')).toBe(3);
    expect(degree(star, 'A')).toBe(1);
  });

  it('sums edge weight for weighted degree', () => {
    const two = g([['A', 'B', 10], ['A', 'C', 10]]);
    expect(weightedDegree(two, 'A')).toBe(
      two.adjacency.get('A')!.get('B')!.friction + two.adjacency.get('A')!.get('C')!.friction);
  });

  it('is zero for a node not in the graph', () => {
    expect(degree(g([['A', 'B']]), 'ZZZ')).toBe(0);
  });
});

describe('betweenness', () => {
  it('puts the centre of a path graph on every route between the ends', () => {
    // A - B - C : only B lies between a pair, and only for the pair (A,C).
    const b = betweenness(g([['A', 'B'], ['B', 'C']]));
    expect(b.get('B')).toBeGreaterThan(0);
    expect(b.get('A')).toBe(0);
    expect(b.get('C')).toBe(0);
  });

  it('gives every node zero in a triangle, where no one is needed as a go-between', () => {
    const b = betweenness(g([['A', 'B'], ['B', 'C'], ['A', 'C']]));
    for (const n of ['A', 'B', 'C']) expect(b.get(n)).toBe(0);
  });

  it('makes the hub of a star maximal and the spokes zero', () => {
    const b = betweenness(g([['H', 'A'], ['H', 'B'], ['H', 'C'], ['H', 'D']]));
    expect(b.get('H')).toBeGreaterThan(0);
    for (const n of ['A', 'B', 'C', 'D']) expect(b.get(n)).toBe(0);
  });

  it('identifies the single bridge between two clusters', () => {
    // Two triangles joined by one edge X-Y: X and Y broker every crossing route.
    const b = betweenness(g([
      ['A', 'B'], ['B', 'X'], ['A', 'X'],
      ['C', 'D'], ['D', 'Y'], ['C', 'Y'],
      ['X', 'Y'],
    ]));
    expect(b.get('X')).toBeGreaterThan(b.get('A')!);
    expect(b.get('Y')).toBeGreaterThan(b.get('C')!);
  });

  it('treats a strong tie as a short path, not a long one', () => {
    // A-B-C where A-B is strong and B-C weak; B still brokers, and a stronger
    // direct A-C route must reduce B's betweenness to zero.
    const weak = betweenness(g([['A', 'B', 90], ['B', 'C', 90]]));
    expect(weak.get('B')).toBeGreaterThan(0);
    const direct = betweenness(g([['A', 'B', 90], ['B', 'C', 90], ['A', 'C', 90]]));
    expect(direct.get('B')).toBe(0);
  });
});

describe('closeness', () => {
  it('ranks the hub above a spoke', () => {
    const c = closeness(g([['H', 'A'], ['H', 'B'], ['H', 'C']]));
    expect(c.get('H')!).toBeGreaterThan(c.get('A')!);
  });

  it('handles a disconnected graph without returning Infinity', () => {
    // Two components: distances across them are undefined, not infinite.
    const c = closeness(g([['A', 'B'], ['Y', 'Z']]));
    expect(Number.isFinite(c.get('A')!)).toBe(true);
    expect(Number.isFinite(c.get('Y')!)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/graph-metrics.test.ts`
Expected: FAIL — cannot resolve `@/lib/graph/metrics`.

- [ ] **Step 3: Implement**

```typescript
// lib/graph/metrics.ts
import type { Graph } from '@/lib/graph/types';

/**
 * Network measures, computed over a whole graph.
 *
 * These are only meaningful on the complete network. A node's betweenness within a
 * ten-node ego view is a different quantity that happens to have the same name, and it
 * would look every bit as authoritative on screen — so callers must pass the full graph.
 *
 * Distance is the reciprocal of weight throughout: a strong tie means two nodes are close.
 * Using weight directly as a cost would make the strongest relationship the longest
 * detour, which inverts what every one of these measures is supposed to say.
 */

const EPSILON = 1e-9;

export function degree(g: Graph<unknown>, node: string): number {
  return g.adjacency.get(node)?.size ?? 0;
}

export function weightedDegree(g: Graph<unknown>, node: string): number {
  let sum = 0;
  for (const e of g.adjacency.get(node)?.values() ?? []) sum += e.friction;
  return sum;
}

function cost(friction: number): number {
  // A zero-friction edge still exists (the pair co-occurred), so it gets a large but
  // finite cost rather than being treated as unreachable.
  return 1 / Math.max(friction, EPSILON);
}

/** Dijkstra from one source, returning distances and shortest-path counts. */
function dijkstra(g: Graph<unknown>, source: string) {
  const dist = new Map<string, number>();
  const sigma = new Map<string, number>();
  const preds = new Map<string, string[]>();
  const order: string[] = [];
  const visited = new Set<string>();

  for (const n of g.nodes) { dist.set(n, Infinity); sigma.set(n, 0); preds.set(n, []); }
  dist.set(source, 0);
  sigma.set(source, 1);

  // A linear scan for the nearest unvisited node. At 66 nodes this is faster than a
  // heap and far easier to read; revisit only if the node count grows by orders.
  while (visited.size < g.nodes.length) {
    let u: string | null = null;
    let best = Infinity;
    for (const n of g.nodes) {
      if (visited.has(n)) continue;
      const d = dist.get(n)!;
      if (d < best) { best = d; u = n; }
    }
    if (u === null || best === Infinity) break;   // remaining nodes are unreachable
    visited.add(u);
    order.push(u);

    for (const [v, edge] of g.adjacency.get(u) ?? []) {
      if (visited.has(v)) continue;
      const alt = dist.get(u)! + cost(edge.friction);
      const known = dist.get(v)!;
      if (alt < known - EPSILON) {
        dist.set(v, alt);
        sigma.set(v, sigma.get(u)!);
        preds.set(v, [u]);
      } else if (Math.abs(alt - known) <= EPSILON) {
        sigma.set(v, sigma.get(v)! + sigma.get(u)!);
        preds.get(v)!.push(u);
      }
    }
  }
  return { dist, sigma, preds, order };
}

/**
 * Brandes' algorithm on weighted edges. Returns unnormalised scores; the UI ranks them
 * rather than reading them absolutely, so a normalisation constant would add nothing.
 */
export function betweenness(g: Graph<unknown>): Map<string, number> {
  const bc = new Map<string, number>(g.nodes.map((n) => [n, 0]));

  for (const s of g.nodes) {
    const { sigma, preds, order } = dijkstra(g, s);
    const delta = new Map<string, number>(g.nodes.map((n) => [n, 0]));

    for (let i = order.length - 1; i >= 0; i--) {
      const w = order[i];
      for (const v of preds.get(w)!) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      }
      if (w !== s) bc.set(w, bc.get(w)! + delta.get(w)!);
    }
  }
  // Each unordered pair is counted from both endpoints.
  for (const [n, v] of bc) bc.set(n, v / 2);
  return bc;
}

/**
 * Closeness over reachable nodes only. Averaging over unreachable ones would make every
 * node in a fragmented graph score zero and say nothing about any of them.
 */
export function closeness(g: Graph<unknown>): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of g.nodes) {
    const { dist } = dijkstra(g, s);
    let total = 0;
    let reached = 0;
    for (const n of g.nodes) {
      if (n === s) continue;
      const d = dist.get(n)!;
      if (Number.isFinite(d)) { total += d; reached += 1; }
    }
    out.set(s, reached === 0 ? 0 : reached / total);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/graph-metrics.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/graph/metrics.ts tests/graph-metrics.test.ts
git commit -m "Measure brokerage, reach and involvement across the network

Betweenness is the measure worth having: it names the states through which otherwise
separate disputes connect, which neither the country pages nor the dyad pages can show.

Distance is the reciprocal of weight throughout. Using weight directly as path cost would
make the strongest relationship the longest detour and quietly invert every measure here.

Expected values in the tests are derived by hand from graphs whose answers are known — a
path, a triangle, a star, two clusters joined by one bridge — rather than from this
implementation's own output.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Eigenvector centrality, clustering coefficient, k-core

**Files:**
- Modify: `lib/graph/metrics.ts` (append)
- Test: `tests/graph-metrics.test.ts` (append)

**Interfaces:**
- Produces:
  - `function eigenvector(g: Graph<unknown>, iterations?: number): Map<string, number>`
  - `function clusteringCoefficient(g: Graph<unknown>, node: string): number`
  - `function kCore(g: Graph<unknown>): Map<string, number>`

- [ ] **Step 1: Write the failing test (append to tests/graph-metrics.test.ts)**

```typescript
import { eigenvector, clusteringCoefficient, kCore } from '@/lib/graph/metrics';

describe('eigenvector centrality', () => {
  it('ranks a node attached to well-connected nodes above one attached to a leaf', () => {
    // H is the hub of a triangle; L hangs off a single spoke.
    const graph = g([['H', 'A'], ['H', 'B'], ['A', 'B'], ['C', 'L']]);
    expect(eigenvector(graph).get('H')!).toBeGreaterThan(eigenvector(graph).get('L')!);
  });

  it('is deterministic — the same graph gives the same numbers', () => {
    const graph = g([['A', 'B'], ['B', 'C'], ['C', 'A'], ['C', 'D']]);
    expect([...eigenvector(graph).entries()]).toEqual([...eigenvector(graph).entries()]);
  });

  it('gives equal scores to every node of a symmetric triangle', () => {
    const e = eigenvector(g([['A', 'B'], ['B', 'C'], ['A', 'C']]));
    expect(e.get('A')).toBeCloseTo(e.get('B')!, 6);
    expect(e.get('B')).toBeCloseTo(e.get('C')!, 6);
  });
});

describe('clustering coefficient', () => {
  it('is 1 when every neighbour is joined to every other', () => {
    // A's neighbours B and C are themselves connected: one closed triangle.
    expect(clusteringCoefficient(g([['A', 'B'], ['A', 'C'], ['B', 'C']]), 'A')).toBeCloseTo(1, 6);
  });

  it('is 0 when no neighbour is joined to any other', () => {
    // A's rivals do not fight each other: separate fronts, not one theatre.
    expect(clusteringCoefficient(g([['A', 'B'], ['A', 'C']]), 'A')).toBe(0);
  });

  it('is 0 for a node with fewer than two neighbours, where the ratio is undefined', () => {
    expect(clusteringCoefficient(g([['A', 'B']]), 'A')).toBe(0);
  });
});

describe('k-core', () => {
  it('puts a triangle in the 2-core and a pendant node in the 1-core', () => {
    const k = kCore(g([['A', 'B'], ['B', 'C'], ['A', 'C'], ['C', 'P']]));
    expect(k.get('A')).toBe(2);
    expect(k.get('B')).toBe(2);
    expect(k.get('C')).toBe(2);
    expect(k.get('P')).toBe(1);
  });

  it('puts every node of a path in the 1-core', () => {
    const k = kCore(g([['A', 'B'], ['B', 'C']]));
    for (const n of ['A', 'B', 'C']) expect(k.get(n)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/graph-metrics.test.ts`
Expected: FAIL — `eigenvector`, `clusteringCoefficient`, `kCore` are not exported.

- [ ] **Step 3: Implement (append to lib/graph/metrics.ts)**

```typescript
/**
 * Eigenvector centrality by power iteration: being embroiled with the embroiled, rather
 * than embroiled with many. A fixed iteration count keeps it deterministic — a
 * convergence threshold would make the output depend on floating-point noise, and at this
 * size the extra iterations cost nothing.
 */
export function eigenvector(g: Graph<unknown>, iterations = 100): Map<string, number> {
  let x = new Map<string, number>(g.nodes.map((n) => [n, 1]));

  for (let i = 0; i < iterations; i++) {
    const next = new Map<string, number>(g.nodes.map((n) => [n, 0]));
    for (const n of g.nodes) {
      let sum = 0;
      for (const [m, e] of g.adjacency.get(n) ?? []) sum += x.get(m)! * e.friction;
      next.set(n, sum);
    }
    const norm = Math.sqrt([...next.values()].reduce((s, v) => s + v * v, 0));
    if (norm < EPSILON) return next;          // no weight anywhere; nothing to normalise
    for (const [n, v] of next) next.set(n, v / norm);
    x = next;
  }
  return x;
}

/**
 * Local clustering coefficient: of all the pairs among this node's neighbours, how many
 * are themselves connected. Read geopolitically, it answers whether a state's rivals also
 * fight each other — one entangled theatre — or do not, meaning separate fronts.
 */
export function clusteringCoefficient(g: Graph<unknown>, node: string): number {
  const neighbours = [...(g.adjacency.get(node)?.keys() ?? [])];
  const k = neighbours.length;
  if (k < 2) return 0;                        // the ratio is undefined, not zero-valued

  let links = 0;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      if (g.adjacency.get(neighbours[i])?.has(neighbours[j])) links += 1;
    }
  }
  return (2 * links) / (k * (k - 1));
}

/**
 * k-core decomposition by repeated peeling. A node's core number is the largest k for
 * which it survives in a subgraph where everyone has at least k neighbours — which is one
 * way of asking who is in the dense middle of the conflict and who is on its edge.
 */
export function kCore(g: Graph<unknown>): Map<string, number> {
  const deg = new Map<string, number>(g.nodes.map((n) => [n, degree(g, n)]));
  const core = new Map<string, number>();
  const removed = new Set<string>();

  while (removed.size < g.nodes.length) {
    let min = Infinity;
    for (const n of g.nodes) if (!removed.has(n)) min = Math.min(min, deg.get(n)!);

    let peeled = true;
    while (peeled) {
      peeled = false;
      for (const n of g.nodes) {
        if (removed.has(n) || deg.get(n)! > min) continue;
        core.set(n, min);
        removed.add(n);
        peeled = true;
        for (const m of g.adjacency.get(n)?.keys() ?? []) {
          if (!removed.has(m)) deg.set(m, Math.max(min, deg.get(m)! - 1));
        }
      }
    }
  }
  return core;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/graph-metrics.test.ts`
Expected: PASS, 17 tests total in this file.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, 234 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/graph/metrics.ts tests/graph-metrics.test.ts
git commit -m "Add contagion exposure, entanglement and core depth

Three measures that say things degree cannot. Eigenvector centrality separates being
embroiled with the embroiled from merely being embroiled with many. The clustering
coefficient answers whether a state's rivals also fight each other, which is the
difference between one entangled theatre and several separate fronts. k-core names who
sits in the dense middle and who is on the periphery.

Power iteration runs a fixed number of rounds rather than to a convergence threshold, so
the output cannot vary with floating-point noise between runs.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Conflict clusters (community detection)

**Files:**
- Modify: `lib/graph/metrics.ts` (append)
- Test: `tests/graph-metrics.test.ts` (append)

**Interfaces:**
- Produces: `function conflictClusters(g: Graph<unknown>): Map<string, number>` — node → cluster index.

**Naming is a requirement, not a preference.** The function is called `conflictClusters` and not `communities` so that the honest label survives into every call site. On friction edges these are groups that fight *each other*.

- [ ] **Step 1: Write the failing test (append)**

```typescript
import { conflictClusters } from '@/lib/graph/metrics';

describe('conflict clusters', () => {
  it('separates two dense groups joined by a single weak edge', () => {
    const graph = g([
      ['A', 'B', 90], ['B', 'C', 90], ['A', 'C', 90],
      ['X', 'Y', 90], ['Y', 'Z', 90], ['X', 'Z', 90],
      ['C', 'X', 1],
    ]);
    const c = conflictClusters(graph);
    expect(c.get('A')).toBe(c.get('B'));
    expect(c.get('B')).toBe(c.get('C'));
    expect(c.get('X')).toBe(c.get('Y'));
    expect(c.get('A')).not.toBe(c.get('X'));
  });

  it('puts every node of one clique together', () => {
    const c = conflictClusters(g([['A', 'B'], ['B', 'C'], ['A', 'C']]));
    expect(new Set([...c.values()]).size).toBe(1);
  });

  it('assigns disconnected components to different clusters', () => {
    const c = conflictClusters(g([['A', 'B'], ['Y', 'Z']]));
    expect(c.get('A')).not.toBe(c.get('Y'));
  });

  it('is deterministic across runs', () => {
    const graph = g([['A', 'B'], ['B', 'C'], ['A', 'C'], ['X', 'Y'], ['C', 'X']]);
    expect([...conflictClusters(graph).entries()]).toEqual([...conflictClusters(graph).entries()]);
  });

  it('returns an empty map for an empty graph', () => {
    expect(conflictClusters(g([])).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/graph-metrics.test.ts`
Expected: FAIL — `conflictClusters` is not exported.

- [ ] **Step 3: Implement (append to lib/graph/metrics.ts)**

```typescript
/**
 * Conflict clusters by label propagation.
 *
 * Named for what they are. These edges carry friction, so a cluster is a set of states
 * that fight *each other* — the opposite of a bloc. Calling them communities in the code
 * would let "alliance" or "bloc" reach the interface through nothing worse than
 * inattention, so the honest word is fixed here at the source.
 *
 * Label propagation rather than Louvain: it is a fraction of the code, needs no
 * modularity bookkeeping, and at 66 nodes the quality difference is not visible. Nodes are
 * visited in sorted order and ties break on the lowest label, so runs are reproducible —
 * ordinary label propagation is randomised and would give a different answer each load.
 */
export function conflictClusters(g: Graph<unknown>): Map<string, number> {
  const label = new Map<string, string>(g.nodes.map((n) => [n, n]));
  const order = [...g.nodes].sort();

  for (let pass = 0; pass < 20; pass++) {
    let changed = false;
    for (const n of order) {
      const weights = new Map<string, number>();
      for (const [m, e] of g.adjacency.get(n) ?? []) {
        const l = label.get(m)!;
        weights.set(l, (weights.get(l) ?? 0) + e.friction);
      }
      if (!weights.size) continue;

      let bestLabel = label.get(n)!;
      let bestWeight = -1;
      for (const [l, w] of [...weights.entries()].sort(([x], [y]) => (x < y ? -1 : 1))) {
        if (w > bestWeight) { bestWeight = w; bestLabel = l; }
      }
      if (bestLabel !== label.get(n)) { label.set(n, bestLabel); changed = true; }
    }
    if (!changed) break;
  }

  // Re-index to small integers, ordered by first appearance, so cluster ids are stable
  // and presentable rather than being whichever node id happened to win.
  const index = new Map<string, number>();
  const out = new Map<string, number>();
  for (const n of order) {
    const l = label.get(n)!;
    if (!index.has(l)) index.set(l, index.size);
    out.set(n, index.get(l)!);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/graph-metrics.test.ts`
Expected: PASS, 22 tests in this file.

- [ ] **Step 5: Commit**

```bash
git add lib/graph/metrics.ts tests/graph-metrics.test.ts
git commit -m "Group the network into conflict clusters, and call them that

The function is named conflictClusters rather than communities so the honest label
survives into every call site. These edges carry friction, so a cluster is a set of states
embroiled with each other — the opposite of a bloc. Leaving the neutral word in the code
is how 'alliance' reaches an interface through nothing worse than inattention.

Label propagation rather than Louvain: a fraction of the code, no modularity bookkeeping,
and at this size no visible difference in quality. Visiting order is sorted and ties break
on the lowest label, because the textbook algorithm is randomised and would otherwise
redraw the clusters on every page load.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Ego extraction and the walk trail

**Files:**
- Create: `lib/graph/ego.ts`
- Test: `tests/graph-ego.test.ts`

**Interfaces:**
- Produces:
  - `interface EgoView { focus: string; neighbours: string[]; edges: GraphEdge[]; hidden: number }`
  - `function egoView(g: Graph<unknown>, focus: string, topN?: number): EgoView`
  - `function parseTrail(raw: string | undefined, focus: string): string[]`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/graph-ego.test.ts
import { describe, it, expect } from 'vitest';
import { buildGraph } from '@/lib/graph/build';
import { egoView, parseTrail } from '@/lib/graph/ego';

interface I { who: string[]; f: number }
const g = (pairs: [string, string, number?][]) =>
  buildGraph<I>(pairs.map(([a, b, f]) => ({ who: [a, b], f: f ?? 50 })),
    (i) => ({ participants: i.who, friction: i.f, alignment: 0 }));

describe('ego view', () => {
  it('keeps only the strongest N neighbours and reports how many it hid', () => {
    // The corpus has a node of degree 59; without a cap one click draws the whole graph.
    const graph = g([['H', 'A', 10], ['H', 'B', 20], ['H', 'C', 30], ['H', 'D', 40]]);
    const v = egoView(graph, 'H', 2);
    expect(v.neighbours).toEqual(['D', 'C']);
    expect(v.hidden).toBe(2);
  });

  it('includes edges among the neighbours, not only spokes to the focus', () => {
    // Without these the clustering coefficient is reported but invisible.
    const v = egoView(g([['H', 'A'], ['H', 'B'], ['A', 'B']]), 'H', 5);
    const pairs = v.edges.map((e) => `${e.a}${e.b}`).sort();
    expect(pairs).toContain('AB');
    expect(v.edges).toHaveLength(3);
  });

  it('never includes an edge to a neighbour it hid', () => {
    const v = egoView(g([['H', 'A', 90], ['H', 'B', 1], ['A', 'B', 90]]), 'H', 1);
    expect(v.neighbours).toEqual(['A']);
    for (const e of v.edges) {
      expect([e.a, e.b].every((n) => n === 'H' || v.neighbours.includes(n))).toBe(true);
    }
  });

  it('returns an empty view for an unknown node rather than throwing', () => {
    const v = egoView(g([['A', 'B']]), 'ZZZ', 5);
    expect(v.neighbours).toEqual([]);
    expect(v.edges).toEqual([]);
    expect(v.hidden).toBe(0);
  });

  it('orders neighbours by friction, strongest first', () => {
    const v = egoView(g([['H', 'A', 5], ['H', 'B', 80], ['H', 'C', 40]]), 'H', 3);
    expect(v.neighbours).toEqual(['B', 'C', 'A']);
  });
});

describe('walk trail', () => {
  it('appends the focus to the end', () => {
    expect(parseTrail('IND,PAK', 'CHN')).toEqual(['IND', 'PAK', 'CHN']);
  });

  it('drops a repeat so a cycle cannot grow without bound', () => {
    // Walking A -> B -> A must not accumulate A twice.
    expect(parseTrail('IND,CHN', 'IND')).toEqual(['CHN', 'IND']);
  });

  it('handles an absent or empty trail', () => {
    expect(parseTrail(undefined, 'IND')).toEqual(['IND']);
    expect(parseTrail('', 'IND')).toEqual(['IND']);
  });

  it('ignores blanks and normalises case', () => {
    expect(parseTrail('ind,,  pak ', 'CHN')).toEqual(['IND', 'PAK', 'CHN']);
  });

  it('caps length so a hand-edited URL cannot grow unboundedly', () => {
    const long = Array.from({ length: 60 }, (_, i) => `X${i}`).join(',');
    expect(parseTrail(long, 'IND').length).toBeLessThanOrEqual(24);
  });

  it('keeps the focus last even when the trail is truncated', () => {
    const long = Array.from({ length: 60 }, (_, i) => `X${i}`).join(',');
    const t = parseTrail(long, 'IND');
    expect(t[t.length - 1]).toBe('IND');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/graph-ego.test.ts`
Expected: FAIL — cannot resolve `@/lib/graph/ego`.

- [ ] **Step 3: Implement**

```typescript
// lib/graph/ego.ts
import type { Graph, GraphEdge } from '@/lib/graph/types';

/**
 * One state and its strongest connections.
 *
 * The cap is the reason this module exists. The corpus graph has a node of degree 59 out
 * of a possible 65, so an uncapped neighbourhood is very nearly the whole network and the
 * drilldown shows a hairball on its first click. Capping keeps every step legible, and
 * `hidden` keeps the omission honest rather than silent.
 *
 * Depth is always one. Walking to a neighbour is what moves you outward; a depth
 * parameter would be a second way to do the same thing that reintroduces exactly the
 * saturation the cap exists to prevent.
 */

export const DEFAULT_TOP_N = 10;
const MAX_TRAIL = 24;

export interface EgoView {
  focus: string;
  /** Strongest first. */
  neighbours: string[];
  /** Spokes from the focus plus edges among the visible neighbours. */
  edges: GraphEdge[];
  /** Neighbours omitted by the cap. Shown in the UI; never silently dropped. */
  hidden: number;
}

export function egoView(g: Graph<unknown>, focus: string, topN = DEFAULT_TOP_N): EgoView {
  const adj = g.adjacency.get(focus);
  if (!adj) return { focus, neighbours: [], edges: [], hidden: 0 };

  const ranked = [...adj.entries()]
    .sort(([an, ae], [bn, be]) => (be.friction - ae.friction) || (an < bn ? -1 : 1))
    .map(([n]) => n);

  const neighbours = ranked.slice(0, topN);
  const visible = new Set(neighbours);
  const edges: GraphEdge[] = [];

  for (const n of neighbours) edges.push(adj.get(n)!);
  // Edges among neighbours, without which a reported clustering coefficient is invisible.
  for (let i = 0; i < neighbours.length; i++) {
    for (let j = i + 1; j < neighbours.length; j++) {
      const e = g.adjacency.get(neighbours[i])?.get(neighbours[j]);
      if (e && visible.has(neighbours[i]) && visible.has(neighbours[j])) edges.push(e);
    }
  }

  return { focus, neighbours, edges, hidden: Math.max(0, ranked.length - neighbours.length) };
}

/**
 * The breadcrumb of a walk, taken from the URL and therefore untrusted: it is whatever
 * someone typed. Repeats collapse so a cycle cannot grow without bound, and the whole
 * thing is capped for the same reason.
 */
export function parseTrail(raw: string | undefined, focus: string): string[] {
  const seen = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .filter((s) => s !== focus.toUpperCase());

  const deduped: string[] = [];
  for (const s of seen) if (!deduped.includes(s)) deduped.push(s);

  // Keep the most recent steps: where you have just been matters more than where you began.
  const kept = deduped.slice(-(MAX_TRAIL - 1));
  return [...kept, focus.toUpperCase()];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/graph-ego.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/graph/ego.ts tests/graph-ego.test.ts
git commit -m "Cap the neighbourhood so a drilldown stays readable

The corpus graph has a node of degree 59 out of a possible 65. Without a cap the first
click draws very nearly the whole network and the drilldown is a hairball, so the view
keeps the strongest neighbours and reports how many it hid rather than dropping them
quietly.

Edges among the visible neighbours are included, not only spokes to the focus. Without
them the clustering coefficient is reported in the panel and invisible in the picture
beside it.

Trails come out of the URL and are therefore untrusted input: repeats collapse so a cycle
cannot grow without bound, and length is capped against a hand-edited address.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Deterministic radial layout, and the full-graph guarantee

**Files:**
- Create: `lib/graph/layout.ts`
- Test: `tests/graph-layout.test.ts`

**Interfaces:**
- Produces:
  - `interface Placed { id: string; x: number; y: number; r: number }`
  - `function radialLayout(view: EgoView, size?: number): { nodes: Placed[]; size: number }`

This task also carries the spec's load-bearing rule as an executable test.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/graph-layout.test.ts
import { describe, it, expect } from 'vitest';
import { buildGraph } from '@/lib/graph/build';
import { egoView } from '@/lib/graph/ego';
import { radialLayout } from '@/lib/graph/layout';
import { betweenness } from '@/lib/graph/metrics';

interface I { who: string[]; f: number }
const g = (pairs: [string, string, number?][]) =>
  buildGraph<I>(pairs.map(([a, b, f]) => ({ who: [a, b], f: f ?? 50 })),
    (i) => ({ participants: i.who, friction: i.f, alignment: 0 }));

describe('radial layout', () => {
  const graph = g([['H', 'A', 90], ['H', 'B', 60], ['H', 'C', 30]]);

  it('puts the focus at the centre', () => {
    const { nodes, size } = radialLayout(egoView(graph, 'H', 5));
    const focus = nodes.find((n) => n.id === 'H')!;
    expect(focus.x).toBeCloseTo(size / 2, 6);
    expect(focus.y).toBeCloseTo(size / 2, 6);
  });

  it('places every neighbour on one ring, equally spaced', () => {
    const { nodes, size } = radialLayout(egoView(graph, 'H', 5));
    const c = size / 2;
    const radii = nodes.filter((n) => n.id !== 'H')
      .map((n) => Math.hypot(n.x - c, n.y - c));
    for (const r of radii) expect(r).toBeCloseTo(radii[0], 6);
  });

  it('is deterministic — identical input gives byte-identical output', () => {
    // A force simulation would fail this, which is the reason there is not one.
    const a = radialLayout(egoView(graph, 'H', 5));
    const b = radialLayout(egoView(graph, 'H', 5));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('sizes a node by its edge weight, so the strongest tie reads as the largest', () => {
    const { nodes } = radialLayout(egoView(graph, 'H', 5));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get('A')!.r).toBeGreaterThan(byId.get('C')!.r);
  });

  it('keeps every node inside the canvas', () => {
    const { nodes, size } = radialLayout(egoView(graph, 'H', 5));
    for (const n of nodes) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(0);
      expect(n.y - n.r).toBeGreaterThanOrEqual(0);
      expect(n.x + n.r).toBeLessThanOrEqual(size);
      expect(n.y + n.r).toBeLessThanOrEqual(size);
    }
  });

  it('handles a focus with no neighbours', () => {
    const { nodes } = radialLayout(egoView(g([['A', 'B']]), 'ZZZ', 5));
    expect(nodes).toEqual([]);
  });
});

describe('the full-graph rule', () => {
  it('measures betweenness on the whole network, not on what is drawn', () => {
    /*
     * The spec's load-bearing constraint, as an executable test. B brokers between the
     * A-side and the C/D-side of the full graph. Measured inside A's ego view, where the
     * far side is not present, B brokers nothing. Both numbers are called betweenness and
     * only one of them means anything, so this asserts they differ — if a later refactor
     * "optimises" by measuring the subgraph, this fails.
     */
    const full = g([['A', 'B'], ['B', 'C'], ['C', 'D']]);
    const whole = betweenness(full);

    const view = egoView(full, 'A', 10);
    const drawn = buildGraph<I>(
      view.edges.map((e) => ({ who: [e.a, e.b], f: e.friction })),
      (i) => ({ participants: i.who, friction: i.f, alignment: 0 }));
    const subgraph = betweenness(drawn);

    expect(whole.get('B')).toBeGreaterThan(0);
    expect(subgraph.get('B') ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/graph-layout.test.ts`
Expected: FAIL — cannot resolve `@/lib/graph/layout`.

- [ ] **Step 3: Implement**

```typescript
// lib/graph/layout.ts
import type { EgoView } from '@/lib/graph/ego';

/**
 * Where to draw an ego view.
 *
 * A pure function rather than logic inside the component, so determinism can be asserted
 * directly — and determinism is the whole argument for a radial layout over a force
 * simulation. At ten nodes physics buys nothing, and a picture that differs between loads
 * cannot be regression-tested or usefully screenshotted.
 *
 * Neighbours sit on one ring in weight order, strongest at the top and continuing
 * clockwise, so position carries meaning instead of being an artefact of a solver.
 */

export interface Placed { id: string; x: number; y: number; r: number }

const FOCUS_R = 26;
const MIN_R = 9;
const MAX_R = 20;
const PADDING = 26;

export function radialLayout(view: EgoView, size = 520): { nodes: Placed[]; size: number } {
  if (!view.neighbours.length) return { nodes: [], size };

  const c = size / 2;
  const ring = c - PADDING - MAX_R;
  const nodes: Placed[] = [{ id: view.focus, x: c, y: c, r: FOCUS_R }];

  const weightOf = new Map<string, number>();
  for (const n of view.neighbours) {
    const e = view.edges.find((x) => (x.a === view.focus && x.b === n) || (x.b === view.focus && x.a === n));
    weightOf.set(n, e?.friction ?? 0);
  }
  const max = Math.max(...weightOf.values(), 1);

  view.neighbours.forEach((n, i) => {
    // Start at twelve o'clock and go clockwise, so the strongest tie is always at the top.
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / view.neighbours.length;
    nodes.push({
      id: n,
      x: c + ring * Math.cos(angle),
      y: c + ring * Math.sin(angle),
      r: MIN_R + (MAX_R - MIN_R) * (weightOf.get(n)! / max),
    });
  });

  return { nodes, size };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/graph-layout.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, 252 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/graph/layout.ts tests/graph-layout.test.ts
git commit -m "Place an ego view deterministically, and prove the full-graph rule

Layout is a pure function rather than logic inside a component so that determinism can be
asserted directly, which is the whole argument for a ring over a force simulation: at ten
nodes physics buys nothing, and a picture that differs between loads cannot be
regression-tested. Neighbours sit in weight order from twelve o'clock, so position means
something instead of being an artefact of a solver.

This also carries the spec's load-bearing constraint as an executable test. A node's
betweenness across the whole network and its betweenness inside a drawn subgraph are
different quantities sharing a name, and only one of them means anything. The test asserts
they differ, so a later refactor that measures what is on screen fails here rather than
shipping an authoritative-looking wrong number.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The page and its components

**Files:**
- Create: `components/NetworkGraph.tsx`, `components/NetworkMetrics.tsx`, `app/network/[iso]/page.tsx`
- Modify: `lib/quota/index.ts` (add one METERED entry), `components/Nav.tsx` (add one LINKS entry)

**Interfaces:**
- Consumes: `stateGraph` from `@/lib/graph/build`; `egoView`, `parseTrail`, `DEFAULT_TOP_N` from `@/lib/graph/ego`; `radialLayout` from `@/lib/graph/layout`; all measures from `@/lib/graph/metrics`; `corpus`, `countryName` from `@/lib/queries`; `consume` from `@/lib/quota`; `Panel`, `SectionTitle`, `Stat`, `Badge`, `Empty` from `@/components/ui`; `Paywall` from `@/components/Paywall`; `BY_ISO` from `@/data/countries`.

- [ ] **Step 1: Register the metered action**

In `lib/quota/index.ts`, add to the `METERED` object, after `country_deepdive`:

```typescript
  network_graph: 'Network graph of connected states',
```

- [ ] **Step 2: Write the graph component**

```tsx
// components/NetworkGraph.tsx
import Link from 'next/link';
import type { EgoView } from '@/lib/graph/ego';
import { radialLayout } from '@/lib/graph/layout';

/**
 * An ego view as server-rendered SVG, following components/charts.tsx: no charting
 * library, every mark matching the design system, and nothing requiring the client.
 *
 * Each neighbour is a link, so walking the network is ordinary navigation — the back
 * button is the undo, a walk is a shareable URL, and there is no graph state to hydrate.
 */
export function NetworkGraph({ view, trail }: { view: EgoView; trail: string[] }) {
  const { nodes, size } = radialLayout(view);
  if (!nodes.length) {
    return <p className="p-6 text-[12px] text-muted">No connections recorded for this state in the current corpus.</p>;
  }

  const at = new Map(nodes.map((n) => [n.id, n]));
  const nextTrail = (to: string) => [...trail.filter((t) => t !== to), view.focus].join(',');
  const maxFriction = Math.max(...view.edges.map((e) => e.friction), 1);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full" role="img"
         aria-label={`Network around ${view.focus}, ${view.neighbours.length} connections shown`}>
      {view.edges.map((e) => {
        const p = at.get(e.a); const q = at.get(e.b);
        if (!p || !q) return null;
        const spoke = e.a === view.focus || e.b === view.focus;
        return (
          <g key={`${e.a}|${e.b}`}>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y}
              stroke="var(--color-severe)"
              strokeWidth={0.8 + 3.4 * (e.friction / maxFriction)}
              strokeOpacity={spoke ? 0.55 : 0.22} />
            {e.alignmentEvents > 0 && (
              // The alignment overlay: dashed, distinct, and never drawn without its count.
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                stroke="var(--color-verified)" strokeWidth="1.6" strokeDasharray="3 3" strokeOpacity="0.85">
                <title>{`${e.a}–${e.b}: ${e.alignmentEvents} de-escalatory event${e.alignmentEvents === 1 ? '' : 's'} of ${e.events}`}</title>
              </line>
            )}
          </g>
        );
      })}

      {nodes.map((n) => {
        const isFocus = n.id === view.focus;
        const edge = view.edges.find((e) =>
          (e.a === view.focus && e.b === n.id) || (e.b === view.focus && e.a === n.id));
        const circle = (
          <>
            <circle cx={n.x} cy={n.y} r={n.r}
              fill={isFocus ? 'var(--color-accent)' : 'var(--color-panel)'}
              stroke={isFocus ? 'var(--color-accent)' : 'var(--color-line)'} strokeWidth="1.5" />
            <text x={n.x} y={n.y + 4} textAnchor="middle"
              className="mono-num"
              fontSize={isFocus ? 13 : 11}
              fill={isFocus ? 'var(--color-ink)' : 'var(--color-text)'}>{n.id}</text>
            <title>{edge
              ? `${n.id} — friction ${edge.friction}, ${edge.events} shared event${edge.events === 1 ? '' : 's'}`
              : n.id}</title>
          </>
        );
        return isFocus ? <g key={n.id}>{circle}</g> : (
          <Link key={n.id} href={`/network/${n.id}?trail=${nextTrail(n.id)}`}>{circle}</Link>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 3: Write the metrics component**

```tsx
// components/NetworkMetrics.tsx
/**
 * What the measures mean, beside what they are. A number with no reading is a number
 * nobody can act on, and these are unfamiliar enough that the reading is the product.
 */
export interface MetricRow { label: string; value: string; reading: string }

export function NetworkMetrics({ rows, thin }: { rows: MetricRow[]; thin: boolean }) {
  return (
    <div className="space-y-3">
      {thin && (
        <p className="rounded border border-[color:var(--color-line)] px-3 py-2 text-[11px] text-muted">
          This state has one or two recorded connections. Network measures are reported for
          completeness, but they rest on too little evidence to compare against a
          well-connected state.
        </p>
      )}
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded border border-[color:var(--color-line)] p-3">
            <dt className="text-[10px] uppercase tracking-wider text-faint">{r.label}</dt>
            <dd className="mono-num mt-0.5 text-[18px] text-text">{r.value}</dd>
            <dd className="mt-1 text-[11px] leading-snug text-muted">{r.reading}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

```tsx
// app/network/[iso]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Panel, SectionTitle } from '@/components/ui';
import { Paywall } from '@/components/Paywall';
import { NetworkGraph } from '@/components/NetworkGraph';
import { NetworkMetrics, type MetricRow } from '@/components/NetworkMetrics';
import { corpus } from '@/lib/queries';
import { stateGraph } from '@/lib/graph/build';
import { egoView, parseTrail, DEFAULT_TOP_N } from '@/lib/graph/ego';
import {
  degree, weightedDegree, betweenness, closeness,
  eigenvector, clusteringCoefficient, kCore, conflictClusters,
} from '@/lib/graph/metrics';
import { consume } from '@/lib/quota';
import { BY_ISO } from '@/data/countries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ iso: string }> }) {
  const { iso } = await params;
  const c = BY_ISO.get(iso.toUpperCase());
  return { title: c ? `${c.name} — network` : 'Network' };
}

/** Rank within a map, 1 = highest. Betweenness is only readable against its peers. */
function rankOf(scores: Map<string, number>, iso: string): number {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.findIndex(([n]) => n === iso) + 1;
}

export default async function NetworkPage({
  params, searchParams,
}: {
  params: Promise<{ iso: string }>;
  searchParams: Promise<{ trail?: string; n?: string }>;
}) {
  const { iso: raw } = await params;
  const { trail: rawTrail, n: rawN } = await searchParams;
  const iso = raw.toUpperCase();
  const country = BY_ISO.get(iso);
  if (!country) notFound();

  // One credit for the feature, not one per hop. consume() keys on the unique
  // (action, target) pair, so a constant target charges once and never again — without
  // which a five-action allowance would be spent in five clicks of a drilldown.
  const gate = await consume('network_graph', 'network');
  if (!gate.allowed) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <Paywall what={`The ${country.name} connection network`} kind={gate.kind} />
      </main>
    );
  }

  const events = corpus();
  const graph = stateGraph(events);

  // Measured on the whole graph. See tests/graph-layout.test.ts for why this matters.
  const bc = betweenness(graph);
  const ev = eigenvector(graph);
  const cl = closeness(graph);
  const cores = kCore(graph);
  const clusters = conflictClusters(graph);

  const topN = Math.max(3, Math.min(24, Number(rawN) || DEFAULT_TOP_N));
  const view = egoView(graph, iso, topN);
  const trail = parseTrail(rawTrail, iso);
  const deg = degree(graph, iso);

  const rows: MetricRow[] = [
    { label: 'Connections', value: String(deg),
      reading: `States sharing at least one event with ${iso}${view.hidden ? `; the ${view.hidden} weakest are not drawn` : ''}.` },
    { label: 'Total friction', value: String(Math.round(weightedDegree(graph, iso))),
      reading: 'Summed tension across every connection. Compare with the risk index — a gap between them is worth a look.' },
    { label: 'Brokerage', value: `#${rankOf(bc, iso)} of ${graph.nodes.length}`,
      reading: 'How often this state lies on the shortest route between two others. A high rank means it connects disputes that do not otherwise touch.' },
    { label: 'Contagion exposure', value: `#${rankOf(ev, iso)} of ${graph.nodes.length}`,
      reading: 'Embroiled with states that are themselves embroiled, rather than merely embroiled with many.' },
    { label: 'Reach', value: `#${rankOf(cl, iso)} of ${graph.nodes.length}`,
      reading: 'How near this state sits to the rest of the network along the strongest available paths.' },
    { label: 'Entanglement', value: clusteringCoefficient(graph, iso).toFixed(2),
      reading: clusteringCoefficient(graph, iso) > 0.5
        ? 'Most of its counterparts are also in dispute with each other: one entangled theatre.'
        : 'Its counterparts largely do not dispute with each other: separate fronts rather than one theatre.' },
    { label: 'Core depth', value: String(cores.get(iso) ?? 0),
      reading: 'Depth within the densely connected middle of the network. Higher means further from the periphery.' },
    { label: 'Conflict cluster', value: `#${(clusters.get(iso) ?? 0) + 1}`,
      reading: 'Group of states most embroiled with one another. These are mutual antagonists, not a bloc or an alliance.' },
  ];

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <SectionTitle>{country.name} — network</SectionTitle>

      <nav aria-label="Walk" className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted">
        {trail.map((t, i) => (
          <span key={`${t}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-faint">→</span>}
            {i === trail.length - 1
              ? <span className="text-text">{t}</span>
              : <Link href={`/network/${t}?trail=${trail.slice(0, i).join(',')}`}
                      className="hover:text-[color:var(--color-accent)]">{t}</Link>}
          </span>
        ))}
      </nav>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <NetworkGraph view={view} trail={trail} />
          <p className="px-4 pb-4 text-[11px] leading-snug text-muted">
            Line thickness is friction. Dashed lines mark the {' '}
            <span className="text-[color:var(--color-verified)]">de-escalatory signal</span>, which
            across the whole corpus rests on a small number of events and is an overlay rather
            than a measurement of cooperation. Click any state to walk to it.
          </p>
        </Panel>

        <Panel>
          <div className="p-4">
            <NetworkMetrics rows={rows} thin={deg > 0 && deg <= 2} />
          </div>
        </Panel>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Add the nav link**

In `components/Nav.tsx`, add to `LINKS` after the Dashboard entry:

```typescript
  { href: '/network/CHN', label: 'Network' },
```

**On an empty corpus:** no page-level guard is needed. `app/layout.tsx:52` renders
`<EmptyCorpus />` above every page when the corpus is empty, so the first-run panel the
spec asks for is already there. `NetworkGraph` separately handles the narrower case of a
state that exists but has no recorded connections. Do not add a third check.

- [ ] **Step 6: Verify it builds and renders**

Run: `npm run build`
Expected: PASS, with `/network/[iso]` listed among the routes.

Then start the dev server and check the page renders, using the Browser pane rather than asking anyone to look:
- `/network/CHN` shows a ring of neighbours, the metrics panel, and a one-item trail.
- Clicking a neighbour navigates and extends the trail.
- `/network/ZZZ` returns 404.
- `/network/CHN?n=3` shows three neighbours and reports the rest as hidden.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS, 252 tests (no new tests in this task; the modules beneath it are covered).

- [ ] **Step 8: Commit**

```bash
git add components/NetworkGraph.tsx components/NetworkMetrics.tsx app/network lib/quota/index.ts components/Nav.tsx
git commit -m "Walk the network of states, one neighbourhood at a time

Server-rendered SVG following components/charts.tsx: no charting library, no client
component, and every neighbour an ordinary link. Walking is navigation, so the back button
is the undo and a walk is a URL somebody can send to a colleague.

Quota is charged once for entering, not once per hop. consume() already keys on the unique
(action, target) pair so a refresh cannot cost a second credit; passing a constant target
turns that into one credit for the feature. Metering each re-centre would have spent the
whole free allowance in five clicks, on the one feature whose value is walking further
than five steps.

Every measure is shown with a reading of what it means, because a betweenness rank with no
gloss is a number nobody can act on. The cluster row says in as many words that these are
mutual antagonists rather than a bloc.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Document the measures and update project state

**Files:**
- Modify: `app/methodology/page.tsx`, `README.md`, `STATE.md`

- [ ] **Step 1: Add a methodology section**

Find the existing scoring-weights section in `app/methodology/page.tsx` and add one after it, matching the surrounding markup exactly. It must state, in prose:

- An edge means two states appeared in the same clustered event. That is a **reporting** relationship, not a diplomatic one — two states in one article are not necessarily interacting.
- Friction reuses `impact()`, the same function behind the dyad tension scores, so the two cannot disagree.
- Alignment applies that same confidence gate and recency decay to the negative half of the escalation scale, which the risk index discards. **Across the corpus it rests on roughly 2% of events**, so it is drawn as an overlay and carries no measure of its own.
- All measures are computed on the full network, never on the neighbourhood being drawn.
- Distance is the reciprocal of friction: a strong tie means two states are close.
- Conflict clusters group states embroiled **with each other**. They are not blocs, alliances, or alignments.
- Measures are as-of-now over the 90-day retention window, not a historical series.

- [ ] **Step 2: Add a README section**

After the alerts section in `README.md`, describe the feature in that file's voice: what `/network/[iso]` shows, that drilldown is URL-driven and therefore shareable, that the fan-out cap exists because the graph has a node of degree 59, and that metrics are whole-graph.

- [ ] **Step 3: Update STATE.md**

- In "What is done", add the network graph to the feature list.
- Update the test count in the State table to the actual figure from `npm test`.
- In "Where to go next", add person-node extraction as a numbered item: the engine takes an extractor and is ready for it; what is missing is cross-lingual recognition and resolution of named individuals, which is a pipeline change rather than a graph one.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add app/methodology/page.tsx README.md STATE.md
git commit -m "Document what the network measures do and do not claim

Every other weight in this product is on /methodology, and these are less familiar than
most, so they need it more. The two claims that matter are the ones a reader would
otherwise assume: an edge is a reporting relationship rather than a diplomatic one, and
the de-escalatory overlay rests on about 2% of the corpus.

STATE.md gains person-node extraction as an explicit next step. The engine already takes
an extractor, so what is missing is cross-lingual recognition and resolution of named
individuals — a change to the ingest pipeline, not to any of the graph code.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
