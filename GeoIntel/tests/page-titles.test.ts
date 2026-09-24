import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * app/layout.tsx titles every page with the template '%s · Kautilya'. A page whose own title also
 * says "Kautilya" gets it twice — /ask shipped as "Ask · Kautilya · Kautilya" in the browser tab.
 */
function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pages(join(dir, e.name)) : e.name === 'page.tsx' ? [join(dir, e.name)] : []);
}

describe('page titles', () => {
  it('never repeat the site name the layout template already adds', () => {
    const layout = readFileSync('app/layout.tsx', 'utf8');
    expect(layout, 'the title template this test relies on').toContain("template: '%s · Kautilya'");
    const doubled = pages('app').filter((f) => /metadata\s*=\s*\{[^}]*title:\s*'[^']*Kautilya[^']*'/.test(readFileSync(f, 'utf8')));
    expect(doubled).toEqual([]);
  });
});
