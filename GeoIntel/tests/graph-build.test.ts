/**
 * Graph construction takes an extractor so that different co-occurrence patterns can feed
 * the same engine: today GeoEvents carry actors (countries); tomorrow a person-extraction
 * pipeline can pull entities and pass them without rewriting this core logic.
 *
 * Friction and alignment do not net off — they accumulate separately. The corpus holds
 * abundant friction and almost no alignment; netting them would hide that fundamental
 * asymmetry. Each score flows through the same squash curve lib/risk already uses for
 * dyads, so an edge weight here cannot contradict a dyad score on the 0-100 scale.
 *
 * Adjacency is indexed in both directions: g.adjacency.get('A').get('B') and
 * g.adjacency.get('B').get('A') point at the same GraphEdge object. Identity comparison
 * works because of that shared reference, letting traversals avoid redundant lookups.
 */

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
      actors, people: [], hotspots: [], domain: 'Diplomatic', escalation, confidence: 100,
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
