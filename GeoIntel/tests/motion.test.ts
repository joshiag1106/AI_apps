import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hotspotPulseDuration, severityPulseDuration } from '@/lib/motion';
import { WorldMap } from '@/components/WorldMap';
import { Mandala } from '@/components/Mandala';
import { Columns, Sparkline, Radar, BarList } from '@/components/charts';
import { CountUp } from '@/components/CountUp';
import { NetworkGraph } from '@/components/NetworkGraph';
import { ConfidenceMeter } from '@/components/ConfidenceMeter';
import { LadderGauge } from '@/components/LadderGauge';
import { EventRow } from '@/components/EventCard';
import { FlashNewItems } from '@/components/FlashNewItems';
import { WatchStar } from '@/components/WatchStar';
import type { GeoEvent } from '@/lib/types';

const svg = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('pulse duration scales with severity, not just on/off', () => {
  it('a colder flashpoint pulses slower than a hotter one', () => {
    // The mutant this catches: a constant duration that ignores heat entirely.
    expect(hotspotPulseDuration(0)).toBeGreaterThan(hotspotPulseDuration(100));
  });

  it('clamps heat outside 0-100 rather than producing a negative or runaway duration', () => {
    expect(hotspotPulseDuration(-50)).toBe(hotspotPulseDuration(0));
    expect(hotspotPulseDuration(500)).toBe(hotspotPulseDuration(100));
  });

  it('a more severe mandala node pulses faster than a merely-severe one', () => {
    expect(severityPulseDuration(70)).toBeGreaterThan(severityPulseDuration(100));
  });

  it('clamps mandala severity below the 70 floor to the slowest rate rather than throwing', () => {
    expect(severityPulseDuration(0)).toBe(severityPulseDuration(70));
  });
});

describe('WorldMap flashpoint markers pulse at a heat-scaled rate', () => {
  it('gives a hot marker a shorter animation-duration than a cold one', () => {
    const shapes = [{ name: 'X', d: 'M0 0', iso: undefined }];
    const out = svg(createElement(WorldMap, {
      shapes, data: [],
      markers: [
        { id: 'cold', name: 'Cold spot', x: 10, y: 10, heat: 0, count: 1 },
        { id: 'hot', name: 'Hot spot', x: 20, y: 20, heat: 100, count: 1 },
      ],
    } as never));
    expect(out).toContain(`animation-duration:${hotspotPulseDuration(0)}s`);
    expect(out).toContain(`animation-duration:${hotspotPulseDuration(100)}s`);
  });
});

describe('Mandala pulses only the severe tier', () => {
  it('gives a severe node (score >= 70) a pulse ring', () => {
    const out = svg(createElement(Mandala, {
      focus: 'IND',
      nodes: [{ iso: 'CHN', score: 85, eventCount: 12 }],
    } as never));
    expect(out).toContain('pulse-ring');
    expect(out).toContain(`animation-duration:${severityPulseDuration(85)}s`);
  });

  it('gives a merely-elevated node (score < 70) no pulse ring at all', () => {
    // The mutant this catches: the >= 70 gate dropped, so every node pulses.
    const out = svg(createElement(Mandala, {
      focus: 'IND',
      nodes: [{ iso: 'PAK', score: 45, eventCount: 4 }],
    } as never));
    expect(out).not.toContain('pulse-ring');
  });
});

describe('Columns plots defining events on the day they happened', () => {
  const data = [
    { date: '2026-09-01', value: 4 },
    { date: '2026-09-02', value: 11 },
    { date: '2026-09-03', value: 7 },
  ];

  it('links a marker on a date the series actually has', () => {
    const out = svg(createElement(Columns, {
      data, markers: [{ date: '2026-09-02', href: '/events/abc', label: 'Talks collapse' }],
    }));
    expect(out).toContain('href="/events/abc"');
    expect(out).toContain('aria-label="Talks collapse"');
  });

  it('silently drops a marker whose date falls outside the plotted window, rather than mis-plotting it', () => {
    // The mutant this catches: falling back to index 0 (or NaN) for a missing date
    // instead of skipping the marker, which would pin it to the wrong day.
    const out = svg(createElement(Columns, {
      data, markers: [{ date: '2026-01-01', href: '/events/old', label: 'Too old to plot' }],
    }));
    expect(out).not.toContain('/events/old');
  });

  it('draws no markers, and no crash, when none are given', () => {
    expect(svg(createElement(Columns, { data }))).not.toContain('<a');
  });
});

describe('the live feed marks each row for FlashNewItems to find', () => {
  const event: GeoEvent = {
    id: 'evt-1', title: 'Talks resume', summary: '', firstSeen: '2026-09-01', lastSeen: '2026-09-01',
    actors: ['IND', 'CHN'], people: [], hotspots: [], domain: 'Diplomatic', escalation: 5, confidence: 60,
    signals: [], flags: [], articleIds: ['a1'], languages: ['en'], countries: ['IND', 'CHN'],
    imageUrl: null, videoId: null, ladderRung: null, ladderZh: null, ladderEn: null,
  };

  it('gives EventRow a data-item-id matching the event, for FlashNewItems to target', () => {
    const out = svg(createElement(EventRow, { event }));
    expect(out).toContain('data-item-id="evt-1"');
  });

  it('FlashNewItems renders its children through on first paint, since SSR never runs an effect', () => {
    const out = svg(createElement(FlashNewItems, { ids: ['evt-1'], children: createElement(EventRow, { event }) }));
    expect(out).toContain('data-item-id="evt-1"');
    expect(out).not.toContain('flash-new'); // never flashes what was already there on load
  });
});

describe('WatchStar renders the current state with no pop on first paint', () => {
  it('shows a filled star when already on, unfilled when off — and never star-pop', () => {
    expect(svg(createElement(WatchStar, { on: true }))).toBe('<span aria-hidden="true">★</span>');
    expect(svg(createElement(WatchStar, { on: false }))).toBe('<span aria-hidden="true">☆</span>');
  });
});

describe('CountUp renders the current value on first paint', () => {
  it('shows the formatted number with no animation state, since SSR never runs an effect', () => {
    expect(svg(createElement(CountUp, { value: 6348 }))).toBe('6,348');
  });

  it('honours a custom formatter', () => {
    expect(svg(createElement(CountUp, { value: 42, format: (n) => `${n}%` }))).toBe('42%');
  });
});

describe('WorldMap country fills cross-fade instead of hard-cutting', () => {
  it('gives every state path a fill transition', () => {
    const shapes = [{ name: 'X', d: 'M0 0', iso: 'IND' }];
    const out = svg(createElement(WorldMap, {
      shapes, data: [{ iso: 'IND', composite: 60, eventCount: 10, name: 'India' }], markers: [],
    } as never));
    expect(out).toContain('transition:fill 700ms ease');
  });
});

describe("the network graph highlights the edge the reader just walked", () => {
  const view = {
    focus: 'CHN',
    neighbours: ['IND', 'USA'],
    edges: [
      { a: 'CHN', b: 'IND', friction: 50, alignment: 0, events: 5, alignmentEvents: 0, context: [] },
      { a: 'CHN', b: 'USA', friction: 80, alignment: 0, events: 10, alignmentEvents: 0, context: [] },
    ],
    hidden: 0,
  };

  it('marks no edge as traveled on a fresh visit (a trail of one)', () => {
    const out = svg(createElement(NetworkGraph, { view, trail: ['CHN'], topEvents: new Map() } as never));
    expect(out).not.toContain('edge-traveled');
  });

  it('marks exactly the edge back to where the reader just came from', () => {
    // The mutant this catches: highlighting every spoke, or the wrong one.
    const out = svg(createElement(NetworkGraph, { view, trail: ['IND', 'CHN'], topEvents: new Map() } as never));
    expect((out.match(/edge-traveled/g) ?? []).length).toBe(1);
  });

  it('marks nothing when the previous stop is not one of this view\'s edges', () => {
    const out = svg(createElement(NetworkGraph, { view, trail: ['RUS', 'CHN'], topEvents: new Map() } as never));
    expect(out).not.toContain('edge-traveled');
  });
});

describe('RevealOnView wraps charts without swallowing their content', () => {
  it('sparkline still renders its line through the wrapper', () => {
    const out = svg(createElement(Sparkline, { data: [1, 5, 2], label: 'Tension' }));
    expect(out).toContain('<svg');
    expect(out).toContain('Tension');
  });
});

describe('the risk radar scales in only its data shape, not the grid', () => {
  it('marks exactly one polygon reveal-scale — the data shape, not the four grid rings', () => {
    const out = svg(createElement(Radar, {
      axes: [{ label: 'Military', value: 62 }, { label: 'Diplomatic', value: 31 }, { label: 'Economic', value: 40 }],
    }));
    expect((out.match(/<polygon/g) ?? []).length).toBe(5); // 4 grid rings + 1 data shape
    expect((out.match(/reveal-scale/g) ?? []).length).toBe(1);
  });
});

describe('progress bars grow in from zero instead of rendering pre-filled', () => {
  it('marks BarList\'s category bars', () => {
    const out = svg(createElement(BarList, {
      items: [{ label: 'Diplomatic', value: 424 }, { label: 'Military', value: 172 }],
    }));
    expect((out.match(/data-reveal-bar/g) ?? []).length).toBe(2);
  });

  it('marks ConfidenceMeter\'s overall bar and every scored signal\'s bar', () => {
    const out = svg(createElement(ConfidenceMeter, {
      value: 62,
      signals: [
        { key: 'a', label: 'Independent outlets', detail: 'x', points: 3, max: 5 },
        { key: 'b', label: 'Primary source', detail: 'y', points: 0, max: 0 }, // max 0: no bar drawn at all
      ],
      flags: [],
    }));
    // The overall bar plus signal "a"'s bar (max > 0); signal "b" draws no bar (max is 0).
    expect((out.match(/data-reveal-bar/g) ?? []).length).toBe(2);
  });

  it('marks every rung of the escalation ladder', () => {
    const out = svg(createElement(LadderGauge, { rung: 3, compact: true }));
    const rungCount = (out.match(/mono-num w-5 text-right/g) ?? []).length;
    expect(rungCount).toBeGreaterThan(0);
    expect((out.match(/data-reveal-bar/g) ?? []).length).toBe(rungCount);
  });
});

describe('WorldMap can drop its legend for a non-dashboard caller', () => {
  // Added 2026-09-18. The splash page (app/page.tsx) wants the map itself, quieted, behind
  // a headline — not the "Composite risk / low -> severe / active flashpoint" legend and its
  // two links to /dashboard and /methodology, which read as confusing dead furniture on a
  // page that is not the dashboard. Found by rendering the real thing in a browser and
  // reading the DOM text, not by inspecting the component's source first — a screenshot
  // alone made it look like a rendering artifact from switching tabs; only checking
  // document.body.innerText showed it was real content.
  const shapes = [{ name: 'X', d: 'M0 0', iso: undefined }];

  it('shows the legend by default, so every existing caller is unaffected', () => {
    const out = svg(createElement(WorldMap, { shapes, data: [], markers: [] } as never));
    expect(out).toContain('Composite risk');
  });

  it('drops it entirely when legend={false}, including its dashboard/methodology links', () => {
    const out = svg(createElement(WorldMap, { shapes, data: [], markers: [], legend: false } as never));
    expect(out).not.toContain('Composite risk');
    expect(out).not.toContain('/dashboard');
    expect(out).not.toContain('/methodology');
  });
});
