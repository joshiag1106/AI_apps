import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavMenuCloser } from '@/components/NavMenuCloser';

/**
 * Measured 2026-09-23 at 375px: the sticky header took 171px of an 812px phone screen — a fifth of
 * it, on every page — because twelve links wrapped onto three rows under the wordmark and search.
 * Below `md` the links now sit behind one "Menu" button; at `md` and up nothing changes.
 */
describe('the header on a phone', () => {
  const nav = readFileSync('components/Nav.tsx', 'utf8');
  const phone = nav.slice(nav.indexOf('<details'), nav.indexOf('</details>'));
  const afterPhone = nav.slice(nav.indexOf('</details>'));
  const desktop = afterPhone.slice(afterPhone.indexOf('<nav'), afterPhone.indexOf('</nav>'));

  it('hides the inline links below md, and shows them from md up', () => {
    expect(desktop).toMatch(/className="[^"]*\bhidden\b[^"]*\bmd:flex\b/);
  });

  it('puts the same links behind a Menu that only exists below md', () => {
    expect(phone, 'no <details> menu in components/Nav.tsx').not.toBe('');
    expect(phone).toMatch(/<details[^>]*className="[^"]*\bmd:hidden\b/);
    expect(phone).toMatch(/<summary[^>]*>\s*Menu\s*<\/summary>/);
    expect(phone).toContain('LINKS.map');
  });

  it('is a native <details>, so it opens with JavaScript off', () => {
    // A button driven by state would leave a phone with scripts disabled no way to any page.
    expect(phone).not.toMatch(/onClick/);
  });

  it('closes itself after a navigation, which the persistent root layout would not', () => {
    expect(phone).toContain('<NavMenuCloser');
    expect(renderToStaticMarkup(createElement(NavMenuCloser))).toBe('<span hidden=""></span>');
  });
});
