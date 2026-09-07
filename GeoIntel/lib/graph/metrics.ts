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

// Tie tolerance for shortest-path comparisons in Dijkstra. Relative comparison
// (EPSILON * Math.max(1, distance)) is used to stay meaningful across scales.
const EPSILON = 1e-9;

// Minimum friction for cost computation. Prevents a zero-friction edge (co-occurrence
// only, no actual friction measurement) from producing infinite cost. MIN_FRICTION is the
// WEAKEST relationship the cost function will price: it floors friction, so a zero-friction
// edge becomes the LONGEST edge in the graph — cost(0) = 2 against 0.01 for friction 100,
// a factor of 200 — while still being finite rather than unreachable. Do not read it as
// "the strongest possible link"; that is backwards, and inverting the floor on that reading
// would silently reorder Brokerage and Reach across every state. This is not a hypothetical
// misreading: 60% of live edges (328 of 547) carry friction exactly 0.
// Kept separate from EPSILON to avoid scale collision: with EPSILON=1e-9, cost(0) = 1e9,
// where chained additions lose that precision. With MIN_FRICTION=0.5, cost(0) = 2, so ties
// stay meaningful.
const MIN_FRICTION = 0.5;

export function degree(g: Graph<unknown>, node: string): number {
  return g.adjacency.get(node)?.size ?? 0;
}

export function weightedDegree(g: Graph<unknown>, node: string): number {
  let sum = 0;
  for (const e of g.adjacency.get(node)?.values() ?? []) sum += e.friction;
  return sum;
}

function cost(friction: number): number {
  // Distance is the reciprocal of weight. A zero-friction edge (pure co-occurrence)
  // still exists in the network, so it gets a finite cost via MIN_FRICTION floor
  // rather than being treated as unreachable (Infinity) or infinitely close (0).
  // MIN_FRICTION = 0.5 keeps all costs in a reasonable range (~0.01 to 2) even after
  // chaining many edges, which preserves the relative tie tolerance in Dijkstra.
  return 1 / Math.max(friction, MIN_FRICTION);
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
      // Tie tolerance: relative for finite distances, absolute for Infinity
      const relTol = Number.isFinite(known) ? EPSILON * Math.max(1, known) : EPSILON;
      if (alt < known - relTol) {
        dist.set(v, alt);
        sigma.set(v, sigma.get(u)!);
        preds.set(v, [u]);
      } else if (Math.abs(alt - known) <= relTol) {
        sigma.set(v, sigma.get(v)! + sigma.get(u)!);
        preds.get(v)!.push(u);
      }
    }
  }
  return { dist, sigma, preds, order };
}

/**
 * Betweenness and closeness from a single all-sources sweep.
 *
 * Both measures are accumulated from the same dijkstra() call per source, because both
 * are functions of the same shortest-path tree and dijkstra() already returns everything
 * either of them needs — betweenness uses {sigma, preds, order}, closeness uses {dist},
 * and each was previously throwing the other's half away. Running them separately meant
 * computing all-pairs shortest paths twice per page render (measured 21ms + 20ms of a
 * ~55ms panel), and this is the O(V^3) term, so it is the first thing that bites as the
 * corpus grows.
 *
 * The arithmetic below is unchanged from the two functions this replaces, deliberately:
 * the accumulation loops were moved, not rewritten. Verified against the live 68-node
 * graph as bit-identical output for all 136 values.
 */
export function centrality(g: Graph<unknown>): {
  betweenness: Map<string, number>;
  closeness: Map<string, number>;
} {
  const bc = new Map<string, number>(g.nodes.map((n) => [n, 0]));
  const cl = new Map<string, number>();

  for (const s of g.nodes) {
    const { dist, sigma, preds, order } = dijkstra(g, s);

    // Brandes' dependency accumulation, walking the tree back from the furthest node.
    const delta = new Map<string, number>(g.nodes.map((n) => [n, 0]));
    for (let i = order.length - 1; i >= 0; i--) {
      const w = order[i];
      for (const v of preds.get(w)!) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      }
      if (w !== s) bc.set(w, bc.get(w)! + delta.get(w)!);
    }

    // Closeness over reachable nodes only, with the Wasserman-Faust correction.
    let total = 0;
    let reached = 0;
    for (const n of g.nodes) {
      if (n === s) continue;
      const d = dist.get(n)!;
      if (Number.isFinite(d)) { total += d; reached += 1; }
    }
    cl.set(s, reached === 0 ? 0 : (reached / total) * (reached / (g.nodes.length - 1)));
  }

  // Each unordered pair is counted from both endpoints.
  for (const [n, v] of bc) bc.set(n, v / 2);
  return { betweenness: bc, closeness: cl };
}

/**
 * Brandes' algorithm on weighted edges. Returns unnormalised scores; the UI ranks them
 * rather than reading them absolutely, so a normalisation constant would add nothing.
 *
 * Prefer centrality() where both measures are wanted — see lib/graph/panel.ts, which is
 * the only production caller and takes both. This wrapper exists for callers that want
 * one measure and for tests that exercise it in isolation.
 */
export function betweenness(g: Graph<unknown>): Map<string, number> {
  return centrality(g).betweenness;
}

/**
 * Closeness over reachable nodes only. Averaging over unreachable ones would make every
 * node in a fragmented graph score zero and say nothing about any of them.
 *
 * Applied with Wasserman-Faust correction: the raw ratio (reachable / mean_distance)
 * is scaled by the fraction of the graph the node can reach. A 2-node island with
 * closeness 1/0.02 would otherwise outrank a true hub; the correction scales by
 * (reachable / total_nodes), so a peripheral pair scores far below a hub in a large
 * component. This makes closeness comparable across a fragmented network.
 */
export function closeness(g: Graph<unknown>): Map<string, number> {
  return centrality(g).closeness;
}

/**
 * Eigenvector centrality by power iteration: being embroiled with the embroiled, rather
 * than embroiled with many. A fixed iteration count keeps it deterministic — a
 * convergence threshold would make the output depend on floating-point noise, and at this
 * size the extra iterations cost nothing.
 */
export function eigenvector(g: Graph<unknown>, iterations = 100): Map<string, number> {
  /** One power-iteration step: multiply by the weighted adjacency, then L2-normalise. */
  const step = (v: Map<string, number>): Map<string, number> | null => {
    const next = new Map<string, number>(g.nodes.map((n) => [n, 0]));
    for (const n of g.nodes) {
      let sum = 0;
      for (const [m, e] of g.adjacency.get(n) ?? []) sum += v.get(m)! * e.friction;
      next.set(n, sum);
    }
    const norm = Math.sqrt([...next.values()].reduce((s, acc) => s + acc * acc, 0));
    if (norm < EPSILON) return null;          // no weight anywhere; nothing to normalise
    for (const [n, val] of next) next.set(n, val / norm);
    return next;
  };

  let x = new Map<string, number>(g.nodes.map((n) => [n, 1]));
  for (let i = 0; i < iterations; i++) {
    const next = step(x);
    if (!next) return next ?? new Map<string, number>(g.nodes.map((n) => [n, 0]));
    x = next;
  }

  // One further step, averaged with the last — this is what makes a bipartite component
  // give an answer at all.
  //
  // Plain power iteration assumes one eigenvalue dominates. A bipartite graph breaks that:
  // its spectrum is symmetric, so +lambda and -lambda have equal magnitude and the iterate
  // never settles — it alternates between two vectors forever. The old fixed-100 loop
  // returned whichever of the two the parity of a hardcoded constant happened to land on,
  // and neither is the answer. On a weighted star beside a triangle, iteration 100 gave
  // every node 0.4472 and iteration 101 gave the hub 0.8944 with the leaves at 0.2236,
  // where the truth is 0.7071 and 0.3536.
  //
  // Averaging two consecutive iterates is the whole fix. Writing the iterate as
  // c1*v1*lambda^k + c2*v2*(-lambda)^k, consecutive steps differ only in the sign of the
  // second term, so the mean cancels it exactly and leaves the principal eigenvector.
  // Verified on that star: the average of the two states normalises to 0.7071 / 0.3536.
  //
  // Where the iteration DOES converge — every graph the live corpus has produced — the two
  // states agree and the averaging is inert, so this costs one extra multiply and changes
  // nothing anyone can see. Measured rather than assumed: against the previous
  // implementation the 68-node corpus graph moves by at most 5.6e-17, one unit in the last
  // place at that magnitude, from the extra renormalisation — no rank anywhere changes.
  const y = step(x);
  if (!y) return x;
  const mean = new Map<string, number>(g.nodes.map((n) => [n, (x.get(n)! + y.get(n)!) / 2]));
  const norm = Math.sqrt([...mean.values()].reduce((s, v) => s + v * v, 0));
  if (norm < EPSILON) return mean;
  for (const [n, v] of mean) mean.set(n, v / norm);
  return mean;
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
      // An isolated node has nothing to join. Unreachable through buildGraph, which never
      // adds a node without an adjacency entry, but Graph is a public type and the tests
      // build them by hand — and the seeding below indexes the first entry, so this guard
      // is what makes that safe rather than being the inert check it used to be.
      if (!weights.size) continue;

      // Argmax over neighbour-label weights, ties going to the lowest label. Seeded from
      // the first sorted entry rather than from a -1 sentinel and this node's own label:
      // with weights non-empty the sentinel always lost on iteration one, so the seed was
      // dead code that read as a meaningful "keep my own label" fallback and was not one.
      const byLabel = [...weights.entries()].sort(([x], [y]) => (x < y ? -1 : 1));
      let [bestLabel, bestWeight] = byLabel[0];
      for (const [l, w] of byLabel.slice(1)) {
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
