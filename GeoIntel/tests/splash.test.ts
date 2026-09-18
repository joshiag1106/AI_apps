// tests/splash.test.ts
//
// The one-time front door at app/page.tsx, added 2026-09-18. / used to BE the Threat Board;
// that content moved to app/board/page.tsx (tests/layout.test.ts's route-existence checks
// cover the internal links that had to be repointed). This file is deliberately narrow: it
// pins the few things that make the splash a front door rather than a wall — that it always
// carries a working Enter link even with JavaScript off, and that a returning visitor is
// never shown it twice.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('the splash page', () => {
  const src = readFileSync('app/page.tsx', 'utf8');

  it('renders a real <Link> to /board, not a client-only onClick', () => {
    // The redirect-if-already-visited behaviour is progressive enhancement, layered on top
    // of an Enter control that is a genuine navigable link. A visitor with JavaScript off,
    // or the localStorage read blocked by a privacy mode, must still be able to get in.
    expect(src).toMatch(/<Link\s+href="\/board"/);
  });

  it('checks localStorage before paint, not after, and never blocks on it failing', () => {
    // Checking in a useEffect would paint the splash first and redirect a frame later — a
    // visible flash on every return visit. The palette selector solved the same class of
    // problem (app/layout.tsx) with a synchronous inline script that runs before hydration;
    // this follows the same shape rather than inventing a second one. try/catch is required
    // because localStorage throws outright in some privacy modes, and a returning reader in
    // one of those must still land on the splash rather than see a crashed page.
    expect(src).toMatch(/dangerouslySetInnerHTML/);
    expect(src).toMatch(/try\s*\{[^}]*localStorage/s);
    expect(src).toMatch(/catch/);
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

  it('writes the entered flag from a real Client Component mounted on /board, not from here', () => {
    // Moving the write off the Enter click and onto "did /board actually render" is not
    // just a workaround for the bug above — it is more correct. Anyone who reaches /board at
    // all, by a bookmark, a shared link or typing the URL, has now seen the dashboard and
    // should never be gated again, not only visitors who clicked Enter on this exact page.
    const board = readFileSync('app/board/page.tsx', 'utf8');
    expect(board).toMatch(/MarkEntered/);
    const marker = readFileSync('components/MarkEntered.tsx', 'utf8');
    expect(marker).toMatch(/^['"]use client['"]/m);
    expect(marker).toMatch(/kautilya-entered/);
    expect(marker).toMatch(/try/);
  });

  it('uses the same localStorage key to check (splash) and to set (board)', () => {
    const board = readFileSync('app/board/page.tsx', 'utf8') + readFileSync('components/MarkEntered.tsx', 'utf8');
    expect(src).toMatch(/kautilya-entered/);
    expect(board).toMatch(/kautilya-entered/);
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
    const m = css.match(/@keyframes\s+map-fade-in\s*\{[\s\S]*?\n\}/);
    expect(m, 'app/globals.css must define @keyframes map-fade-in').not.toBeNull();
    expect(m![0]).toMatch(/to\s*\{\s*opacity:\s*0\.22/);
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
    expect(m![0], 'reduced motion must rest the map at 0.22, not full opacity')
      .toMatch(/opacity:\s*0\.22/);
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
