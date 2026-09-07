import type { Graph } from '@/lib/graph/types';
import { egoView, type EgoView } from '@/lib/graph/ego';
import {
  degree, weightedDegree, centrality,
  eigenvector, clusteringCoefficient, kCore, conflictClusters,
} from '@/lib/graph/metrics';

/**
 * The one function allowed to compute a measure and derive an ego view in the same
 * breath, precisely so that app/network/[iso]/page.tsx never has to.
 *
 * Task 6 established the full-graph rule as a value — every measure in lib/graph/metrics
 * is only meaningful on the complete network — and pinned it as an arithmetic example in
 * tests/graph-layout.test.ts. But that test builds its own subgraph by hand and calls
 * betweenness() directly; it has zero coupling to any call site a real page would use. If
 * the network page had gone on to compute its eight measures inline next to a separately
 * derived ego view (the original shape of this feature), a later "simplification" that
 * measured view.edges or the capped neighbour list instead of the full graph would ship
 * an authoritative-looking wrong rank, and nothing already in the suite would notice.
 *
 * Collapsing both computations into this single, pure, exported function closes that gap
 * structurally rather than by convention: `graph` is the only graph-shaped argument, every
 * measure below runs on it before the ego view is ever cut down to topN, and
 * tests/graph-panel.test.ts asserts against this function directly. A page that calls it
 * once and renders the result has no second, subgraph-shaped `Graph` in scope to pass to a
 * measure by mistake.
 */

export interface MetricRow { label: string; value: string; reading: string }
export interface NetworkPanel {
  view: EgoView;
  rows: MetricRow[];
  nodeCount: number;
  /**
   * The focus state's degree, measured on the FULL graph. Exposed so the page can decide
   * how much to caveat the panel without taking its own reading off `view.neighbours`,
   * which is the capped, drawn list rather than the truth.
   */
  degree: number;
}

interface Rank {
  /** 1 = highest. Standard competition ranking: joint 25th, then joint 25th again. */
  rank: number;
  /** How many OTHER states hold this exact rank. 0 means the position is held alone. */
  tiedWith: number;
}

/**
 * Rank within a map, 1 = highest, or null when the state is not scored at all.
 *
 * Competition ranking — one more than the number of states scoring strictly above — so
 * everyone on the same score shares a position. The obvious implementation, taking a
 * sorted index, breaks ties by the map's iteration order instead. That order is
 * alphabetical here (Graph.nodes is sorted), and the result was presented to readers as
 * structure: on the live corpus 44 of 68 states score betweenness exactly 0, and they were
 * ranked #25 through #68 in ISO order, so AFG read "Brokerage #25 of 68" beside a sentence
 * about connecting disputes that do not otherwise touch. AFG brokers nothing.
 *
 * `tiedWith` exists because a shared rank is only honest if the sharing is visible. A
 * lone #25 and a #25 shared with 43 others are very different claims and rendered
 * identically without it.
 *
 * null rather than 0 for an unscored state: 0 is not a rank. Rendering "#0 of 68" asserts
 * a position in an ordering the state is not part of, which is worse than saying nothing.
 */
function rankOf(scores: Map<string, number>, iso: string): Rank | null {
  const own = scores.get(iso);
  if (own === undefined) return null;
  let above = 0;
  let equal = 0;
  for (const v of scores.values()) {
    if (v > own) above++;
    else if (v === own) equal++;
  }
  return { rank: above + 1, tiedWith: equal - 1 };
}

/** A rank as rendered, or an em dash when the state holds no position at all. */
function rankValue(r: Rank | null, nodeCount: number): string {
  return r ? `#${r.rank} of ${nodeCount}` : '—';
}

/**
 * What to append to a rank's reading. Either the state is absent from the ranking and the
 * row must say so, or it shares its position and the row must say with how many.
 */
function rankNote(r: Rank | null): string {
  if (!r) return ' This state has no recorded connections, so it holds no position in this ranking.';
  if (r.tiedWith === 0) return '';
  return ` Shared with ${r.tiedWith} other state${r.tiedWith === 1 ? '' : 's'} on an identical score.`;
}

export function networkPanel(graph: Graph<unknown>, iso: string, topN: number): NetworkPanel {
  // Every measure below is run on `graph` — the whole network — before `view` even
  // exists. There is no subgraph in scope yet for a rank to be computed against by
  // mistake; that ordering is the entire point of this module.
  // One all-sources sweep for both, rather than two: they are functions of the same
  // shortest-path trees, and running them apart doubled the O(V^3) work per render.
  const { betweenness: bc, closeness: cl } = centrality(graph);
  const ev = eigenvector(graph);
  const cores = kCore(graph);
  const clusters = conflictClusters(graph);
  const deg = degree(graph, iso);
  const entanglement = clusteringCoefficient(graph, iso);

  // Only now, with every measure already computed against the full graph, is the view
  // cut down to the strongest topN neighbours for drawing.
  const view = egoView(graph, iso, topN);

  const bcRank = rankOf(bc, iso);
  const evRank = rankOf(ev, iso);
  const clRank = rankOf(cl, iso);
  // `undefined` is the real "not in any cluster" signal. The previous `?? 0` collapsed it
  // onto cluster 0, which renders as "#1" — asserting membership of a cluster that exists
  // and holds real states, for a state that is in none.
  const cluster = clusters.get(iso);

  const rows: MetricRow[] = [
    { label: 'Connections', value: String(deg),
      reading: `States sharing at least one event with ${iso}${view.hidden ? `; the ${view.hidden} weakest are not drawn` : ''}.` },
    { label: 'Total friction', value: String(Math.round(weightedDegree(graph, iso))),
      reading: 'Summed tension across every connection. Compare with the risk index — a gap between them is worth a look.' },
    { label: 'Brokerage', value: rankValue(bcRank, graph.nodes.length),
      reading: 'How often this state lies on the shortest route between two others. A high rank means it connects disputes that do not otherwise touch.'
        + rankNote(bcRank) },
    { label: 'Contagion exposure', value: rankValue(evRank, graph.nodes.length),
      reading: 'Embroiled with states that are themselves embroiled, rather than merely embroiled with many.'
        + rankNote(evRank) },
    { label: 'Reach', value: rankValue(clRank, graph.nodes.length),
      reading: 'How near this state sits to the rest of the network along the strongest available paths.'
        + rankNote(clRank) },
    { label: 'Entanglement', value: entanglement.toFixed(2),
      // The coefficient is measured across every counterpart on the full graph, but it is
      // printed beside a drawing of only the strongest few. Those two can disagree sharply
      // — CHN reads 0.32 while the ten neighbours actually drawn sit at density 0.84 — so
      // where the cap has hidden anything, the row says what it measured over.
      reading: (entanglement > 0.5
        ? 'Most of its counterparts are also in dispute with each other: one entangled theatre.'
        : 'Its counterparts largely do not dispute with each other: separate fronts rather than one theatre.')
        + (view.hidden ? ` Measured across all ${deg} counterparts, not only the ${view.neighbours.length} drawn.` : '') },
    { label: 'Core depth', value: String(cores.get(iso) ?? 0),
      reading: 'Depth within the densely connected middle of the network. Higher means further from the periphery.' },
    { label: 'Conflict cluster', value: cluster === undefined ? '—' : `#${cluster + 1}`,
      reading: 'Group of states most embroiled with one another. These are mutual antagonists, not a bloc or an alliance.'
        + (cluster === undefined ? ' This state has no recorded connections, so it belongs to no cluster.' : '') },
  ];

  return { view, rows, nodeCount: graph.nodes.length, degree: deg };
}
