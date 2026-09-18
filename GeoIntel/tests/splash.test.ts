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
