// tests/layout.test.ts
//
// Horizontal overflow on narrow viewports, and the one rule that prevents a whole class of it.
//
// WHAT THIS TEST CAN AND CANNOT DO. vitest runs with `environment: 'node'` and this repo has
// no jsdom, no happy-dom and no Playwright — nothing here computes layout. So this file
// cannot measure overflow; it pins the PRESENCE of the rule that fixes it. The measuring was
// done in a real browser at a real device viewport, and the numbers are recorded below so a
// future reader can re-run the same check rather than trust this comment.
//
// MEASURED 2026-09-18, Chrome, 393x852 (iPhone), device emulation on, against production:
//
//        route          client   scroll   overflow
//        /              393      799      406px
//        /dashboard     393      1313     920px
//        /china         393      665      272px
//        /methodology   393      470      77px    <- a DIFFERENT cause, not fixed by this rule
//        /events /ask /people    393      393     0
//
// Applying `.grid > * { min-width: 0 }` took /, /dashboard and /china to exactly 393 — zero
// overflow — and reverting it restored the overflow, which is what makes this causation
// rather than correlation.
//
// WHY IT HAPPENS, because the mechanism is not obvious and will be re-introduced otherwise:
// a grid item's `min-width` defaults to `auto`, which refuses to shrink the item below its
// content's MIN-CONTENT width. This app truncates headlines with Tailwind's `truncate`,
// which sets `white-space: nowrap`, and a nowrap Chinese headline has no break opportunities
// at all — so its min-content width is the whole string. The grid item therefore refuses to
// be narrower than an entire Chinese headline, the track grows to match, and every descendant
// inherits that width. The `truncate` never gets the chance to truncate.
//
// The codebase already knew this in two places — /person and /network declare
// `lg:grid-cols-[minmax(0,1fr)_360px]`, and `minmax(0,...)` is the same escape. That form
// only helps where the `lg:` prefix applies, so it does nothing at phone width, where the
// grid falls back to a single implicit auto track. `min-width: 0` on the items covers every
// breakpoint, which is why it is the rule and `minmax` is not.
//
// It also FIXED A DESKTOP BUG that had gone unnoticed: the home page declares
// `lg:grid-cols-[1.35fr_1fr]` but rendered 560.93px / 783.07px at 1440 — the ratio inverted,
// because the Live feed column's min-content floor overrode the declared fraction. With the
// rule it renders 772.08px / 571.92px, which is 1.35:1. /dashboard at 1440 was byte-identical
// before and after.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('narrow-viewport overflow', () => {
  const css = readFileSync('app/globals.css', 'utf8');

  it('gives grid items a min-width floor of zero, so truncating text can actually truncate', () => {
    // The mutant this catches: deleting the rule, which silently returns 400-900px of
    // horizontal scroll on three routes and inverts the home page's column ratio.
    const rule = /\.grid\s*>\s*\*\s*\{[^}]*min-width:\s*0/;
    expect(rule.test(css), 'app/globals.css must keep the `.grid > * { min-width: 0 }` rule').toBe(true);
  });

  it('keeps the explanation attached to the rule', () => {
    // Not pedantry. A bare `min-width: 0` reads like dead CSS and is exactly the kind of
    // line someone removes while tidying. The comment is what stops that.
    const at = css.search(/\.grid\s*>\s*\*\s*\{[^}]*min-width:\s*0/);
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(Math.max(0, at - 700), at), 'the rule needs a comment saying why it exists')
      .toMatch(/min-content|truncate|nowrap/i);
  });
});

describe('the escalation ladder table on /methodology', () => {
  // The one overflow the grid rule above does NOT fix, because its cause is different: a
  // flex ROW whose children have fixed widths and `flex-none`, inside a container narrower
  // than their sum. 20px + 160px + 208px + ~19px + three 12px gaps = 443px of children in a
  // 327px column, and with the default `flex-wrap: nowrap` they simply hang off the edge —
  // measured as 77px of page overflow at 393px, with the severity label's right edge at 470.
  //
  // Fixed by letting the row wrap, which is what /country already does for the same shape
  // (`flex flex-wrap items-baseline gap-3`). Wrapping costs nothing on a wide screen, where
  // the row fits on one line and the property never comes into play.
  const src = readFileSync('app/methodology/page.tsx', 'utf8');

  it('lets the rung row wrap instead of hanging off a narrow screen', () => {
    const row = src.match(/className="flex[^"]*items-baseline[^"]*"/);
    expect(row, '/methodology should still render the ladder rows as a baseline-aligned flex row').not.toBeNull();
    expect(row![0], 'the ladder row needs flex-wrap; its children are fixed-width and flex-none')
      .toMatch(/flex-wrap/);
  });
});

describe('legibility on a large screen', () => {
  // Both of these came from Josh reading the live site on a 3072x1920 Retina panel: wide
  // empty margins either side, and type too small to read comfortably.
  //
  // The type was never a deliberate choice. The accessibility pass covered headings, contrast
  // and ARIA and explicitly notes that what it fixed "is not font size", so nothing here is
  // being overturned — it was an unexamined default. Measured before the change: 282
  // hard-coded sizes, of which 167 (59%) were 11px or smaller, including 53 at 10px and 28 at
  // 10.5px. Browser default body text is 16px, so a third of the interface sat under
  // two-thirds of that.
  //
  // The uplift merged 13 ragged sizes into 8 integers and removed every half-pixel, none of
  // which anyone had chosen on purpose:
  //     9.5, 10 -> 12    11.5, 12 -> 14    13.5, 14 -> 16    17 -> 19
  //     10.5, 11 -> 13   12.5, 13 -> 15    15       -> 17    18 -> 20
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
  const sources = [...files('app'), ...files('components')];

  it('sets no type smaller than 12px anywhere', () => {
    // A guard on the guard: if the walk stops finding files the loop passes vacuously.
    expect(sources.length).toBeGreaterThanOrEqual(30);
    const tooSmall: string[] = [];
    for (const f of sources) {
      for (const m of readFileSync(f, 'utf8').matchAll(/text-\[([0-9.]+)px\]/g)) {
        if (parseFloat(m[1]) < 12) tooSmall.push(`${f}: ${m[0]}`);
      }
    }
    expect(tooSmall, `type below 12px is hard to read on a high-DPI screen:\n${tooSmall.join('\n')}`)
      .toEqual([]);
  });

  it('uses whole-pixel sizes, so the scale stays a scale', () => {
    const halves: string[] = [];
    for (const f of sources) {
      for (const m of readFileSync(f, 'utf8').matchAll(/text-\[([0-9.]+)px\]/g)) {
        if (!Number.isInteger(parseFloat(m[1]))) halves.push(`${f}: ${m[0]}`);
      }
    }
    expect(halves, `half-pixel type sizes, which nobody chose deliberately:\n${halves.join('\n')}`)
      .toEqual([]);
  });

  it('lets the shell use a wide screen instead of boxing it to 1400px', () => {
    // The prose caps (max-w-2xl/3xl/4xl, 23 of them) are separate and untouched, which is why
    // widening the shell does not stretch paragraphs into unreadable lines.
    const layout = readFileSync('app/layout.tsx', 'utf8');
    expect(layout).toMatch(/max-w-\[1760px\]/);
  });

  it('gives the header the SAME width as the page, everywhere it is set', () => {
    // This test is deliberately wider than the one above, because the narrow version passed
    // while the site was still visibly wrong. The shell width lives in THREE places — main
    // and the footer in app/layout.tsx, and the sticky header in components/Nav.tsx — and
    // only the first two were changed. The header stayed at 1400px, so the menu sat in a
    // narrower column than everything beneath it and the old margins were still there at the
    // top of every page. Checking one file could never have caught that; checking all of them
    // is the only version of this test that means anything.
    const stale: string[] = [];
    for (const f of sources) {
      const src = readFileSync(f, 'utf8');
      if (/max-w-\[1400px\]/.test(src)) stale.push(f);
    }
    expect(stale, `these still box content to the old 1400px shell:\n${stale.join('\n')}`)
      .toEqual([]);
  });
});

describe('the footer', () => {
  // A footer exists to be a map of the site, so a link in it that 404s is worse than no
  // footer at all — it is the one place a reader trusts to be complete. Next gives no
  // compile-time guarantee that an href matches a route, so this walks app/ for real
  // page.tsx files and checks every internal link in the layout against them.
  const routes = (dir: string, prefix = ''): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (!e.isDirectory()) return e.name === 'page.tsx' ? [prefix || '/'] : [];
      return routes(join(dir, e.name), `${prefix}/${e.name}`);
    });

  it('links only to routes that exist', () => {
    const real = new Set(routes('app'));
    // A guard on the guard: a broken walk would make the check below pass vacuously.
    expect(real.size).toBeGreaterThanOrEqual(16);

    const layout = readFileSync('app/layout.tsx', 'utf8');
    const footer = layout.slice(layout.indexOf('<footer'));
    const hrefs = [...footer.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]);
    expect(hrefs.length, 'the footer should link somewhere').toBeGreaterThan(5);

    const dead = hrefs.filter((h) => !real.has(h === '/' ? '/' : h.replace(/\/$/, '')));
    expect(dead, `footer links with no page.tsx behind them:\n${dead.join('\n')}`).toEqual([]);
  });
});

describe('reduced motion', () => {
  // A general safety net, not tied to one feature. Every class in this file that gives an
  // element a bare `animation:` outside a reduced-motion media block is a class that will
  // keep moving for someone who has asked the OS not to move things, unless it is ALSO named
  // inside one of those blocks. Nothing here enumerates classes by hand — the CSS is the
  // source of truth, and adding a new animated class without its override is exactly the
  // mistake this test exists to catch on the next one, not just the ones written so far.
  const css = readFileSync('app/globals.css', 'utf8');

  /**
   * Pulls out every `@media (prefers-reduced-motion: reduce) { ... }` block's contents by
   * counting brace depth, rather than a single indexOf/slice. globals.css has TWO such
   * blocks — one for `:where(*) { transition: none; }` from the very first accessibility
   * pass, one for the per-class animation overrides added since — and an indexOf that finds
   * only the first would silently exclude both the second block AND every class defined
   * after it from the check. That is not hypothetical: it is exactly the bug the first draft
   * of this test had, and it passed by finding nothing to check rather than by checking
   * anything — the same "guard on the guard" failure this file's other tests are written to
   * avoid.
   */
  function reducedMotionBlocksAndRest(source: string): { blocks: string; rest: string } {
    const needle = '@media (prefers-reduced-motion: reduce)';
    let blocks = '';
    let rest = '';
    let cursor = 0;
    for (let i = source.indexOf(needle); i !== -1; i = source.indexOf(needle, cursor)) {
      rest += source.slice(cursor, i);
      const open = source.indexOf('{', i);
      let depth = 1;
      let j = open + 1;
      for (; j < source.length && depth > 0; j++) {
        if (source[j] === '{') depth++;
        else if (source[j] === '}') depth--;
      }
      blocks += source.slice(open + 1, j - 1);
      cursor = j;
    }
    rest += source.slice(cursor);
    return { blocks, rest };
  }

  it('finds both reduced-motion blocks, not just the first', () => {
    // The guard on the guard above: if this ever finds only one, the real test below would
    // silently stop checking everything defined after the block it missed.
    const { blocks } = reducedMotionBlocksAndRest(css);
    expect(blocks).toMatch(/:where\(\*\)/);
    expect(blocks).toMatch(/\.pulse-ring/);
  });

  it('gives every animated class a reduced-motion override', () => {
    const { blocks: rm, rest: base } = reducedMotionBlocksAndRest(css);

    const animated = new Set<string>();
    for (const m of base.matchAll(/\.([a-zA-Z0-9_-]+)\s*\{[^}]*\banimation:/g)) animated.add(m[1]);

    const uncovered = [...animated].filter((cls) => !new RegExp(`\\.${cls}\\b`).test(rm));
    expect(uncovered, `these animated classes have no reduced-motion override:\n${uncovered.join('\n')}`)
      .toEqual([]);
  });
});
