import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KautilyaMark, KINGS } from '@/components/KautilyaMark';

/**
 * The mark is the Arthashastra's rajamandala: the would-be conqueror (vijigishu) at the
 * centre, eleven kings around him — twelve in all. Chosen by Josh on 2026-09-25 over the
 * old four-bar ladder, which read as a phone's signal icon.
 */
const circles = (svg: string) =>
  [...svg.matchAll(/<circle[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="([\d.]+)"/g)]
    .map(m => ({ cx: +m[1], cy: +m[2], r: +m[3] }));

function assertTwelveKings(svg: string) {
  const c = circles(svg);
  expect(c).toHaveLength(12);
  const [centre, ...ring] = c;
  expect(centre).toMatchObject({ cx: 32, cy: 32 });
  const radii = ring.map(p => Math.hypot(p.cx - 32, p.cy - 32));
  for (const d of radii) expect(d).toBeCloseTo(22, 1);
  // one king at the top, the rest evenly spaced — 360/11 degrees apart
  expect(ring[0]).toMatchObject({ cx: 32, cy: 10 });
  const angles = ring.map(p => Math.atan2(p.cy - 32, p.cx - 32));
  for (let i = 1; i < angles.length; i++) {
    const step = ((angles[i] - angles[i - 1] + 2 * Math.PI) % (2 * Math.PI)) * 180 / Math.PI;
    expect(step).toBeCloseTo(360 / 11, 0);
  }
}

describe('the Kautilya mark', () => {
  it('KINGS is eleven points on one ring, the first at the top', () => {
    expect(KINGS).toHaveLength(11);
  });

  it('renders the centre and eleven kings', () => {
    assertTwelveKings(renderToStaticMarkup(createElement(KautilyaMark, { size: 26 })));
  });

  it('the favicon is the same mark, not the old ladder', () => {
    const icon = readFileSync(join(process.cwd(), 'app/icon.svg'), 'utf8');
    expect(icon).not.toMatch(/<rect[^>]*height="48"/);
    assertTwelveKings(icon);
  });

  it('the splash draws the same twelve, staggered', () => {
    const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
    expect(page).toMatch(/KINGS\.map/);
    expect(page).not.toMatch(/splash-bar/);
  });
});
