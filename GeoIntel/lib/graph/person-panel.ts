import type { Graph } from '@/lib/graph/types';
import { egoView, type EgoView } from '@/lib/graph/ego';
import {
  degree, centrality, eigenvector, kCore, clusteringCoefficient, conflictClusters,
} from '@/lib/graph/metrics';
import type { MetricRow } from '@/lib/graph/panel';
import { BY_PERSON } from '@/data/people';
import { BY_ISO } from '@/data/countries';

/**
 * The person equivalent of lib/graph/panel.ts, and a separate file because the measure set
 * genuinely differs rather than as a matter of taste.
 *
 * ALL EIGHT STATE MEASURES COME ACROSS, as of 2026-09-06. Two of them did not until then,
 * and why they are back is worth keeping because it was structural rather than a matter of
 * taste: a BIPARTITE graph has no triangles, and both measures count triangles.
 *
 * - Entanglement is the local clustering coefficient, which was therefore identically 0 for
 *   every node here — the row would have printed "0.00, separate fronts" on every person
 *   page in the product, which is not a reading but a tautology.
 * - Conflict clusters come from label propagation, which across a person↔country graph
 *   grouped people together WITH countries. "Modi and India are in cluster 2" was not a
 *   finding about anything.
 *
 * Mixing the graph gave the bipartite shape up (see personGraph in lib/graph/build.ts), and
 * with person↔person edges the live graph carries 1,737 triangles. Both measures now say
 * something: for a person, "the officials and states you are named with are also named with
 * each other" describes a diplomatic circle rather than restating a tautology. The premise
 * is asserted in tests/graph-person.test.ts rather than assumed, so if the graph ever went
 * back to bipartite these two rows would become meaningless again and a test would say so.
 *
 * Contagion exposure is here ONLY because of the 2026-09-05 eigenvector fix. A bipartite
 * graph is exactly the degenerate case for power iteration — the spectrum is symmetric, so
 * +lambda and -lambda have equal magnitude and the iterate oscillates rather than
 * converging. Against the previous implementation every figure in this column would have
 * been an artefact of whether a hardcoded loop count happened to be even, wrong with no
 * error and no way to notice. tests/graph-metrics.test.ts asserts both parities; that test
 * is load-bearing for this file and must not be weakened.
 *
 * The full-graph rule from lib/graph/panel.ts holds here unchanged: every measure runs on
 * `graph` before egoView cuts it down to what gets drawn.
 */

export interface PersonPanel {
  view: EgoView;
  rows: MetricRow[];
  nodeCount: number;
  /** Full-graph degree, so the page can caveat without reading the capped, drawn list. */
  degree: number;
}

interface Rank { rank: number; tiedWith: number }

/**
 * Competition ranking, matching lib/graph/panel.ts — see that file for why a sorted index
 * is wrong (it breaks ties by map order, which is alphabetical, and presents that as
 * structure). null rather than 0 for an unscored node: 0 is not a position in a 1..N
 * ordering.
 */
function rankOf(scores: Map<string, number>, id: string): Rank | null {
  const own = scores.get(id);
  if (own === undefined) return null;
  let above = 0;
  let equal = 0;
  for (const v of scores.values()) {
    if (v > own) above++;
    else if (v === own) equal++;
  }
  return { rank: above + 1, tiedWith: equal - 1 };
}

const rankValue = (r: Rank | null, n: number) => (r ? `#${r.rank} of ${n}` : '—');

const rankNote = (r: Rank | null) => {
  if (!r) return ' This person is not named alongside any state in the current corpus, so they hold no position here.';
  if (r.tiedWith === 0) return '';
  return ` Shared with ${r.tiedWith} other node${r.tiedWith === 1 ? '' : 's'} on an identical score.`;
};

/**
 * Summed friction across every state except the person's own.
 *
 * Exported because app/person/page.tsx lists the same figure. When the index computed
 * weightedDegree instead, it showed Trump at 300 where his page showed 230 — both correct,
 * one including the home tie and one not, under labels a reader would take for the same
 * quantity. Sharing the function is what stops that recurring.
 */
export function crossBorderFriction(graph: Graph<unknown>, id: string, home?: string): number {
  let sum = 0;
  for (const [other, edge] of graph.adjacency.get(id) ?? []) {
    if (other !== home) sum += edge.friction;
  }
  return sum;
}

export function personPanel(graph: Graph<unknown>, id: string, topN: number): PersonPanel {
  const person = BY_PERSON.get(id);
  const home = person?.home;

  // Whole graph first, ego view second — the ordering lib/graph/panel.ts exists to enforce.
  const { betweenness: bc, closeness: cl } = centrality(graph);
  const ev = eigenvector(graph);
  const cores = kCore(graph);
  const deg = degree(graph, id);
  const entanglement = clusteringCoefficient(graph, id);
  const cluster = conflictClusters(graph).get(id);

  const crossBorder = crossBorderFriction(graph, id, home);

  /*
   * Friction excluding the home tie.
   *
   * A leader is named beside their own state in nearly every story about it, so the home
   * edge is far the heaviest and including it would turn this row into a ranking of who
   * governs a busy country — which the threat board already answers. The row is named
   * "Cross-border friction" rather than "Total friction" so the exclusion is legible in
   * the interface rather than being a surprise buried in a docblock.
   *
   * Note this is the ONLY place the home edge is discounted. The structural ranks below
   * are positions in the real network, and deleting a genuine edge to compute them would
   * rank people in a graph that does not exist.
   */
  const bcRank = rankOf(bc, id);
  const evRank = rankOf(ev, id);
  const clRank = rankOf(cl, id);
  const homeName = home ? (BY_ISO.get(home)?.name ?? home) : null;

  const view = egoView(graph, id, topN);

  const rows: MetricRow[] = [
    { label: 'Connections', value: String(deg),
      reading: `States naming ${person?.name ?? id} in at least one event`
        + (homeName ? `, including ${homeName}, whom they serve` : '')
        + (view.hidden ? `; the ${view.hidden} weakest are not drawn` : '') + '.' },
    { label: 'Cross-border friction', value: String(Math.round(crossBorder)),
      reading: `Summed tension across every state except ${homeName ?? 'their own'}.`
        + ' The home tie is drawn but not counted here: it says who someone is, not where they are active.' },
    { label: 'Brokerage', value: rankValue(bcRank, graph.nodes.length),
      reading: 'How often this node lies on the shortest route between two others.' + rankNote(bcRank) },
    { label: 'Contagion exposure', value: rankValue(evRank, graph.nodes.length),
      reading: 'Named alongside states that are themselves embroiled, rather than merely alongside many.' + rankNote(evRank) },
    { label: 'Reach', value: rankValue(clRank, graph.nodes.length),
      reading: 'How near this node sits to the rest of the network along the strongest available paths.' + rankNote(clRank) },
    { label: 'Entanglement', value: entanglement.toFixed(2),
      // Measured across every counterpart on the full graph but printed beside a drawing of
      // only the strongest few, so where the cap has hidden anything the row says what it
      // measured over — the same disclosure the country panel makes.
      reading: (entanglement > 0.5
        ? 'The officials and states this person is named with are largely named with each other too: one connected circle.'
        : 'The officials and states this person is named with are largely not named with each other: separate contexts rather than one circle.')
        + (view.hidden ? ` Measured across all ${deg} connections, not only the ${view.neighbours.length} drawn.` : '') },
    { label: 'Core depth', value: String(cores.get(id) ?? 0),
      reading: 'Depth within the densely connected middle of the network. Higher means further from the periphery.' },
    { label: 'Conflict cluster', value: cluster === undefined ? '—' : `#${cluster + 1}`,
      reading: 'Group of nodes most often named with one another. A reporting cluster, not an alliance and not a faction.'
        + (cluster === undefined ? ' This person has no recorded connections, so belongs to none.' : '') },
  ];

  return { view, rows, nodeCount: graph.nodes.length, degree: deg };
}
