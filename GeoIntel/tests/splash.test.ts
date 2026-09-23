// tests/splash.test.ts
//
// The front door at app/page.tsx, added 2026-09-18. / used to BE the Threat Board; that
// content moved to app/board/page.tsx (tests/layout.test.ts's route-existence checks cover
// the internal links that had to be repointed). This file is deliberately narrow: it pins
// the few things that make the splash a front door rather than a wall — that it always
// carries a working Enter link even with JavaScript off, and — reversed the same day, at
// Josh's explicit instruction, from an earlier version that skipped it for a returning
// visitor — that EVERY visit lands here, with no exception for having been before.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

describe('the splash page', () => {
  const src = readFileSync('app/page.tsx', 'utf8');

  it('links Enter to /board with a genuine href, not a JS-only handler', () => {
    // The redirect-if-already-visited behaviour is progressive enhancement, layered on top
    // of an Enter control that is a genuine navigable link. A visitor with JavaScript off,
    // or the localStorage read blocked by a privacy mode, must still be able to get in.
    expect(src).toMatch(/href="\/board"/);
  });

  /*
   * Reported 2026-09-18: clicking Enter landed on /board with no Nav and no footer — the
   * chrome that /board is supposed to have. Reproduced in a real browser: URL correctly
   * read /board, but document.querySelector('header'/'footer') both came back null.
   *
   * The cause is Next's App Router client-side router, not a caching problem. app/layout.tsx
   * decides `chromeless` by reading a per-request `x-pathname` header, which is only freshly
   * evaluated on a genuine server round-trip. But / and /board share the SAME root layout,
   * and Next's client-side navigation (what a <Link> click does) is specifically built to
   * REUSE a layout that is common to the from- and to-route rather than re-render it — that
   * is the whole point of the App Router's shared-layout model. So clicking Enter carried
   * the splash's chrome-suppressed layout state straight over to /board, and only a manual
   * reload fixed it for that visit. A typed URL, a bookmark, or a refresh were never
   * affected, because those are genuine server round-trips with fresh middleware and a
   * freshly evaluated root layout — confirmed by curling /board directly and by a hard
   * location.replace() in a real browser, both of which correctly showed the chrome.
   *
   * / and /demo are the only routes where chrome is ever suppressed, so the splash's Enter and
   * demo links are the ONLY transitions in the whole app that cross that boundary via a
   * client-side navigation.
   * Fixed by keeping it a plain, uninterpreted anchor — Next's Link component intercepts
   * clicks specifically to perform that soft, layout-reusing navigation; a bare <a> does
   * not, and the browser gives it an ordinary full page load instead, the same as typing
   * the URL. That closes the one vulnerable path without touching how the rest of the site
   * navigates.
   */
  it.each([
    ['/board', 'Enter'],
    ['/about', 'Why Kautilya'],
    ['/demo', 'Watch the demo'],
  ])('%s (%s) is a plain anchor, not next/link\'s <Link> — every link off the splash needs this', (href) => {
    // Not only the Enter button. / is the ONLY route where chrome is suppressed, so ANY
    // client-side navigation whose FROM route is / carries that suppressed layout state to
    // wherever it goes next — the Why Kautilya link to /about is exactly as exposed as the
    // Enter link to /board, and was fixed alongside it for the same reason.
    const at = src.indexOf(`href="${href}"`);
    expect(at, `href="${href}" not found in app/page.tsx`).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, at - 40), at + 20);
    expect(block, `the ${href} link must not be a <Link>, which soft-navigates and would keep the chrome suppressed`)
      .not.toMatch(/<Link\b/);
  });

  it('never redirects a returning visitor away from the splash — every visit lands here', () => {
    // The opposite of what this page shipped with on 2026-09-18: a pre-paint script that
    // read a 'kautilya-entered' localStorage flag and sent a returning visitor straight to
    // /board without ever painting this page. Removed the same day at Josh's explicit
    // instruction — every visit, first or hundredth, must land on the splash. Pinned here so
    // nobody reaches for that pattern again out of habit; components/MarkEntered.tsx, which
    // used to write the flag this would have checked, no longer exists at all.
    expect(src, 'no localStorage read of any kind belongs on this page any more')
      .not.toMatch(/localStorage/);
    expect(src, 'no pre-paint redirect script belongs on this page any more')
      .not.toMatch(/location\.replace/);
    expect(existsSync('components/MarkEntered.tsx'), 'MarkEntered had no purpose once nothing reads its flag')
      .toBe(false);
  });

  /*
   * The regression this pins: app/page.tsx has no 'use client' directive, so it is a Server
   * Component, and a Server Component cannot hand a function — an onClick, or any event
   * handler — to an element it renders, including <Link>. React can only serialize DATA
   * across that boundary, never a closure. The first version of this page did exactly that
   * (an inline onClick on the Enter link, to write the entered flag) and it built and typed
   * clean — tsc and `next build` do not render the tree, so neither one caught it — and then
   * 500'd on every real request once deployed. Caught by starting the actual production
   * server and curling `/`, the same "verify against a real build, not only the tests" rule
   * this project already holds itself to elsewhere.
   */
  it('never hands a Server Component event handler to Link', () => {
    expect(src, 'app/page.tsx must stay a Server Component — no "use client"').not.toMatch(/^['"]use client['"]/m);
    expect(src, 'a function prop on Link here would 500 every request, not fail to build')
      .not.toMatch(/<Link[^>]*onClick=/s);
  });

  it('never marks /board as "entered" any more — nothing should skip the splash', () => {
    // /board used to render <MarkEntered/>, whose only job was writing the flag the splash
    // read to redirect a returning visitor away from itself. With that redirect gone, a
    // component that only ever wrote to a key nobody reads is dead weight, not a workaround
    // left in for safety — removed alongside the check it existed to feed.
    const board = readFileSync('app/board/page.tsx', 'utf8');
    expect(board, 'MarkEntered must not be imported or rendered on /board any more')
      .not.toMatch(/MarkEntered/);
    expect(board, 'no localStorage write belongs on /board either')
      .not.toMatch(/localStorage/);
  });

  it('shows the real corpus, not placeholder numbers', () => {
    // A "some data" landing page is a weaker opener than a landing page that IS the live
    // product — corpusStats/countryRisks are the same functions the real Threat Board reads.
    expect(src).toMatch(/corpusStats/);
    expect(src).toMatch(/countryRisks|WorldMap/);
  });

  it('carries the mark', () => {
    expect(src).toMatch(/KautilyaMark/);
  });

  /*
   * Reported 2026-09-18: "lot of margins on both sides" of the map. Measured in a real
   * browser before touching any code: the SVG element itself was genuinely full-bleed
   * (left 0, right = viewport width, no CSS constraint anywhere) — but the drawn landmass
   * inside it only spanned x=20 to x=940 of a 0-1100 viewBox, a 2% gap on the left and a
   * 15% gap on the right. Not a layout bug at all; a canvas-size mismatch.
   *
   * worldShapes(width, height) and project(lon, lat, width, height) both default to
   * 960x400 when called with no arguments, and every other caller in the app (app/board's
   * own map) renders WorldMap at ITS default 960x400 too, so the two numbers always agreed
   * by accident of both being left at their defaults — this bug had no way to exist until
   * something first overrode WorldMap's size without also threading that size through to
   * the shape and marker calculations. The splash is that something: it renders WorldMap
   * at width={1100} height={520}, but called worldShapes() and project() with no arguments
   * at all, so the map's CONTENT was projected onto a 960x400 canvas and then dropped,
   * un-rescaled, into a 1100x520 viewBox — filling most but not all of the wider box,
   * exactly matching the measured gap.
   */
  it('projects the map onto the SAME size it is rendered at, not the 960x400 default', () => {
    expect(src, 'worldShapes() must be called with the same 1100x520 WorldMap is given')
      .toMatch(/worldShapes\(1100,\s*520\)/);
    expect(src, 'project() must be called with the same 1100x520 WorldMap is given')
      .toMatch(/project\(h\.lon,\s*h\.lat,\s*1100,\s*520\)/);
  });
});

describe('the moved Threat Board', () => {
  const src = readFileSync('app/board/page.tsx', 'utf8');

  it('kept its own metadata title after the move', () => {
    expect(src).toMatch(/title:\s*'Threat Board'/);
  });
});

describe("the splash's quiet map, and why it briefly looked like it was fading back out", () => {
  // Reported 2026-09-18: the map faded in, then immediately appeared to fade back OUT.
  //
  // The cause was two rules fighting over the same property. The map's wrapper carried
  // BOTH a static opacity-[0.22] utility (the "quieted" resting level) AND an animation
  // that keyframed opacity 0 -> 1 with no `forwards` fill-mode. While the animation is
  // running, the animated value wins over the static one — so the map visibly brightened
  // to FULL opacity, not 0.22. The instant the animation's active period ended, its effect
  // stopped applying (no `forwards` to hold the end state) and the element reverted to the
  // underlying cascade value: the static 0.22. That revert is a hard, instant snap DOWN in
  // brightness happening right after the fade UP — which reads exactly like "faded in, then
  // immediately faded back out", because visually it is a second, opposite fade with no
  // transition softening it.
  //
  // The same bug had a second face under prefers-reduced-motion: the override for this
  // class set opacity to 1 (full), so with Reduce Motion on the map would have sat at full
  // brightness PERMANENTLY — the opposite of quieted — rather than at rest at 0.22.
  const css = readFileSync('app/globals.css', 'utf8');
  const splashSrc = readFileSync('app/page.tsx', 'utf8');

  it('never puts a static opacity utility on the same element as its own fade animation', () => {
    // The regression itself: this exact conflict must not recur on the map wrapper.
    expect(splashSrc, 'a static opacity-[...] class fighting an opacity keyframe animation is the bug this test exists to catch')
      .not.toMatch(/splash-map-fade[^"]*opacity-\[/);
  });

  it("holds its animation's end state instead of snapping back to a default", () => {
    const m = css.match(/\.splash-map-fade\s*\{[^}]*\}/);
    expect(m, 'app/globals.css must define .splash-map-fade').not.toBeNull();
    // `forwards` alone or `both` (which includes forwards' hold-after-completion behaviour,
    // plus holding the pre-animation state during animation-delay — needed because this
    // element also has a delay before it starts) both satisfy "does not snap back".
    expect(m![0], 'without forwards (or both), the element reverts the instant the animation ends')
      .toMatch(/\b(forwards|both)\b/);
  });

  it('animates TO the quieted opacity, not to fully visible', () => {
    // [^}]* stops at the FIRST closing brace, which here is the inner `from { ... }` block's
    // own — the exact class of bug the reduced-motion test above already learned from once
    // today. This keyframe's outer brace is the one alone on its own line, so match up to
    // THAT rather than to any `}`.
    //
    // 0.5, not the original 0.22: Josh reported the map "still not much visible" even after
    // the snap-back was fixed. Measured why: every shape already carries a stroke
    // (var(--color-line), #1f2b3d — already a subtle border colour at FULL strength, used
    // everywhere else in the app at 100%) plus a risk-scaled fill that trends toward
    // near-black for a low-risk country. The wrapper's opacity dims BOTH together, so at
    // 0.22 even the outlines of an otherwise ordinary country were close to imperceptible
    // against the near-black background, not only the risk colouring.
    const m = css.match(/@keyframes\s+map-fade-in\s*\{[\s\S]*?\n\}/);
    expect(m, 'app/globals.css must define @keyframes map-fade-in').not.toBeNull();
    expect(m![0]).toMatch(/to\s*\{\s*opacity:\s*0\.5/);
  });

  it('rests at the quieted opacity under reduced motion too, not full brightness', () => {
    const { blocks } = (function reducedMotionBlocks(source: string) {
      const needle = '@media (prefers-reduced-motion: reduce)';
      let blocks = '';
      let cursor = 0;
      for (let i = source.indexOf(needle); i !== -1; i = source.indexOf(needle, cursor)) {
        const open = source.indexOf('{', i);
        let depth = 1, j = open + 1;
        for (; j < source.length && depth > 0; j++) {
          if (source[j] === '{') depth++; else if (source[j] === '}') depth--;
        }
        blocks += source.slice(open + 1, j - 1);
        cursor = j;
      }
      return { blocks };
    })(css);
    const m = blocks.match(/\.splash-map-fade\s*\{[^}]*\}/);
    expect(m, 'the reduced-motion override for .splash-map-fade is missing').not.toBeNull();
    expect(m![0], 'reduced motion must rest the map at the same 0.5 it animates to, not full opacity')
      .toMatch(/opacity:\s*0\.5/);
  });
});

describe('the splash names what it is and gives a reason to click Enter', () => {
  // Josh: mention geointelligence / threat and risk analysis, and a catchy line that makes
  // someone want to press Enter — the page had real value (live corpus stats) but nothing
  // that named the category or made the click feel urgent.
  const splashSrc = readFileSync('app/page.tsx', 'utf8');

  it('names the category — geopolitical intelligence, threat and risk analysis', () => {
    expect(splashSrc).toMatch(/geopolitical intelligence/i);
    expect(splashSrc).toMatch(/threat/i);
    expect(splashSrc).toMatch(/risk/i);
  });

  it('gives the Enter button a reason above it, distinct from the stats paragraph', () => {
    // Not just restating "5 languages, 990 events" again — a punchy, separate line whose
    // only job is to make clicking feel worth it.
    const enterAt = splashSrc.indexOf('href="/board"');
    expect(enterAt, 'Enter link not found').toBeGreaterThan(-1);
    const before = splashSrc.slice(0, enterAt);
    expect(before).toMatch(/headlines catch up/i);
  });
});
