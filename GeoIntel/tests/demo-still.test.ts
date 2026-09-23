// tests/demo-still.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The effects in these helpers cannot run in this suite (environment: 'node', no DOM), so what is
// pinned here is the wiring, as the next/link scan pins that rule: the helpers must read the stopped
// state, and must re-run when it changes. The behaviour itself was watched in a real browser.
const src = (f: string) => readFileSync(f, 'utf8');

describe('a scene entered while the tour is paused is fully still, not only its CSS beats', () => {
  it.each(['CountIn', 'TypeIn', 'DemoStar', 'PaletteMorph'])('%s reads the stopped state and re-runs when it changes', (name) => {
    const s = src(`components/demo/${name}.tsx`);
    expect(s, `${name} does not read useStill()`).toContain('useStill()');
    // Named in the dependency array, or pressing Play on a still scene would never start the motion.
    expect(s, `${name}'s effect does not depend on still`).toMatch(/\}, \[[^\]]*\bstill\b[^\]]*\]\);/);
  });

  it('the shell provides the state from stageFlags, around the scene', () => {
    expect(src('components/demo/DemoTour.tsx')).toMatch(/<StillContext\.Provider value=\{flags\.still\}>/);
  });

  it('defaults to false, so a scene rendered outside the shell (a test, the server) is animated as before', () => {
    expect(src('components/demo/StageState.tsx')).toMatch(/createContext\(false\)/);
  });
});
