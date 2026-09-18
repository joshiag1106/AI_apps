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
import { readFileSync } from 'node:fs';

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
