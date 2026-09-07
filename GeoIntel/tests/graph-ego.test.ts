// tests/graph-ego.test.ts
import { describe, it, expect } from 'vitest';
import { buildGraph } from '@/lib/graph/build';
import { egoView, parseTrail, nextTrail, encodeTrail } from '@/lib/graph/ego';

/**
 * Ego extraction makes the drilldown readable. The corpus graph has a node of degree 59
 * out of a possible 65, so an uncapped neighbourhood is very nearly the whole network and
 * renders a hairball on the first click. The view keeps the strongest neighbours by friction
 * and reports how many it hid rather than silently dropping them. Edges among visible
 * neighbours are included so the clustering coefficient is visible in both the panel and
 * the diagram beside it.
 *
 * Trail parsing is untrusted input straight from the URL: repeats collapse so cycles
 * cannot grow without bound, and length is capped against hand-edited addresses.
 *
 * Mutation tests:
 * - "keeps only the strongest N..." catches reversing sort (weakest first) and zeroing hidden
 * - "includes edges among..." catches omitting the inter-neighbour edge loop
 * - "never includes an edge to a neighbour it hid" validates edge filtering
 * - "returns an empty view for an unknown node" validates the null case
 * - "orders neighbours by friction..." catches reversing sort and validates tie-break name order
 * - "appends the focus to the end" catches focus placed elsewhere
 * - "drops a repeat (focus-filter)..." tests the `filter(s !== focus)` focus-removal branch
 * - "drops a repeat (genuine dedup)..." tests the `deduped` loop collapsing non-focus repeats
 * - "handles an absent or empty trail" validates empty-input handling
 * - "ignores blanks and normalises case" tests whitespace and case handling
 * - "caps length..." catches removing MAX_TRAIL cap (exact equality)
 * - "keeps the focus last even when truncated" catches reordering during truncation
 *
 * nextTrail was extracted from components/NetworkGraph.tsx in a Task 7 review fix.
 * That component's own inline version appended `view.focus` after filtering — but
 * parseTrail already places the current focus last, so every generated link carried a
 * duplicate ('?trail=CHN,CHN'). It survived every prior check because it lived in an
 * untested component and parseTrail's own dedup silently cleaned up the mess on arrival,
 * so the rendered breadcrumb always looked correct even though the URL was wrong.
 * - "round-trips with parseTrail..." is the test that would have caught it directly:
 *   it fails immediately if `to` is ever appended after the filter.
 * - "extends correctly across two hops" catches the bug compounding (or any other
 *   accumulation error) across a longer walk.
 * - "drops the destination from its earlier position" tests the filter half of
 *   nextTrail on its own terms, independent of parseTrail's later dedup.
 */

interface I { who: string[]; f: number }
const g = (pairs: [string, string, number?][]) =>
  buildGraph<I>(pairs.map(([a, b, f]) => ({ who: [a, b], f: f ?? 50 })),
    (i) => ({ participants: i.who, friction: i.f, alignment: 0 }));

describe('ego view', () => {
  it('keeps only the strongest N neighbours and reports how many it hid', () => {
    // The corpus has a node of degree 59; without a cap one click draws the whole graph.
    const graph = g([['H', 'A', 10], ['H', 'B', 20], ['H', 'C', 30], ['H', 'D', 40]]);
    const v = egoView(graph, 'H', 2);
    expect(v.neighbours).toEqual(['D', 'C']);
    expect(v.hidden).toBe(2);
  });

  it('includes edges among the neighbours, not only spokes to the focus', () => {
    // Without these the clustering coefficient is reported but invisible.
    const v = egoView(g([['H', 'A'], ['H', 'B'], ['A', 'B']]), 'H', 5);
    const pairs = v.edges.map((e) => `${e.a}${e.b}`).sort();
    expect(pairs).toContain('AB');
    expect(v.edges).toHaveLength(3);
  });

  it('never includes an edge to a neighbour it hid', () => {
    // H is joined to A (90) and B (1), and A-B (90) is strong. Capped to one neighbour,
    // the view must hold exactly ONE edge: the H-A spoke. B is hidden, so neither H-B nor
    // A-B may appear — an edge to a node with no circle renders as nothing at all.
    //
    // This asserts the exact edge set rather than "every endpoint is H or a neighbour",
    // which was the previous shape and was true by construction: the edges are built by
    // iterating the neighbour list itself, so no endpoint could ever fail it and deleting
    // the filter entirely left the test green. Pinning the count is what makes the natural
    // regression — seeding edges from g.adjacency, as a second ring would want — fail here.
    const v = egoView(g([['H', 'A', 90], ['H', 'B', 1], ['A', 'B', 90]]), 'H', 1);
    expect(v.neighbours).toEqual(['A']);
    expect(v.edges).toHaveLength(1);
    expect([v.edges[0].a, v.edges[0].b].sort()).toEqual(['A', 'H']);
    expect(v.hidden).toBe(1);
  });

  it('returns an empty view for an unknown node rather than throwing', () => {
    const v = egoView(g([['A', 'B']]), 'ZZZ', 5);
    expect(v.neighbours).toEqual([]);
    expect(v.edges).toEqual([]);
    expect(v.hidden).toBe(0);
  });

  it('orders neighbours by friction, strongest first', () => {
    const v = egoView(g([['H', 'A', 5], ['H', 'B', 80], ['H', 'C', 40]]), 'H', 3);
    expect(v.neighbours).toEqual(['B', 'C', 'A']);
  });

  it('breaks ties by name order to keep the rendered ring stable between loads', () => {
    // Both H-Z and H-A default to friction 50, which squashes to 57. Tie-break is lexicographic.
    const v = egoView(g([['H', 'Z'], ['H', 'A']]), 'H', 2);
    expect(v.neighbours).toEqual(['A', 'Z']);
  });
});

describe('walk trail', () => {
  it('appends the focus to the end', () => {
    expect(parseTrail('IND,PAK', 'CHN')).toEqual(['IND', 'PAK', 'CHN']);
  });

  it('drops a repeat (focus-filter) so a cycle cannot grow without bound', () => {
    // When the focus is reached again (IND -> PAK -> IND), remove the already-seen focus.
    expect(parseTrail('IND,CHN', 'IND')).toEqual(['CHN', 'IND']);
  });

  it('drops a repeat (genuine dedup) among trail tokens', () => {
    // Hand-edited URL like ?trail=IND,PAK,IND,PAK: non-focus repeats also collapse.
    expect(parseTrail('IND,PAK,IND', 'CHN')).toEqual(['IND', 'PAK', 'CHN']);
  });

  it('handles an absent or empty trail', () => {
    expect(parseTrail(undefined, 'IND')).toEqual(['IND']);
    expect(parseTrail('', 'IND')).toEqual(['IND']);
  });

  it('ignores blanks and normalises case', () => {
    expect(parseTrail('ind,,  pak ', 'CHN')).toEqual(['IND', 'PAK', 'CHN']);
  });

  it('caps length so a hand-edited URL cannot grow unboundedly', () => {
    const long = Array.from({ length: 60 }, (_, i) => `X${i}`).join(',');
    expect(parseTrail(long, 'IND')).toHaveLength(24);
  });

  it('keeps the focus last even when the trail is truncated', () => {
    const long = Array.from({ length: 60 }, (_, i) => `X${i}`).join(',');
    const t = parseTrail(long, 'IND');
    expect(t[t.length - 1]).toBe('IND');
  });
});

describe('nextTrail', () => {
  it('round-trips with parseTrail: the focus it already ends with must not be added again', () => {
    // The bug this exists to catch: NetworkGraph used to append view.focus after the
    // filter, so this call produced 'CHN,CHN' instead of 'CHN'. parseTrail always
    // leaves the current focus as the trail's last token, so nextTrail must not re-add
    // it — this is nextTrail's and parseTrail's shared invariant, and the only test
    // that exercises both functions together.
    expect(nextTrail(['CHN'], 'USA')).toBe('CHN');
    expect(parseTrail(nextTrail(['CHN'], 'USA'), 'USA')).toEqual(['CHN', 'USA']);
  });

  it('extends correctly across two hops: CHN -> USA -> IRN', () => {
    const t1 = parseTrail(undefined, 'CHN');
    expect(t1).toEqual(['CHN']);
    const t2 = parseTrail(nextTrail(t1, 'USA'), 'USA');
    expect(t2).toEqual(['CHN', 'USA']);
    const t3 = parseTrail(nextTrail(t2, 'IRN'), 'IRN');
    expect(t3).toEqual(['CHN', 'USA', 'IRN']);
  });

  it('drops the destination from its earlier position when walking back to it', () => {
    // Trail so far: CHN -> USA -> IRN. Walking back to CHN must not produce
    // 'CHN,USA,IRN,CHN' with CHN duplicated — the earlier CHN is dropped by the filter.
    // parseTrail's own focus-filter would also catch a stray duplicate on arrival, but
    // this pins the filter half of nextTrail on its own terms, before that dedup ever runs.
    const trail = ['CHN', 'USA', 'IRN'];
    expect(nextTrail(trail, 'CHN')).toBe('USA,IRN');
    expect(parseTrail(nextTrail(trail, 'CHN'), 'CHN')).toEqual(['USA', 'IRN', 'CHN']);
  });
});

describe('encodeTrail', () => {
  it('neutralises a token that would otherwise truncate the walk', () => {
    // parseTrail sanitises the SHAPE of a trail but deliberately not the meaning of a
    // token, so a token can still be any string somebody typed. Emitted raw, the trail
    // ['IND&N=1', 'CHN'] produces ?trail=IND&N=1,CHN — the next page's `trail` param is
    // then just 'IND' and the rest of the walk is silently gone, with no error. A '#'
    // truncates at the fragment the same way.
    expect(encodeTrail(['IND&N=1', 'CHN'])).toBe('IND%26N%3D1,CHN');
    expect(encodeTrail(['A#B'])).toBe('A%23B');
  });

  it('leaves an ordinary walk readable, because the URL is the shareable artefact', () => {
    // Tokens are encoded individually and joined with a literal comma. Encoding the
    // joined string instead would give CHN%2CUSA%2CIRN — correct, but it makes the one
    // thing this feature asks people to paste to each other unreadable.
    expect(encodeTrail(['CHN', 'USA', 'IRN'])).toBe('CHN,USA,IRN');
  });

  it('survives the decode a browser and framework perform, delivering the token intact', () => {
    // The round trip that matters: what the next page actually receives. Next decodes the
    // query value, then parseTrail splits it — so the comma separators must survive as
    // separators while the '&' inside a token must not become one.
    const encoded = encodeTrail(['IND&N=1', 'CHN']);
    expect(parseTrail(decodeURIComponent(encoded), 'USA')).toEqual(['IND&N=1', 'CHN', 'USA']);
  });

  it('is what nextTrail emits, so no call site can forget to encode', () => {
    expect(nextTrail(['A#B', 'CHN'], 'USA')).toBe('A%23B,CHN');
  });
});

describe('walk origin', () => {
  it('stays at index 0 across every hop, which is what the quota now keys on', () => {
    // app/network/[iso]/page.tsx charges one credit per WALK, keyed on trail[0] — the
    // state the walk began from. That pricing is correct only while the origin stays at
    // index 0 as the walk extends. If parseTrail were ever changed to put the current
    // focus first, or to reverse the trail, every hop would key on a different state and
    // a walk would silently go back to costing a credit per step — the exact behaviour
    // the constant target was introduced to avoid. Nothing else in the suite couples the
    // trail's ordering to the price, so this is the test that holds it.
    const t1 = parseTrail(undefined, 'CHN');
    const t2 = parseTrail(nextTrail(t1, 'USA'), 'USA');
    const t3 = parseTrail(nextTrail(t2, 'IRN'), 'IRN');
    const t4 = parseTrail(nextTrail(t3, 'TWN'), 'TWN');
    expect([t1[0], t2[0], t3[0], t4[0]]).toEqual(['CHN', 'CHN', 'CHN', 'CHN']);
    // And the walk really is extending, not being rewritten under us.
    expect(t4).toEqual(['CHN', 'USA', 'IRN', 'TWN']);
  });

  it('rolls to a new origin once a walk outruns the trail cap, and so charges again', () => {
    // MAX_TRAIL is 24 and parseTrail keeps the most recent steps, so on the 25th hop the
    // original origin falls off the front and trail[0] becomes a later state. The walk
    // then keys on that state instead and costs one more credit. This is a real
    // consequence of the cap rather than a defect — a 25-hop walk is a different session
    // by any reasonable reading — but it is written down here so it is found on purpose
    // rather than discovered as a surprise on someone's bill.
    let trail = parseTrail(undefined, 'S0');
    for (let i = 1; i <= 25; i++) trail = parseTrail(nextTrail(trail, `S${i}`), `S${i}`);
    expect(trail[0]).not.toBe('S0');
    expect(trail).toHaveLength(24);
  });
});
