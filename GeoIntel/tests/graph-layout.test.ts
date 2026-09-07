// Tests for the deterministic ForceAtlas2 layout and the full-graph rule.
//
// Two critical properties are tested here. First, determinism: a layout function is pure and
// free of side effects, so pictures don't change between page loads and can be regression-
// tested. A force simulation normally FAILS this, because ForceAtlas2 seeds from random
// positions — which is why this one seeds from a fixed ring and runs a fixed number of steps
// with a fixed cooling schedule, and why the determinism test below is load-bearing rather
// than decorative. Second, the full-graph rule: betweenness is measured on the entire network,
// not on the ego subgraph that is drawn. These are different quantities wearing the same name,
// and only one of them has meaning. This file pins the arithmetic difference between
// whole-graph and drawn-subgraph betweenness as documentation-by-example, demonstrating why
// the distinction matters. It is not a guard on any call site (the test constructs its own
// data and calls the graph functions directly), but a demonstration that later code must care
// which quantity it computes.
//
// A third property is pinned by exact coordinates: the solver's settled output for a known
// fixture. Under the old ring layout this test asserted start angle, clockwise direction and
// equal spacing, because ANGLE encoded rank there. ForceAtlas2 cannot preserve that — position
// is an artefact of the solver — so what is pinned instead is the settled geometry itself,
// which is what stands between the force constants and an undetected change to them.
//
// The property worth having that the ring could not express is structural, and is tested
// directly: neighbours that fight EACH OTHER as well as the focus settle together, so a
// reader can see at a glance whether a neighbourhood is one entangled theatre or several
// separate fronts.

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

  it('separates every node, which is the job repulsion exists to do', () => {
    // The ring guaranteed separation geometrically. A force layout has to earn it: if
    // repulsion is too weak, or the cooling schedule runs the step size to nothing before
    // the nodes have untangled, they pile up and the picture becomes unreadable. Measured
    // between node EDGES rather than centres, since that is what overlapping means visually.
    const star = g([['H', 'A'], ['H', 'B'], ['H', 'C'], ['H', 'D'], ['H', 'E']]);
    const { nodes } = radialLayout(egoView(star, 'H', 5));
    expect(nodes).toHaveLength(6);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const gap = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y)
          - nodes[i].r - nodes[j].r;
        expect(gap).toBeGreaterThan(0);
      }
    }
  });

  it('settles mutual antagonists together, which is why this is a force layout', () => {
    // The reason for the change from a ring. A and B fight each other as well as the focus;
    // so do C and D; there is no A-C or B-D edge. ForceAtlas2 should pull each pair together
    // and push the pairs apart, so the picture shows two separate fronts rather than four
    // states in a row. A ring cannot express this at all — it would place all four at equal
    // spacing regardless of who fights whom, which is exactly what it did.
    //
    // Asserting that EVERY within-pair distance beats EVERY across-pair distance, rather
    // than comparing two chosen pairs, is what makes this fail if the attraction term is
    // dropped: with no edge attraction the four settle into a symmetric ring and the two
    // sets of distances interleave.
    const two = g([['H', 'A'], ['H', 'B'], ['H', 'C'], ['H', 'D'], ['A', 'B'], ['C', 'D']]);
    const { nodes } = radialLayout(egoView(two, 'H', 5));
    const at = new Map(nodes.map((n) => [n.id, n]));
    const d = (p: string, q: string) =>
      Math.hypot(at.get(p)!.x - at.get(q)!.x, at.get(p)!.y - at.get(q)!.y);

    const within = Math.max(d('A', 'B'), d('C', 'D'));
    const across = Math.min(d('A', 'C'), d('A', 'D'), d('B', 'C'), d('B', 'D'));
    expect(within).toBeLessThan(across);
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

  it('pins the settled geometry exactly, so a change to the force constants cannot pass', () => {
    // The solver's output for a known fixture, to four significant figures. This is the
    // regression guard on ITERATIONS, REPULSION, GRAVITY, SPEED and the cooling schedule:
    // any change to any of them moves these numbers, and a layout that silently re-tunes
    // itself between releases makes every prior screenshot incomparable.
    //
    // It also pins determinism harder than the equality test above, which only proves two
    // calls in the same process agree. These literals were read off the implementation, so
    // they prove nothing about correctness on their own — the two tests above carry that.
    // What they prove is that the picture has not moved.
    //
    // H is pinned at the centre and takes no forces; the four neighbours settle into two
    // opposed pairs, which is the A-B / C-D structure of the fixture.
    const two = g([['H', 'A'], ['H', 'B'], ['H', 'C'], ['H', 'D'], ['A', 'B'], ['C', 'D']]);
    const { nodes } = radialLayout(egoView(two, 'H', 5));
    const byId = new Map(nodes.map((n) => [n.id, n]));

    expect(byId.get('H')!.x).toBeCloseTo(260, 6);
    expect(byId.get('H')!.y).toBeCloseTo(260, 6);
    expect(byId.get('A')!.x).toBeCloseTo(288.57, 1);
    expect(byId.get('A')!.y).toBeCloseTo(116.14, 1);
    expect(byId.get('B')!.x).toBeCloseTo(403.86, 1);
    expect(byId.get('B')!.y).toBeCloseTo(231.43, 1);
    expect(byId.get('C')!.x).toBeCloseTo(231.43, 1);
    expect(byId.get('C')!.y).toBeCloseTo(403.86, 1);
    expect(byId.get('D')!.x).toBeCloseTo(116.14, 1);
    expect(byId.get('D')!.y).toBeCloseTo(288.57, 1);
  });
});

describe('the full-graph rule', () => {
  it('measures betweenness on the whole network, not on what is drawn', () => {
    /*
     * Documentation-by-example of why the full-graph rule matters. B brokers between the
     * A-side and the C/D-side in the full graph (betweenness > 0) but brokers nothing
     * inside A's ego view (betweenness = 0). These are different quantities wearing the
     * same name, and only one of them has meaning. This test pins that arithmetic
     * difference — not a guard on any call site, but a demonstration that the distinction
     * matters and that later code must care which quantity it computes.
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
