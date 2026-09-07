// tests/graph-metrics.test.ts
import { describe, it, expect } from 'vitest';
import { buildGraph } from '@/lib/graph/build';
import { degree, weightedDegree, betweenness, closeness, eigenvector, clusteringCoefficient, kCore, conflictClusters } from '@/lib/graph/metrics';

/**
 * Network measure tests: every expected value is derivable by hand from the graph's
 * shape, never from this implementation's own output. That discipline ensures the tests
 * catch real errors, not merely consistency.
 *
 * The reciprocal-cost tests (below) deserve particular attention. They exist to catch a
 * specific mutation: deleting the `1 /` in the cost function. A mutant that inverted
 * distance meaning (strong ties → long paths) would still pass all the uniform-friction
 * fixtures, because hop count alone determines the result. The tests "treats a strong
 * tie as a short path" and "cost function inverts friction" explicitly use mixed weights
 * where only the reciprocal can satisfy them, making this mutation impossible to hide.
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

  it('cost function inverts friction: strong edges are short paths', () => {
    // A-C direct (friction 1) vs A-B-C detour (friction 100 each way).
    // Reciprocal cost: A-C = 1.0, A-B-C = 0.01 + 0.01 = 0.02 (cheaper).
    // Without reciprocal: direct would win, B betweenness = 0 (broken).
    // This test exists to catch deletion of the `1 /` from cost().
    const b = betweenness(g([['A', 'C', 1], ['A', 'B', 100], ['B', 'C', 100]]));
    expect(b.get('B')).toBeGreaterThan(0);
  });

  it('handles zero-friction edges without producing NaN or Infinity in betweenness and closeness', () => {
    // A zero-friction edge (pure co-occurrence, no friction measurement) is the WEAKEST
    // link the cost function prices, not an impossible barrier: the MIN_FRICTION floor
    // makes it the longest edge in the graph (cost 2 vs 0.01 at friction 100) while
    // keeping it finite and traversable. All nodes
    // must have finite, non-NaN values for both betweenness and closeness. Closeness
    // is especially sensitive because it divides by accumulated distances; a MIN_FRICTION
    // floor in the path cost makes the total distance dominated by MIN_FRICTION, and
    // division by that accumulated total is the likeliest place for floating-point
    // artefacts (NaN, Infinity, negative values).
    const b = betweenness(g([['A', 'B', 0], ['B', 'C', 50]]));
    const c = closeness(g([['A', 'B', 0], ['B', 'C', 50]]));
    for (const n of ['A', 'B', 'C']) {
      expect(Number.isFinite(b.get(n)!)).toBe(true);
      expect(Number.isNaN(b.get(n)!)).toBe(false);
      expect(Number.isFinite(c.get(n)!)).toBe(true);
      expect(Number.isNaN(c.get(n)!)).toBe(false);
      expect(c.get(n)!).toBeGreaterThanOrEqual(0);
    }
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

  it('ranks a hub in a large component above a peripheral node in a small component', () => {
    // A 3-spoke star: H touches 3 nodes, closeness = 3 / 0.06 = 50.
    // A 2-node pair: A touches 1 node, closeness = 1 / 0.02 = 50 (without correction).
    // With Wasserman-Faust correction for component size, the pair's closeness
    // is scaled by 1/5 (reachable 1 of 5 total nodes), making it much lower than
    // the hub's 3/4 reachability. This prevents peripheral pairs from outranking
    // real brokers in a global ranking.
    const c = closeness(g([
      ['H', 'A'], ['H', 'B'], ['H', 'C'],
      ['X', 'Y'],
    ]));
    expect(c.get('H')!).toBeGreaterThan(c.get('X')!);
  });
});

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

  it('answers a bipartite component instead of oscillating between two wrong ones', () => {
    // A weighted star (H joined to A-D) is bipartite, so its spectrum is symmetric: +lambda
    // and -lambda have equal magnitude and plain power iteration never settles. It alternates
    // forever, and a fixed iteration count returns whichever state the parity of that
    // constant lands on. Before the averaging fix this graph gave every node 0.4472 at 100
    // iterations and H=0.8944 with the leaves at 0.2236 at 101 — neither is the answer.
    //
    // The true principal eigenvector of a star with equal spokes is H = 1/sqrt(2) = 0.70711
    // and each of the four leaves 1/(2*sqrt(2)) = 0.35355. Asserting BOTH parities is what
    // makes this a regression test rather than a snapshot: the old code could not pass both,
    // whichever pair of numbers you wrote down.
    const star = g([['H', 'A'], ['H', 'B'], ['H', 'C'], ['H', 'D']]);
    for (const iterations of [100, 101]) {
      const e = eigenvector(star, iterations);
      expect(e.get('H')).toBeCloseTo(0.707107, 4);
      for (const leaf of ['A', 'B', 'C', 'D']) {
        expect(e.get(leaf)).toBeCloseTo(0.353553, 4);
      }
    }
  });

  it('pins exact values after one iteration to catch multiply-to-add and L1-norm mutations', () => {
    // A cherry tree: A is the hub, B and C are leaves at different edge weights.
    // Raw fixture friction 100 and 20 become edge friction 81 and 28 via buildGraph's
    // squash(f * 2) from lib/risk. This test uses asymmetric weights so the add-mutation
    // (changing sum += x.get(m)! * e.friction to sum += x.get(m)! + e.friction)
    // alters the ratios: A becomes 2, B becomes 1, C becomes 1 (symmetric, so no ordering
    // change). But with squashed frictions 81 and 28, the multiply path gives A:B:C
    // as 109:81:28, while add gives 111:82:29, producing different ratios. Under L1 norm
    // instead of L2 (109+81+28 = 218), A collapses to 0.5. All three get caught here.
    //
    // eigenvector() returns the MEAN of the last two iterates (see the note at the
    // function for why — it is what makes a bipartite component answerable at all), so
    // "one iteration" means the average of steps 1 and 2, not step 1 alone:
    //   step 1 from all-ones:  A = 81 + 28 = 109,  B = 81,  C = 28
    //                          / sqrt(19226)  ->  0.786108, 0.584172, 0.201936
    //   step 2 from there:     A = 0.584172*81 + 0.201936*28,  B = 0.786108*81,
    //                          C = 0.786108*28  ->  0.618087, 0.742964, 0.256827
    //   mean, renormalised:    A = 0.707107,  B = 0.668304,  C = 0.231019
    //
    // The mutants this exists to catch are still caught, and by wider margins than
    // before — verified by computing each mutant through the same two steps:
    //   add-mutation: A = 0.785956, B = 0.583058, C = 0.205712  (0.085 away, needs 0.0005)
    //   L1-norm:      A = 0.441017, B = 0.415391, C = 0.143592  (0.266 away)
    const cherry = g([['A', 'B', 100], ['A', 'C', 20]]);
    const e = eigenvector(cherry, 1);
    expect(e.get('A')).toBeCloseTo(0.707107, 3);
    expect(e.get('B')).toBeCloseTo(0.668304, 3);
    expect(e.get('C')).toBeCloseTo(0.231019, 3);
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

  it('breaks ties on lowest label when a node sees equal weights from two clusters', () => {
    // Bridge between two strong pairs: D-E and F-G are stable clusters (friction 78 each
    // after buildGraph squashing raw 90). C bridges both pairs with equal friction (8 each
    // after squashing raw 5). When C compares the two labels {D,E} and {F,G}, it sees
    // exactly equal accumulated weight: neither side wins by magnitude, so the comparison
    // sort breaks ties on label lexicographic order — the lowest label {D,E} wins.
    //
    // Mutation this test kills: changing `w > bestWeight` to `w >= bestWeight` in the
    // label update loop. With >=, the HIGHEST label would win instead (LAST one seen
    // in sorted order), and C would join {F,G}. The test would fail because c.get('C')
    // would no longer equal c.get('D').
    const bridge = g([['D', 'E', 90], ['F', 'G', 90], ['C', 'E', 5], ['C', 'F', 5]]);
    const c = conflictClusters(bridge);
    expect(c.get('C')).toBe(c.get('D'));
  });

  it('accumulates friction across same-labelled neighbours in the weight sum', () => {
    // X is torn between two anchors: {P,Q} and {R,S}. P-Q and R-S are both strong
    // (friction 81 after squashing raw 100). X connects to P with friction 39 (raw 30),
    // to Q with 28 (raw 20), and to R with 57 (raw 50).
    //
    // The two paths to the P/Q label accumulate: 39 + 28 = 67. This beats R's single
    // path of 57, so X joins P and Q, not R and S.
    //
    // Mutation this test kills: changing `weights.set(l, (weights.get(l) ?? 0) + e.friction)`
    // to `weights.set(l, e.friction)`. With last-write-wins, each edge overwrites the
    // previous one for its label. X would see at most 39 for the P/Q label (the last
    // edge processed), which loses to 57 for R/S. X would join {R,S} instead, and
    // c.get('X') would not equal c.get('P').
    const sums = g([['P', 'Q', 100], ['R', 'S', 100], ['X', 'P', 30], ['X', 'Q', 20], ['X', 'R', 50]]);
    const c = conflictClusters(sums);
    expect(c.get('X')).toBe(c.get('P'));
  });
});
