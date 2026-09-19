import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The fold cannot be exercised without a DOM, and this project's tests run in node, so these
 * pin the properties that keep it safe; tests/evidence-family.test.ts pins the resting
 * markup, and the behaviour itself is checked in a real browser.
 */
const src = readFileSync('components/RevealOnView.tsx', 'utf8');

describe('the fold surface of RevealOnView', () => {
  it('exists, with a named duration', () => {
    expect(src).toContain('details[data-reveal-fold]');
    expect(src).toMatch(/const FOLD_MS = \d+/);
  });

  it('is only reached after the reduced-motion early return', () => {
    // Under prefers-reduced-motion nothing may animate, and the details must simply rest closed.
    // Compare against the CALL that looks the folds up, not the first mention of the selector:
    // the doc comment names it too, and sits above the whole function.
    const guard = src.indexOf('prefers-reduced-motion');
    const use = src.indexOf("querySelectorAll<HTMLDetailsElement>('details[data-reveal-fold]')");
    expect(guard).toBeGreaterThan(-1);
    expect(use, 'the hook must look the folds up').toBeGreaterThan(-1);
    expect(guard).toBeLessThan(use);
  });

  it('starts from open and ends closed, never the other way round', () => {
    // Starting open can only ever reveal content; starting closed and opening would hide it
    // from anyone whose script did not run.
    expect(src).toMatch(/d\.open = true/);
    expect(src).toMatch(/d\.open = false/);
  });

  it('counts folds when deciding whether there is anything to observe', () => {
    expect(src).toMatch(/!folds\.length/);
  });
});
