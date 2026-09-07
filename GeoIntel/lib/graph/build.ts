import { impact, decay, squash } from '@/lib/risk';
import type { GeoEvent } from '@/lib/types';
import type { Graph, GraphEdge } from '@/lib/graph/types';
import { BY_PERSON } from '@/data/people';

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

/**
 * Canonical edge identifier. Nodes are ordered so that A|B and B|A map to the same key.
 *
 * WARNING: Node IDs must not contain the pipe character '|'. Today's ISO3 country codes
 * are safe, but if this builder later consumes extracted person identifiers, those often
 * carry pipes (e.g., "first|last" or "org|person"), creating a collision: edgeKey('A|B', 'C')
 * and edgeKey('A', 'B|C') both produce "A|B|C", silently merging distinct pairs into one edge.
 * A runtime guard could be added if needed, but changing the format would break existing code.
 */
export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface Extracted {
  participants: string[];
  friction: number;
  alignment: number;
  /** Context to attach to every edge this item produces — for events, the states involved. */
  context?: string[];
}

export function buildGraph<T>(
  items: T[],
  extract: (item: T) => Extracted,
  opts: {
    topPerEdge?: number;
    rank?: (item: T) => number;
    /**
     * Which participant pairs may become an edge. Omitted means every pair, which is the
     * original behaviour and what stateGraph relies on. personGraph passes one admitting
     * only person↔country pairs, so the bipartite structure is enforced HERE at
     * construction rather than trusted of every downstream consumer.
     */
    pairFilter?: (a: string, b: string) => boolean;
  } = {},
): Graph<T> {
  const topPerEdge = opts.topPerEdge ?? 8;
  const raw = new Map<string, {
    a: string; b: string; f: number; al: number; n: number; an: number;
    /** Context value -> how many contributing items carried it. */
    ctx: Map<string, number>;
  }>();
  const contributors = new Map<string, T[]>();

  for (const item of items) {
    const { participants, friction, alignment, context } = extract(item);
    const ps = [...new Set(participants)].sort();
    if (ps.length < 2) continue;

    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        if (opts.pairFilter && !opts.pairFilter(ps[i], ps[j])) continue;
        const k = edgeKey(ps[i], ps[j]);
        const cur = raw.get(k) ?? { a: ps[i], b: ps[j], f: 0, al: 0, n: 0, an: 0, ctx: new Map() };
        cur.f += friction;
        cur.al += alignment;
        cur.n += 1;
        // Deduped for the same reason `participants` is, one loop up: a repeated value would
        // count twice for a single item and could then outrank a value seen in more items,
        // turning "most frequent first" into a lie. No live event has duplicate actors today
        // — the asymmetry with the dedupe above is the trap, not a current bug.
        for (const c of new Set(context ?? [])) cur.ctx.set(c, (cur.ctx.get(c) ?? 0) + 1);
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
      // The name tie-break keeps the order deterministic when two states appear equally
      // often. Without it the output depends on Map insertion order — the defect that made
      // the country panel's ranks alphabetical while looking like structure.
      context: [...v.ctx.entries()]
        .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
        .map(([c]) => c),
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

/**
 * Whether a node is a person rather than a state.
 *
 * Country nodes are ISO3 codes and the roster is keyed by lowercase-hyphen ids, so the two
 * namespaces cannot collide and roster membership is a total test. It named the side of a
 * bipartition until 2026-09-06; the graph is mixed now, but the question it answers — and
 * every caller of it — is unchanged. lib/graph/ego.ts routes and labels a node by it.
 */
export function isPersonNode(id: string): boolean {
  return BY_PERSON.has(id);
}

/**
 * The mixed person graph: person↔person and person↔country, never country↔country.
 *
 * Participants are the event's people AND its actors together. pairFilter admits any pair
 * touching a person, which keeps country↔country out — that would duplicate the state graph
 * with weights derived from a different subset of events.
 *
 * THIS WAS BIPARTITE until 2026-09-06, on the grounds that the corpus could not support
 * person↔person edges: "60 of 4,214 articles name two figures". That figure was measured
 * against a TWELVE-name roster and never redone when the roster reached 120. Re-measured,
 * it is 125 events and 75 distinct pairs — Doval–Wang Yi alone appears 28 times. A
 * measurement is scoped to the inputs it was taken with, and nothing here knew the
 * difference. See docs/specs/2026-09-06-person-to-person-design.md.
 *
 * What the corpus still cannot support is the ACTION on an edge, and that is a firmer no
 * than the edge count ever was. Headline verbs usually take a third party as their object:
 * "Zelensky warns airlines Russian skies not safe" pairs Putin and Zelensky, who did not
 * interact. An edge here means named in the same clustered event, and nothing more.
 *
 * Friction is impact(), the same function behind dyad tension and the state graph, so a
 * person edge and a state edge are the same arithmetic over the same events.
 */
export function personGraph(events: GeoEvent[], now = Date.now()): Graph<GeoEvent> {
  return buildGraph(
    events,
    (e) => ({
      participants: [...e.people, ...e.actors],
      friction: impact(e, now),
      alignment: Math.max(0, -e.escalation) * (e.confidence / 100) * decay(e.lastSeen, now),
      // Where the reporting behind this edge was set. stateGraph supplies none: a
      // country-country edge's context is its own endpoints, which says nothing.
      context: e.actors,
    }),
    {
      topPerEdge: 8,
      rank: (e) => impact(e, now),
      // Any pair touching a person. Country-country stays out, so the state graph is not
      // duplicated with weights drawn from a different subset of events. This was `!==`
      // — bipartite — until the roster grew from 12 names to 120 and the measurement that
      // justified it turned out to be stale. See the docblock above.
      pairFilter: (a, b) => isPersonNode(a) || isPersonNode(b),
    },
  );
}
