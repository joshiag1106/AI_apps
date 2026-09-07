import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sparkline, Radar, Columns } from '@/components/charts';

/**
 * What a reader who cannot see the marks is told.
 *
 * These charts had accessible names that stated the chart TYPE and nothing else — "trend",
 * "risk vectors", "90-day tension". That names the frame and withholds the picture: a
 * screen reader announced "risk vectors, image" over six scored axes and moved on. The
 * pattern to copy was already in this codebase — WorldMap's describeMap names the chart,
 * gives the leading values, and points at the table that holds the rest.
 *
 * Assertions are on the DATA in the name, never on the whole sentence. Pinning the prose
 * would make every future rewording a failing test and teach the next person to update the
 * expectation without reading it.
 */
const svg = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('charts describe their data, not their chart type', () => {
  it('sparkline gives direction and endpoints', () => {
    const out = svg(createElement(Sparkline, { data: [3, 9, 14], label: 'Tension' }));
    expect(out).toContain('Tension');
    expect(out).toContain('rising');
    expect(out).toContain('from 3 to 14');
  });

  it('sparkline calls a descending series falling, not merely changed', () => {
    // The mutant this catches: comparing the wrong pair, or hard-coding 'rising'.
    expect(svg(createElement(Sparkline, { data: [14, 9, 3] }))).toContain('falling');
  });

  it('radar announces every axis with its score', () => {
    const out = svg(createElement(Radar, { axes: [
      { label: 'Military', value: 62 }, { label: 'Diplomatic', value: 31 },
    ] }));
    expect(out).toContain('Military 62');
    expect(out).toContain('Diplomatic 31');
  });

  it('radar announces the full axis name while drawing the clipped one', () => {
    // The point of the change: the four-character clip is a drawing constraint, and it
    // used to reach the accessible name too, so a screen reader heard "Mili". Both halves
    // are asserted because dropping either one silently restores the old behaviour.
    const out = svg(createElement(Radar, { axes: [{ label: 'Military', value: 62 }] }));
    expect(out).toContain('aria-label="Risk vectors, each scored 0 to 100: Military 62."');
    expect(out).toContain('>Mili</text>');
  });

  it('columns reports the peak and the latest value', () => {
    const out = svg(createElement(Columns, { data: [
      { date: '2026-09-01', value: 4 },
      { date: '2026-09-02', value: 11 },
      { date: '2026-09-03', value: 7 },
    ] }));
    expect(out).toContain('Peak 11 on 2026-09-02');
    expect(out).toContain('latest 7');
  });

  it('columns says so rather than throwing when the window is empty', () => {
    expect(svg(createElement(Columns, { data: [] }))).toContain('No data in this window');
  });
});

/**
 * The graph nodes are real links — the ego walk is ordinary navigation, which is what makes
 * it work with a keyboard at all. What they lacked was a NAME. Their accessible name fell
 * back to whatever the SVG <text> children concatenate to, so a reader tabbing the mandala
 * met ten links called things like "CHN68": an ISO code welded to a score, with nothing to
 * say which half is which, that 68 counts anything, or where the link goes.
 *
 * The <title> inside each node is a tooltip. It does not name the link, and checking that
 * a title existed is what made this look handled.
 */
describe('graph nodes name themselves', () => {
  it('names the country rather than the code that fits the circle', async () => {
    const { Mandala } = await import('@/components/Mandala');
    const out = renderToStaticMarkup(createElement(Mandala, {
      focus: 'IND',
      nodes: [{ iso: 'CHN', score: 68, eventCount: 12 }],
    } as never));
    expect(out).toContain('aria-label="China, tension 68.');
    expect(out).toContain('Open the India–China relationship."');
    // The drawn text stays the code — this is a naming change, not a layout one.
    expect(out).toContain('>CHN</text>');
  });
});
