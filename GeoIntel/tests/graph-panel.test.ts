// tests/graph-panel.test.ts
//
// networkPanel() exists to close a gap Task 6's own tests could not close. The spec's
// most load-bearing constraint is that every network measure is computed on the whole
// graph, never on the ego subgraph a page draws — tests/graph-layout.test.ts pins that
// arithmetic difference, but it builds its own subgraph by hand and calls betweenness()
// directly, with zero coupling to any real call site. If app/network/[iso]/page.tsx had
// gone on to compute its eight measures inline next to a separately-derived ego view (as
// the original task brief did), a later "simplification" that measured view.edges or the
// capped neighbour list instead of the full graph would ship an authoritative-looking
// wrong rank, and nothing already in the suite would notice.
//
// networkPanel(graph, iso, topN) closes that structurally: it is the only function
// allowed to run a measure, it takes the full graph as its only graph-shaped argument,
// and it derives the ego view itself — so a page that calls it once has no second graph
// in scope to pass to a measure by mistake. The first test below is the reason this file
// exists; the rest defend the parts of its output a one-character slip could silently
// wrong.
//
// Mutation notes (one-character or near-one-character change each test would catch):
// - "measures every rank on the whole graph...": replacing `graph.nodes.length` with any
//   subgraph-derived count (e.g. `view.neighbours.length + 1`) in the rank denominator.
// - "caps the drawn view without capping the rank denominator": conflating topN (the
//   cap) with nodeCount (the true size) anywhere in the rows or the returned nodeCount.
// - "delegates ego derivation to egoView": a hand-rolled neighbour computation inside
//   networkPanel that quietly diverges from the already-tested egoView().
// - "does not throw... producing well-formed zero values": deleting either `?? 0`
//   fallback (cores.get / clusters.get), which turns a row into the literal string
//   "undefined" or "#NaN" without throwing — so a bare not.toThrow() would miss it.
// - the two entanglement tests plus the boundary test together catch a `>` flipped to
//   `<` (either direction) or weakened to `>=`.
// - "emits exactly the eight measures, in a fixed order": renaming, dropping, adding or
//   reordering any row label.

import { describe, it, expect } from 'vitest';
import { buildGraph } from '@/lib/graph/build';
import { egoView } from '@/lib/graph/ego';
import { networkPanel } from '@/lib/graph/panel';

interface I { who: string[]; f: number }
const g = (pairs: [string, string, number?][]) =>
  buildGraph<I>(pairs.map(([a, b, f]) => ({ who: [a, b], f: f ?? 50 })),
    (i) => ({ participants: i.who, friction: i.f, alignment: 0 }));

describe('networkPanel — the full-graph rule', () => {
  it('measures every rank on the whole graph, never on the drawn ego view', () => {
    // Path A-B-C-D, focus on B. B's ego view (topN=10) holds only A and C — a view of
    // 3 nodes total (focus + 2 neighbours) — so a rank computed against the subgraph
    // that gets drawn would report "of 3". Measured on the whole 4-node network it must
    // report "of 4". This is the coupling tests/graph-layout.test.ts could not provide:
    // that test constructs its own subgraph and asserts the numbers differ in
    // isolation, with no route back to any real function a page calls. Here, if
    // networkPanel is later "optimised" to measure egoView(...) or view.edges instead
    // of the `graph` argument, this denominator drops to 3 and only this test fails.
    const g4 = g([['A', 'B'], ['B', 'C'], ['C', 'D']]);
    const panel = networkPanel(g4, 'B', 10);
    expect(panel.view.neighbours.sort()).toEqual(['A', 'C']);
    expect(panel.rows.find((r) => r.label === 'Brokerage')!.value).toContain('of 4');
  });

  it('caps the drawn view without capping the rank denominator', () => {
    // Hub H with 5 leaves, distinct friction so ranking is unambiguous: A(90) > B(80) >
    // C(70) > D(60) > E(50). 6 nodes total. topN=3 must cap the drawn view to the
    // strongest 3 and report the other 2 as hidden, while every rank in `rows` is still
    // read against all 6 nodes. Conflating the cap with the true count (e.g. reporting
    // nodeCount as view.neighbours.length, or sizing "of N" off topN) would make this
    // fail without any subgraph ever being drawn to the wrong strength.
    const star = g([['H', 'A', 90], ['H', 'B', 80], ['H', 'C', 70], ['H', 'D', 60], ['H', 'E', 50]]);
    const panel = networkPanel(star, 'H', 3);

    expect(panel.view.neighbours).toEqual(['A', 'B', 'C']);
    expect(panel.view.hidden).toBe(2);
    expect(panel.nodeCount).toBe(6);
    // H brokers every leaf-to-leaf path in a star, so it is unambiguously rank #1 —
    // the only question this line settles is the denominator beside it.
    expect(panel.rows.find((r) => r.label === 'Brokerage')!.value).toBe('#1 of 6');
    expect(panel.rows.find((r) => r.label === 'Connections')!.reading)
      .toBe('States sharing at least one event with H; the 2 weakest are not drawn.');
  });

  it('delegates ego derivation to egoView rather than re-deriving it', () => {
    const ring = g([['H', 'A', 90], ['H', 'B', 60], ['H', 'C', 30]]);
    const panel = networkPanel(ring, 'H', 2);
    expect(panel.view).toEqual(egoView(ring, 'H', 2));
  });
});

describe('networkPanel — robustness', () => {
  it('reports no position at all for an iso absent from the graph, rather than rank zero', () => {
    // A-B-C, 3 nodes; 'ZZZ' is nowhere in it. Every measure must degrade to a defined,
    // renderable value rather than throwing or leaking 'undefined'/'NaN' into the UI.
    // A bare not.toThrow() would NOT catch deleting the `?? 0` fallback on cores.get,
    // because Map#get never throws on a missing key — it just returns undefined, which
    // String() renders as the literal text "undefined" and arithmetic turns into NaN.
    // Pinning the exact rendered value is what makes that mutation fail.
    //
    // This test previously asserted '#0 of 3' and Conflict cluster '#1' as correct, which
    // is what let both ship: rank 0 is not a position in a 1..N ordering, and cluster '#1'
    // asserts membership of a cluster that exists and holds real states. An em dash is the
    // only honest rendering for a state the ranking does not contain.
    const g3 = g([['A', 'B'], ['B', 'C']]);
    let panel!: ReturnType<typeof networkPanel>;
    expect(() => { panel = networkPanel(g3, 'ZZZ', 10); }).not.toThrow();

    const byLabel = new Map(panel.rows.map((r) => [r.label, r]));
    expect(byLabel.get('Connections')!.value).toBe('0');
    expect(byLabel.get('Total friction')!.value).toBe('0');
    expect(byLabel.get('Brokerage')!.value).toBe('—');
    expect(byLabel.get('Contagion exposure')!.value).toBe('—');
    expect(byLabel.get('Reach')!.value).toBe('—');
    expect(byLabel.get('Entanglement')!.value).toBe('0.00');
    expect(byLabel.get('Core depth')!.value).toBe('0');
    expect(byLabel.get('Conflict cluster')!.value).toBe('—');
    expect(panel.view.neighbours).toEqual([]);
    expect(panel.degree).toBe(0);
    // The reason must reach the reader, not just the absence of a number.
    expect(byLabel.get('Brokerage')!.reading).toContain('holds no position');
    expect(byLabel.get('Conflict cluster')!.reading).toContain('belongs to no cluster');
  });
});

describe('networkPanel — rank ties', () => {
  // Two triangles (A-B-C and D-E-F) joined by the bridge C-D, plus a detached triangle
  // G-H-I. Betweenness is C=6, D=6 and exactly 0 for the other seven.
  const tied = () => g([
    ['A', 'B'], ['B', 'C'], ['A', 'C'],
    ['C', 'D'],
    ['D', 'E'], ['E', 'F'], ['D', 'F'],
    ['G', 'H'], ['H', 'I'], ['G', 'I'],
  ]);
  const brokerage = (graph: ReturnType<typeof g>, iso: string) =>
    networkPanel(graph, iso, 10).rows.find((r) => r.label === 'Brokerage')!;

  it('gives every state on an identical score the same rank, not consecutive alphabetical ones', () => {
    // Competition ranking: C and D share #1, and the seven zero-scorers all share #3.
    //
    // This is the mutation that shipped. The previous implementation took a sorted index
    // (`findIndex(...) + 1`), so the seven zeros came out #3,#4,#5,#6,#7,#8,#9 — ordered
    // by ISO code, because Graph.nodes is sorted and Array#sort is stable. A ranked six
    // places above I purely because 'A' < 'I', and the panel presented that as structure.
    // Asserting A and I are EQUAL is what kills it: under the old code A is #3 and I is #9.
    const t = tied();
    expect(brokerage(t, 'C').value).toBe('#1 of 9');
    expect(brokerage(t, 'D').value).toBe('#1 of 9');
    expect(brokerage(t, 'A').value).toBe('#3 of 9');
    expect(brokerage(t, 'I').value).toBe('#3 of 9');
    expect(brokerage(t, 'A').value).toBe(brokerage(t, 'I').value);
  });

  it('says how many states share a rank, so a shared position cannot read as a solo one', () => {
    // A rank is only honest if the sharing is visible: "#3 of 9" held alone and "#3 of 9"
    // held with six others are very different claims and render identically without this.
    const t = tied();
    expect(brokerage(t, 'A').reading).toContain('Shared with 6 other states');
    // Singular, to catch a hardcoded plural.
    expect(brokerage(t, 'C').reading).toContain('Shared with 1 other state on');
  });

  it('stays silent about ties when the rank is genuinely held alone', () => {
    // Path A-B-C: B is the only broker, so nothing is shared and the row must not say so.
    // Without this, appending the note unconditionally would pass both tests above.
    const path = g([['A', 'B'], ['B', 'C']]);
    expect(brokerage(path, 'B').reading).not.toContain('Shared with');
  });
});

describe('networkPanel — entanglement reading', () => {
  it('reads as one entangled theatre when the coefficient exceeds 0.5', () => {
    // X, A, B, C form a K4: X's three neighbours (A, B, C) are also all mutually
    // connected, so clusteringCoefficient(X) = 1 — squarely the entangled branch.
    const clique = g([
      ['X', 'A'], ['X', 'B'], ['X', 'C'],
      ['A', 'B'], ['B', 'C'], ['A', 'C'],
    ]);
    const row = networkPanel(clique, 'X', 10).rows.find((r) => r.label === 'Entanglement')!;
    expect(row.value).toBe('1.00');
    expect(row.reading).toBe('Most of its counterparts are also in dispute with each other: one entangled theatre.');
  });

  it('reads as separate fronts when the coefficient is 0 (no shared disputes among counterparts)', () => {
    // H's three leaves share no edges with each other: coefficient = 0.
    const star = g([['H', 'A'], ['H', 'B'], ['H', 'C']]);
    const row = networkPanel(star, 'H', 10).rows.find((r) => r.label === 'Entanglement')!;
    expect(row.value).toBe('0.00');
    expect(row.reading).toBe('Its counterparts largely do not dispute with each other: separate fronts rather than one theatre.');
  });

  it('keeps the boundary value 0.50 on the separate-fronts side, not the entangled one', () => {
    // H has four neighbours (A, B, C, D); among them only A-B, A-C and A-D are
    // connected — 3 of the 6 possible pairs — giving clusteringCoefficient exactly
    // 2*3 / (4*3) = 0.50. The reading branches on a strict `> 0.5`, so this exact
    // boundary must land on "separate fronts". This is what catches `>` being
    // weakened to `>=` (which the two tests above cannot: 1 and 0 are both far enough
    // from the boundary that `>` and `>=` agree on them).
    const boundary = g([
      ['H', 'A'], ['H', 'B'], ['H', 'C'], ['H', 'D'],
      ['A', 'B'], ['A', 'C'], ['A', 'D'],
    ]);
    const row = networkPanel(boundary, 'H', 10).rows.find((r) => r.label === 'Entanglement')!;
    expect(row.value).toBe('0.50');
    expect(row.reading).toBe('Its counterparts largely do not dispute with each other: separate fronts rather than one theatre.');
  });
});

describe('networkPanel — row shape', () => {
  it('emits exactly the eight measures, in a fixed order', () => {
    // NetworkMetrics renders rows in array order and every other test in this file
    // looks a row up by label (immune to reordering), so this is the only place a
    // renamed, dropped, added or reordered label would be caught.
    const path = g([['A', 'B'], ['B', 'C']]);
    const panel = networkPanel(path, 'B', 10);
    expect(panel.rows.map((r) => r.label)).toEqual([
      'Connections', 'Total friction', 'Brokerage', 'Contagion exposure',
      'Reach', 'Entanglement', 'Core depth', 'Conflict cluster',
    ]);
  });

  it('never calls a cluster a bloc or an alliance without saying so is false', () => {
    // "Conflict cluster" must keep reading as mutual antagonists, matching the project
    // rule that these groups are never presented as a bloc/alliance/alignment. The
    // reading is allowed to use the word "bloc" only to deny it applies.
    const path = g([['A', 'B'], ['B', 'C']]);
    const reading = networkPanel(path, 'B', 10).rows.find((r) => r.label === 'Conflict cluster')!.reading;
    expect(reading).toContain('mutual antagonists');
    expect(reading).toContain('not a bloc or an alliance');
  });
});
