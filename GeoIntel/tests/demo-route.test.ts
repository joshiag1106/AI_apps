// tests/demo-route.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

const layout = readFileSync('app/layout.tsx', 'utf8');
const splash = readFileSync('app/page.tsx', 'utf8');

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

describe('the /demo route', () => {
  it('exists, and is dynamic like the splash', () => {
    expect(existsSync('app/demo/page.tsx')).toBe(true);
    expect(readFileSync('app/demo/page.tsx', 'utf8')).toMatch(/export const dynamic = 'force-dynamic'/);
  });

  it('is chromeless like the splash — no nav, no footer', () => {
    expect(layout).toMatch(/chromeless\s*=[^;]*'\/demo'/);
    expect(layout).toMatch(/chromeless\s*=[^;]*'\/'/);
    expect(layout).not.toMatch(/\bisSplash\b/);
  });

  it('receives its pathname from middleware, which the layout reads', () => {
    const res = middleware(new NextRequest('https://x/demo', { headers: { cookie: 'kautilya_device=x' } }));
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/demo');
  });
});

describe('the demo code', () => {
  const tour = [...files('components/demo'), ...files('app/demo')].filter((f) => /\.tsx?$/.test(f));

  it('never imports next/link — a soft navigation out of a chromeless route keeps the chrome hidden', () => {
    expect(tour.length).toBeGreaterThan(10);
    for (const f of tour) expect(readFileSync(f, 'utf8'), f).not.toMatch(/from ['"]next\/link['"]/);
  });

  it('never hard-codes a colour, except the on-accent text the splash already uses', () => {
    for (const f of [...tour, ...files('lib/demo')]) {
      const hexes = readFileSync(f, 'utf8').match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      for (const h of hexes) expect(h.toLowerCase(), f).toBe('#0a0d13');
    }
  });

  it('never names a price in code', () => {
    for (const f of [...tour, ...files('lib/demo')]) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/₹|per month|\/month/);
    }
  });
});

describe('the splash demo button', () => {
  it('is a genuine link to /demo, not a router link and not a handler', () => {
    const at = splash.indexOf('href={`${BASE_PATH}/demo`}');
    expect(at, 'href={`${BASE_PATH}/demo`} not found in app/page.tsx').toBeGreaterThan(-1);
    expect(splash.slice(Math.max(0, at - 40), at + 20)).not.toMatch(/<Link\b/);
    // The attribute form: the file's own comments discuss onClick in prose.
    expect(splash).not.toMatch(/\bonClick\s*=/);
    expect(splash).not.toMatch(/^['"]use client['"]/m);
  });

  it('says what it is, and Enter stays the primary button', () => {
    expect(splash).toContain('Watch the 2-minute demo');
    const enter = splash.indexOf('href={`${BASE_PATH}/board`}');
    const demo = splash.indexOf('href={`${BASE_PATH}/demo`}');
    expect(enter).toBeGreaterThan(-1);
    expect(enter).toBeLessThan(demo);
    expect(splash.slice(enter, demo)).toContain('bg-[color:var(--color-accent)]');
  });
});
