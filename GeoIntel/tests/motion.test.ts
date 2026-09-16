import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hotspotPulseDuration, severityPulseDuration } from '@/lib/motion';
import { WorldMap } from '@/components/WorldMap';
import { Mandala } from '@/components/Mandala';
import { Columns } from '@/components/charts';
import { CountUp } from '@/components/CountUp';

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

describe('CountUp renders the current value on first paint', () => {
  it('shows the formatted number with no animation state, since SSR never runs an effect', () => {
    expect(svg(createElement(CountUp, { value: 6348 }))).toBe('6,348');
  });

  it('honours a custom formatter', () => {
    expect(svg(createElement(CountUp, { value: 42, format: (n) => `${n}%` }))).toBe('42%');
  });
});
