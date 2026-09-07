// tests/graph-person.test.ts
//
// The person graph is MIXED: person↔person and person↔country edges, but never
// country↔country. buildGraph pairs every participant with every other, so a naive call with
// [person, IND, CHN] would emit an IND–CHN edge duplicating the state graph with weights
// derived from a different subset of events. pairFilter is what prevents that, and this file
// pins it.
//
// IT WAS BIPARTITE UNTIL 2026-09-06, and the assertions here were INVERTED rather than
// deleted, because the constraint that survived is the one that always mattered. The
// bipartite shape was never a design goal — it was a consequence of a measurement taken
// against a twelve-name roster ("60 of 4,214 articles name two figures"), never redone when
// the roster reached 120. Re-measured: 125 events, 75 distinct pairs, Doval–Wang Yi at 28.
// See docs/specs/2026-09-06-person-to-person-design.md.
//
// The transferable lesson, and the reason this paragraph is here rather than in a commit
// message: a measurement is scoped to the inputs it was taken with, and nothing in the
// repository knows when one has gone stale underneath it.
//
// Giving up bipartiteness has a consequence this file also pins: a bipartite graph has no
// triangles, which is WHY lib/graph/person-panel.ts had dropped Entanglement and conflict
// clusters. The mixed graph has triangles, so both measures return, and the triangle count
// is asserted rather than assumed — their reinstatement rests on a checked fact.
//
// Mutation notes (each test names the one-line change it catches):
// - "emits only the pairs the filter admits": deleting the pairFilter call in the loop.
// - "still emits no country-to-country edge": relaxing the filter to admit every pair.
// - "emits a person-to-person edge": restoring the bipartite `!==` filter.
// - "has triangles": the same — bipartite means zero.
// - "excludes the home state from cross-border friction": dropping the `other !== home`
//   condition in personPanel's friction loop.
// - "emits eight rows": dropping or reordering any panel row.
// - "routes a person to /person": hardcoding nodeHref's base to '/network'.
// - "carries the states of the events behind an edge": dropping the sort in the context
//   construction, which makes the order Map-insertion rather than most-frequent-first.
import { describe, it, expect } from 'vitest';
import { buildGraph, personGraph, stateGraph, isPersonNode } from '@/lib/graph/build';
import { personPanel } from '@/lib/graph/person-panel';
import { nodeHref, nodeLabel, trailNode, isKnownNode, personBox } from '@/lib/graph/ego';
import type { GeoEvent } from '@/lib/types';

interface I { who: string[]; f: number }
const g = (items: I[], pairFilter?: (a: string, b: string) => boolean) =>
  buildGraph<I>(items, (i) => ({ participants: i.who, friction: i.f, alignment: 0 }),
    { pairFilter });

let seq = 0;
const event = (over: Partial<GeoEvent>): GeoEvent => {
  seq += 1;
  const iso = new Date().toISOString();
  return {
    id: `e${seq}`, title: `E${seq}`, summary: '', firstSeen: iso, lastSeen: iso,
    actors: [], people: [], hotspots: [], domain: 'Diplomatic', escalation: 60,
    confidence: 80, signals: [], flags: [], articleIds: [`a${seq}`], languages: ['en'],
    countries: ['USA'], imageUrl: null, videoId: null, ladderRung: null, ladderZh: null,
    ladderEn: null, ...over,
  };
};

describe('pairFilter', () => {
  it('emits every pair when no filter is given, which is the existing behaviour', () => {
    const graph = g([{ who: ['A', 'B', 'C'], f: 50 }]);
    expect(graph.edges).toHaveLength(3);   // AB, AC, BC
  });

  it('emits only the pairs the filter admits', () => {
    // Admit only pairs where exactly one side starts with 'p'. From [p1, IND, CHN] that is
    // p1–IND and p1–CHN, never IND–CHN. Asserting the exact key set rather than a count is
    // what distinguishes "the filter ran" from "the filter ran correctly".
    const one = (a: string, b: string) => a.startsWith('p') !== b.startsWith('p');
    const graph = g([{ who: ['p1', 'IND', 'CHN'], f: 50 }], one);
    const keys = graph.edges.map((e) => [e.a, e.b].sort().join('-')).sort();
    expect(keys).toEqual(['CHN-p1', 'IND-p1']);
  });
});

describe('personGraph', () => {
  it('still emits no country-to-country edge, so it cannot duplicate the state graph', () => {
    // The half of the old bipartite constraint that survives, and the one that was always
    // load-bearing: the state graph must not be rebuilt here from a different event subset.
    const graph = personGraph([event({ actors: ['IND', 'CHN'], people: ['modi'] })]);
    for (const e of graph.edges) expect(isPersonNode(e.a) || isPersonNode(e.b)).toBe(true);
    expect(graph.edges.map((e) => [e.a, e.b].sort().join('-')).sort())
      .toEqual(['CHN-modi', 'IND-modi']);
  });

  it('emits a person-to-person edge when two are named in one event', () => {
    // Inverted from the assertion that used to forbid this. The bipartite shape was a
    // consequence of the roster holding twelve names when it was measured; with 120 there
    // are 125 such events and 75 distinct pairs, which is a network rather than an anecdote.
    const graph = personGraph([event({ actors: ['CHN'], people: ['modi', 'wang-yi'] })]);
    const between = graph.edges.filter((e) => isPersonNode(e.a) && isPersonNode(e.b));
    expect(between).toHaveLength(1);
    expect([between[0].a, between[0].b].sort()).toEqual(['modi', 'wang-yi']);
    expect(graph.edges).toHaveLength(3);   // modi-CHN, wang-yi-CHN, modi-wang-yi
  });

  it('leaves the state graph alone, which mixing this one must not disturb', () => {
    // The spec's last testing requirement. personGraph and stateGraph read the same events,
    // so a pairFilter loosened in the wrong place — or moved out of personGraph into
    // buildGraph's default — would silently change every country risk figure on the site.
    const evs = [event({ actors: ['IND', 'CHN'], people: ['modi', 'wang-yi'] })];
    const sg = stateGraph(evs);
    expect(sg.nodes).toEqual(['CHN', 'IND']);
    expect(sg.edges.map((e) => `${e.a}-${e.b}`)).toEqual(['CHN-IND']);
    // No person leaks in from the shared event, in either direction.
    for (const n of sg.nodes) expect(isPersonNode(n)).toBe(false);
  });

  it('has triangles, which is what licenses the two measures the panel restores', () => {
    // The person panel dropped Entanglement and conflict clusters BECAUSE a bipartite graph
    // has none. This asserts the premise, so their reinstatement rests on a checked fact
    // rather than on reasoning in a commit message.
    const graph = personGraph([event({ actors: ['CHN'], people: ['modi', 'wang-yi'] })]);
    let triangles = 0;
    for (const n of graph.nodes) {
      const nb = [...(graph.adjacency.get(n)?.keys() ?? [])];
      for (let i = 0; i < nb.length; i++) {
        for (let j = i + 1; j < nb.length; j++) {
          if (graph.adjacency.get(nb[i])?.has(nb[j])) triangles++;
        }
      }
    }
    expect(triangles).toBeGreaterThan(0);
  });

  it('drops an event with no person, since it has nothing bipartite to contribute', () => {
    const graph = personGraph([event({ actors: ['IND', 'CHN'], people: [] })]);
    expect(graph.edges).toHaveLength(0);
  });
});

describe('personPanel', () => {
  // modi's home is IND. Two events: one tying him to IND (home, high escalation), one to
  // CHN (cross-border, lower). The home edge is therefore the heavier of the two, which is
  // what makes the exclusion observable.
  const events = () => [
    event({ actors: ['IND'], people: ['modi'], escalation: 90, confidence: 90 }),
    event({ actors: ['CHN'], people: ['modi'], escalation: 30, confidence: 90 }),
  ];

  it('emits eight rows now that the graph has triangles', () => {
    // Entanglement and Conflict cluster were dropped BECAUSE a bipartite graph has none of
    // the triangles they measure. Mixing the graph gave that up, so both mean something
    // again: for a person, "the officials you are named with are also named with each
    // other" describes a circle rather than restating a tautology.
    //
    // The order matches lib/graph/panel.ts's country panel, so the two views read alike.
    const labels = personPanel(personGraph(events()), 'modi', 10).rows.map((r) => r.label);
    expect(labels).toEqual([
      'Connections', 'Cross-border friction', 'Brokerage', 'Contagion exposure',
      'Reach', 'Entanglement', 'Core depth', 'Conflict cluster',
    ]);
  });

  it('excludes the home state from cross-border friction', () => {
    // A leader is named beside their own state in nearly every story about it, so counting
    // the home tie would make this row a ranking of who governs a busy country — which the
    // threat board already answers. Only the CHN edge may contribute.
    const graph = personGraph(events());
    const total = personPanel(graph, 'modi', 10).rows
      .find((r) => r.label === 'Cross-border friction')!.value;
    const homeEdge = graph.adjacency.get('modi')!.get('IND')!;
    const awayEdge = graph.adjacency.get('modi')!.get('CHN')!;
    expect(Number(total)).toBe(Math.round(awayEdge.friction));
    // And the home edge is genuinely the heavier one, or this test proves nothing.
    expect(homeEdge.friction).toBeGreaterThan(awayEdge.friction);
  });

  it('still counts the home state as a connection, so affiliation stays visible', () => {
    // Excluded from the friction total, but not hidden: a reader looking at an unfamiliar
    // official needs to know whose minister they are.
    const row = personPanel(personGraph(events()), 'modi', 10).rows
      .find((r) => r.label === 'Connections')!;
    expect(row.value).toBe('2');
    expect(row.reading).toContain('India');
  });

  it('reports no position for a person absent from the graph rather than rank zero', () => {
    // Same rule as lib/graph/panel.ts: 0 is not a rank, and "#0 of 2" claims a position in
    // an ordering the node is not part of.
    const panel = personPanel(personGraph(events()), 'lin-jian', 10);
    expect(panel.rows.find((r) => r.label === 'Brokerage')!.value).toBe('—');
    expect(panel.degree).toBe(0);
  });
});

describe('edge context', () => {
  it('carries the states of the events behind an edge, most frequent first', () => {
    // "Place as context" is the half of the request the country nodes only imply. In a force
    // layout position is an artefact of the solver, so proximity is not a reading — the edge
    // has to say where it came from.
    //
    // IND IS SEEN FIRST AND CHN MORE OFTEN, deliberately. An earlier version of this test
    // fed CHN first as well, so insertion order and frequency order agreed and the assertion
    // passed with the sort deleted — it looked like it pinned ranking and pinned nothing.
    // The orders must disagree or this test proves only that the field is populated.
    const graph = personGraph([
      event({ actors: ['IND'], people: ['modi', 'wang-yi'] }),
      event({ actors: ['CHN'], people: ['modi', 'wang-yi'] }),
      event({ actors: ['CHN'], people: ['modi', 'wang-yi'] }),
    ]);
    const edge = graph.adjacency.get('modi')!.get('wang-yi')!;
    expect(edge.context).toEqual(['CHN', 'IND']);   // CHN twice, IND once, IND inserted first
  });

  it('breaks a tie by name, so equal counts do not order by Map insertion', () => {
    // Without the name tie-break the order is whatever the extractor happened to emit, which
    // reads as ranking to a reader and is not one. Actors are given IND-first and must come
    // back CHN-first.
    const graph = personGraph([event({ actors: ['IND', 'CHN'], people: ['modi', 'wang-yi'] })]);
    const edge = graph.adjacency.get('modi')!.get('wang-yi')!;
    expect(edge.context).toEqual(['CHN', 'IND']);
  });

  it('accumulates over every contributing event, not only those kept for topEvents', () => {
    // topEvents is capped at topPerEdge (8). Deriving place from it would read a sample of a
    // 29-event tie and present it as the whole, which is the kind of quiet approximation
    // this product exists to avoid.
    const many = Array.from({ length: 12 }, (_, i) =>
      event({ actors: [i === 11 ? 'PAK' : 'CHN'], people: ['modi', 'wang-yi'] }));
    const edge = personGraph(many).adjacency.get('modi')!.get('wang-yi')!;
    expect(edge.context).toContain('PAK');
  });

  it('counts a repeated context value once per event, not once per repeat', () => {
    // buildGraph dedupes participants but accumulated context verbatim, so a duplicated
    // value would outrank one that genuinely appeared in more events.
    //
    // IND IS REPEATED THREE TIMES, not two, and that matters. At two the undeduped count
    // ties CHN at 2 and the alphabetical tie-break returns the right answer anyway, so the
    // assertion passes against its own mutant — the same trap this file's context-ordering
    // test already fell into once. At three, IND wins outright without the dedupe.
    const graph = personGraph([
      event({ actors: ['IND', 'IND', 'IND', 'CHN'], people: ['modi', 'wang-yi'] }),
      event({ actors: ['CHN'], people: ['modi', 'wang-yi'] }),
    ]);
    expect(graph.adjacency.get('modi')!.get('wang-yi')!.context).toEqual(['CHN', 'IND']);
  });

  it('is empty rather than absent when the extractor supplies none', () => {
    // stateGraph passes no context: a country-country edge's context would be its own two
    // endpoints, which is noise. Consumers still index into it, so it must be [] not
    // undefined — the tooltip in NetworkGraph reads .length without a guard.
    const graph = stateGraph([event({ actors: ['IND', 'CHN'], people: [] })]);
    expect(graph.edges[0].context).toEqual([]);
  });
});

describe('nodeHref', () => {
  it('routes a person to /person and a state to /network', () => {
    // NetworkGraph draws both node kinds once the graph is mixed, and a hardcoded
    // '/network/' would send every person link to a 404. The id alone does not say which
    // kind it is, so the component must not guess either.
    expect(nodeHref('modi', ['CHN'])).toBe('/person/modi?trail=CHN');
    expect(nodeHref('IND', ['CHN'])).toBe('/network/IND?trail=CHN');
  });

  it('drops the destination from the trail, as nextTrail does', () => {
    // Same walk semantics either side: arriving somewhere already in the trail must not
    // duplicate it, because parseTrail appends the focus on arrival.
    expect(nodeHref('modi', ['modi', 'CHN'])).toBe('/person/modi?trail=CHN');
  });

  it('encodes the trail, so a junk token cannot truncate the walk', () => {
    expect(nodeHref('IND', ['A#B', 'CHN'])).toBe('/network/IND?trail=A%23B,CHN');
  });
});

describe('personBox', () => {
  const SIZE = 520;

  it('sizes the box to the label rather than to the node radius', () => {
    const box = personBox('Doval', 12, 260, SIZE);
    expect(box.w).toBeGreaterThan(2 * 12);
    expect(box.label).toBe('Doval');
  });

  it('never lets a box leave the canvas, however long the name', () => {
    // radialLayout reserves 2*r <= 40 for a node and knows nothing about label width, so a
    // long name centred near the ring edge used to be drawn straight off the viewBox:
    // 'Mohammed bin Abdulrahman Al Thani' computes to 232px, and centred at the extreme
    // x = 474 its right edge landed at 590 in a 520-wide canvas. Both extremes, both sides.
    for (const x of [46, 474, 0, SIZE]) {
      const box = personBox('Mohammed bin Abdulrahman Al Thani', 9, x, SIZE);
      expect(box.cx - box.w / 2).toBeGreaterThanOrEqual(0);
      expect(box.cx + box.w / 2).toBeLessThanOrEqual(SIZE);
    }
  });

  it('is always visibly wider than tall, so it never becomes a circle', () => {
    // THE CONSTRAINT THIS EXISTS FOR. Node type is distinguished by shape, never colour,
    // because colour is what the palette control reassigns. A rect of w = h with rx = r is
    // an exact circle, so a short-named person on a large node was drawn identically to a
    // state: 'Doval' rendered 52x52 at rx 26 in the live page. Every label, short or long,
    // must come back wider than the node is tall.
    for (const label of ['Xi', 'Lai', 'Modi', 'Doval', 'Volodymyr Zelensky']) {
      for (const r of [9, 14, 20, 26]) {
        const box = personBox(label, r, 260, SIZE);
        expect(box.w / (2 * r)).toBeGreaterThan(1.2);
      }
    }
  });

  it('leaves a box that already fits exactly where the layout put it', () => {
    // Clamping must not shove ordinary nodes around: only the ones that would overflow.
    const box = personBox('Xi', 12, 300, SIZE);
    expect(box.cx).toBe(300);
  });

  it('ellipsises a name too wide to draw, rather than spanning the canvas', () => {
    const box = personBox('Mohammed bin Abdulrahman Al Thani', 9, 260, SIZE);
    expect(box.label.endsWith('…')).toBe(true);
    expect(box.label.length).toBeLessThan('Mohammed bin Abdulrahman Al Thani'.length);
    expect(box.w).toBeLessThanOrEqual(160);
  });
});

describe('isKnownNode', () => {
  it('accepts a state code and a person token, in either case', () => {
    // Both walk pages filter their trail through this. They used to carry the predicate
    // inline and separately — the person page correctly (lowercasing before the roster
    // lookup) and the state page not at all, which is how a person came to be 404-linked in
    // one breadcrumb and dropped from the other. One definition, two callers.
    expect(isKnownNode('CHN')).toBe(true);
    expect(isKnownNode('AJIT-DOVAL')).toBe(true);
    expect(isKnownNode('ajit-doval')).toBe(true);
  });

  it('rejects a token naming neither, so junk cannot become a link', () => {
    // parseTrail sanitises shape but not meaning, so a trail token is whatever was typed.
    expect(isKnownNode('NOT-A-NODE')).toBe(false);
    expect(isKnownNode('ZZZ')).toBe(false);
  });
});

describe('trailNode', () => {
  it('resolves an uppercased person token back to its roster id', () => {
    // parseTrail uppercases every token; roster ids are lowercase. Before this existed the
    // breadcrumb on a person-to-person walk read 'AJIT-DOVAL' and linked it to
    // /network/AJIT-DOVAL, a verified 404 — the same two defects nodeHref and nodeLabel fix
    // for graph nodes, one file over. Only reachable once the graph was mixed.
    expect(trailNode('AJIT-DOVAL')).toEqual({ id: 'ajit-doval', person: true });
  });

  it('leaves a state code alone, since ISO3 is already its canonical form', () => {
    expect(trailNode('CHN')).toEqual({ id: 'CHN', person: false });
  });

  it('leaves a token naming nothing alone rather than inventing a person', () => {
    // parseTrail deliberately does not judge what a token means, so this can be any string
    // somebody typed. It must come back unchanged and non-person.
    expect(trailNode('NOT-A-NODE')).toEqual({ id: 'NOT-A-NODE', person: false });
  });
});

describe('nodeLabel', () => {
  it('shows a state as its code and a person by the name outlets print', () => {
    // A slug is not a name. 'ajit-doval' is how the roster keys the record; 'Doval' is what
    // every outlet in the corpus writes, and it is what fits inside a node.
    expect(nodeLabel('IND')).toBe('IND');
    expect(nodeLabel('ajit-doval')).toBe('Doval');
    // Surname-first, so the LAST word is the given name. Labelling him 'Jinping' is the
    // same error as labelling Donald Trump 'Donald', and it breaks for Wang Yi, Li Qiang,
    // Kim Jong Un, Lee Jae-myung, To Lam and Lai Ching-te too — a large share of this
    // roster. No rule can infer the convention from the string, so the roster states it.
    expect(nodeLabel('xi-jinping')).toBe('Xi');
    expect(nodeLabel('wang-yi')).toBe('Wang Yi');
  });

  it('falls back to the id for a node the roster does not know', () => {
    // A hand-built graph in a test, or a stale id in a URL, must render as something rather
    // than as undefined.
    expect(nodeLabel('nobody-here')).toBe('nobody-here');
  });
});
