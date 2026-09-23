// tests/demo-scenes-a.test.ts
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Beat, SceneFrame, beatStyle } from '@/components/demo/scenes/Beat';
import { BoardScene } from '@/components/demo/scenes/BoardScene';
import { RiskScene } from '@/components/demo/scenes/RiskScene';
import { NetworkScene } from '@/components/demo/scenes/NetworkScene';
import { selectNetwork, selectRisk } from '@/lib/demo/select';
import { nodeLabel } from '@/lib/graph/ego';
import { BOARD, richInput } from './fixtures/demo-fixtures';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
/** Every `--beat` delay a scene rendered, in document order: the scene's whole timeline. */
const beatsOf = (out: string) => [...out.matchAll(/--beat:(\d+)ms/g)].map((m) => Number(m[1]));

describe('Beat', () => {
  it('puts its place in the timeline in a custom property', () => {
    expect(beatStyle(300)).toEqual({ '--beat': '300ms' });
    expect(html(createElement(Beat, { at: 300, children: 'x' }))).toContain('--beat:300ms');
  });

  it('picks its animation by kind', () => {
    expect(html(createElement(Beat, { at: 0, children: 'x' }))).toContain('demo-beat');
    expect(html(createElement(Beat, { at: 0, kind: 'slide', children: 'x' }))).toContain('demo-slide');
    expect(html(createElement(Beat, { at: 0, kind: 'email', children: 'x' }))).toContain('demo-email');
  });

  it('passes a class through', () => {
    expect(html(createElement(Beat, { at: 0, className: 'mt-4', children: 'x' }))).toContain('mt-4');
  });

  it('SceneFrame centres its children', () => {
    expect(html(createElement(SceneFrame, { children: 'x' }))).toContain('items-center');
  });
});

describe('the board scene', () => {
  const out = html(createElement(BoardScene, { data: BOARD }));

  it('draws the real risk map and the four headline numbers', () => {
    expect(out).toContain('World risk map');
    for (const label of ['Reports', 'Countries', 'Languages', 'Events']) expect(out).toContain(label);
  });

  it('shows the finished numbers when nothing animates', () => {
    expect(out).toContain('1,000');
    expect(out).toContain('300');
  });

  it('staggers the stats after the map', () => {
    expect(out).toContain('--beat:0ms');
    expect(out).toContain('--beat:1200ms');
  });
});

describe('the risk scene', () => {
  const data = selectRisk(richInput())!;
  const out = html(createElement(RiskScene, { data }));

  it('names the state and draws its six-vector radar', () => {
    expect(out).toContain('China');
    expect(out).toContain('Risk vectors, each scored 0 to 100: Military 50, Economic 40, Cyber 30, Internal 20, Diplomatic 60, Energy 10.');
  });

  it('shows the composite score', () => {
    expect(out).toContain('Composite score');
    expect(out).toContain('>60<');
  });

  it('lets the radar shrink to a phone instead of holding it at its fixed size', () => {
    expect(out).toContain('max-w-full');
    expect(out).toMatch(/_svg\]:max-w-full/); // the rule that reaches the radar's own svg, not just the panel
  });

  // Exactly the heading and the score are beat-timed. The radar panel is in neither, and any Beat
  // wrapped around it, whatever its delay or kind, would add a third entry and fail this.
  it('does not fade the radar in, so its own scale-out is seen from the first frame', () => {
    expect(beatsOf(out)).toEqual([0, 1500]);
  });

  // Radar puts its axis labels at 1.26 x (size/2 - 34) from the centre, which passes size/2 once
  // size is above ~329 — at 340 the MILI and INTE labels sat outside the viewBox and the svg clipped
  // them at every width, phone and desktop alike (seen in Chrome, 2026-09-20).
  it('keeps all six axis labels inside the radar viewBox, glyph height included', () => {
    const size = Number(out.match(/<svg width="(\d+)"/)?.[1]);
    expect(size).toBeGreaterThan(0);
    const ys = [...out.matchAll(/<text[^>]*\sy="([-\d.]+)"/g)].map((m) => Number(m[1]));
    const xs = [...out.matchAll(/<text[^>]*\sx="([-\d.]+)"/g)].map((m) => Number(m[1]));
    expect(ys).toHaveLength(6);
    const half = 5; // half of the 9px label, so a centred glyph is wholly inside
    for (const y of ys) { expect(y).toBeGreaterThanOrEqual(half); expect(y).toBeLessThanOrEqual(size - half); }
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(size); }
  });
});

describe('the network scene', () => {
  const data = selectNetwork(richInput())!;
  const out = html(createElement(NetworkScene, { data }));

  it('says it is a walk, and draws the graph', () => {
    expect(out).toContain('A walk through the network');
    expect(out).toContain('<svg');
  });

  it('names the two ends of the walk', () => {
    expect(out).toContain(`${nodeLabel(data.from)} → ${nodeLabel(data.to)}`);
  });

  it('lights the edge just walked', () => {
    expect(out).toContain('edge-traveled');
  });

  // Only the heading is beat-timed; a Beat of any delay or kind around the graph would add an entry.
  it('does not fade the graph in, so the walked edge is seen from the first frame', () => {
    expect(beatsOf(out)).toEqual([0]);
  });
});
