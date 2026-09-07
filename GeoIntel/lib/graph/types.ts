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
  /**
   * States of the events behind this edge, most frequent first. Empty when the extractor
   * supplied none — always an array, never undefined, because consumers index into it.
   *
   * Accumulated across EVERY contributing event rather than derived from topEvents, which
   * is capped: a 29-event tie would otherwise report the places of a sample of eight as
   * though they were the whole.
   */
  context: string[];
}

export interface Graph<T> {
  nodes: string[];
  edges: GraphEdge[];
  /** Both directions point at the same GraphEdge object, so identity comparison works. */
  adjacency: Map<string, Map<string, GraphEdge>>;
  /** Strongest source items per edge, keyed by edgeKey. Evidence behind a line. */
  topEvents: Map<string, T[]>;
}
