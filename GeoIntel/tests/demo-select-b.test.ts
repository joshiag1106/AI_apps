// tests/demo-select-b.test.ts
import { describe, it, expect } from 'vitest';
import { selectEvent, selectRisk, selectDyad, selectNetwork, selectAsk } from '@/lib/demo/select';
import { stateGraph } from '@/lib/graph/build';
import { egoView } from '@/lib/graph/ego';
import { art, evt, input, richInput } from './fixtures/demo-fixtures';

const CASINO = '众赢国际手机版_体育_8·15日本政要又“拜鬼”，中方严正交涉强烈抗议';
const T = 'Beijing lodges solemn representations with Tokyo over shrine visits';
const en = (p: Parameters<typeof art>[0]) => art({ language: 'en', ladderRung: null, ...p });
const plain = () => ({
  event: evt({ title: 'plain' }),
  articles: [en({ title: 'One report about ports', outlet: 'A' }), en({ title: 'Another about grain', outlet: 'B' }), en({ title: 'A third about oil', outlet: 'C' })],
});

describe('chapter 3 — event', () => {
  it('folds a reprint into the report it repeats and lists the distinct reports', () => {
    const d = selectEvent(richInput())!;
    expect(d.title).toBe('Tokyo shrine dispute');
    expect(d.confidence).toBe(82);
    expect(d.reports.map((r) => r.title)).toEqual([T, 'Japan says shrine visit was private, urges calm']);
    expect(d.reprints).toHaveLength(1);
    expect(d.reprints[0].title).toBe(T);
  });

  it('prefers an event with a reprint over one without, wherever it sits in the list', () => {
    const withReprint = richInput().eventCandidates[0];
    expect(selectEvent(input({ eventCandidates: [plain(), withReprint] }))!.title).toBe('Tokyo shrine dispute');
  });

  it('falls back to a multi-report event with no reprint rather than nothing', () => {
    const d = selectEvent(input({ eventCandidates: [plain()] }))!;
    expect(d.title).toBe('plain');
    expect(d.reprints).toEqual([]);
  });

  it('needs at least three usable articles and two distinct reports', () => {
    const two = { event: evt(), articles: [en({ title: T, outlet: 'A' }), en({ title: T, outlet: 'B' })] };
    const oneStory = { event: evt(), articles: [en({ title: T, outlet: 'A' }), en({ title: T, outlet: 'B' }), en({ title: T, outlet: 'C' })] };
    expect(selectEvent(input({ eventCandidates: [two] }))).toBeNull();
    expect(selectEvent(input({ eventCandidates: [oneStory] }))).toBeNull();
    expect(selectEvent(input())).toBeNull();
  });

  it('does not count a casino page toward the three', () => {
    const c = { event: evt(), articles: [en({ title: T, outlet: 'A' }), en({ title: CASINO, outlet: 'B' }), en({ title: 'Japan says shrine visit was private', outlet: 'C' })] };
    expect(selectEvent(input({ eventCandidates: [c] }))).toBeNull();
  });
});

describe('chapter 6 — risk', () => {
  it('takes the highest composite, with the axes in the fixed vector order', () => {
    const d = selectRisk(input({ risks: [
      { iso: 'JPN', composite: 30, vectors: {} },
      { iso: 'CHN', composite: 60, vectors: { Military: 50, Economic: 40, Cyber: 30, Internal: 20, Diplomatic: 60, Energy: 10 } },
    ] }))!;
    expect(d).toMatchObject({ iso: 'CHN', name: 'China', score: 60 });
    expect(d.axes.map((a) => a.label)).toEqual(['Military', 'Economic', 'Cyber', 'Internal', 'Diplomatic', 'Energy']);
    expect(d.axes.map((a) => a.value)).toEqual([50, 40, 30, 20, 60, 10]);
  });

  it('reads a missing vector as zero and is null with no risks', () => {
    expect(selectRisk(input({ risks: [{ iso: 'CHN', composite: 60, vectors: {} }] }))!.axes.every((a) => a.value === 0)).toBe(true);
    expect(selectRisk(input())).toBeNull();
  });
});

describe('chapter 7 — dyad', () => {
  it('takes the first dyad with three defining events that land on the series', () => {
    const d = selectDyad(richInput())!;
    expect(d).toMatchObject({ aName: 'China', bName: 'Japan', score: 55 });
    expect(d.series).toHaveLength(90);
    expect(d.markers.map((m) => m.date)).toEqual(['2026-09-15', '2026-09-12', '2026-09-08']);
  });

  it('skips a dyad whose events fall outside the series, and one with too few', () => {
    const base = richInput().dyads[0];
    const outside = { ...base, topEvents: base.topEvents.map((e) => ({ ...e, lastSeen: '2025-01-01T00:00:00.000Z' })) };
    const few = { ...base, topEvents: base.topEvents.slice(0, 2) };
    expect(selectDyad(input({ dyads: [outside, few] }))).toBeNull();
    expect(selectDyad(input({ dyads: [outside, few, base] }))!.markers).toHaveLength(3);
  });
});

describe('chapter 8 — network', () => {
  it('walks from the highest-risk state to its strongest neighbour', () => {
    const d = selectNetwork(richInput())!;
    expect(d.from).toBe('CHN');
    expect(d.to).toBe('JPN');
    expect(d.trail).toEqual(['CHN', 'JPN']);
    expect(d.view.focus).toBe('JPN');
    expect(d.view.neighbours).toContain('CHN');
  });

  it('is null with no risks, or when nothing is connected to anything', () => {
    expect(selectNetwork(input())).toBeNull();
    expect(selectNetwork(richInput({ events: [evt({ actors: ['CHN'] })] }))).toBeNull();
  });

  // The hub shape: PRK has ONE edge, to RUS, so RUS is PRK's strongest neighbour. RUS has twelve other
  // neighbours, each joined by three events against PRK's one, so PRK ranks thirteenth in RUS's own
  // list and egoView's top-ten cap hides it.
  const HUB_SPOKES = ['ARG', 'BRA', 'CAN', 'DEU', 'EGY', 'FRA', 'GBR', 'IDN', 'ITA', 'KOR', 'MEX', 'TUR'];
  const hubEvents = () => [
    evt({ actors: ['PRK', 'RUS'] }),
    ...HUB_SPOKES.flatMap((s) => [0, 1, 2].map(() => evt({ actors: ['RUS', s] }))),
  ];
  const hubRisks = [{ iso: 'PRK', composite: 90, vectors: {} }];

  it('skips a walk whose origin the destination\'s top-10 view would hide', () => {
    const events = hubEvents();
    const graph = stateGraph(events, input().now);
    // Prove the scenario rather than only the result: RUS is PRK's strongest neighbour, and RUS's own
    // view leaves PRK out.
    expect(egoView(graph, 'PRK').neighbours[0]).toBe('RUS');
    const hub = egoView(graph, 'RUS');
    expect(hub.neighbours).not.toContain('PRK');
    expect(hub.hidden).toBeGreaterThan(0);
    expect(hub.edges.some((e) => e.a === 'PRK' || e.b === 'PRK')).toBe(false);

    expect(selectNetwork(input({ events, risks: hubRisks }))).toBeNull();
  });

  it('falls back to the next risk state when the first walk would be hidden', () => {
    const events = [...hubEvents(), evt({ actors: ['IND', 'PAK'] })];
    const d = selectNetwork(input({ events, risks: [...hubRisks, { iso: 'IND', composite: 50, vectors: {} }] }))!;
    expect(d.from).toBe('IND');
    expect(d.to).toBe('PAK');
    expect(d.trail).toEqual(['IND', 'PAK']);
    // The edge just crossed is really in the view the graph will draw.
    expect(d.view.neighbours).toContain('IND');
    expect(d.view.edges.some((e) => (e.a === 'IND' && e.b === 'PAK') || (e.a === 'PAK' && e.b === 'IND'))).toBe(true);
  });
});

describe('chapter 9 — ask', () => {
  it('asks about the top dyad in the form the parser is proven to read, and the answer is not empty', () => {
    const d = selectAsk(richInput())!;
    expect(d.question).toBe('what is happening between China and Japan?');
    expect(d.headline.length).toBeGreaterThan(0);
    expect(Array.isArray(d.readAs)).toBe(true);
    expect(Array.isArray(d.figures)).toBe(true);
  });

  it('is null with no dyad to ask about', () => {
    expect(selectAsk(input())).toBeNull();
  });
});
