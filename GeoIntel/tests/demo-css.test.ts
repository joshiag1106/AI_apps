// tests/demo-css.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('app/globals.css', 'utf8');
const animated = [...css.matchAll(/\.(demo-[a-z-]+)\s*\{[^}]*\banimation\s*:/g)].map((m) => m[1]);
const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)]
  .map((m) => m[1]).join('\n');

describe('the demo tour styles', () => {
  it('animate the four beat kinds', () => {
    expect(animated.sort()).toEqual(['demo-beat', 'demo-email', 'demo-mark', 'demo-slide']);
  });

  it('give every animated .demo-* rule a reduced-motion twin', () => {
    for (const c of animated) expect(reduced, `.${c} has no reduced-motion rule`).toContain(`.${c}`);
  });

  it('turn the animation OFF under reduced motion, resting each element in its final state', () => {
    const twin = reduced.match(/\.demo-beat[^{]*\{([^}]*)\}/)?.[1] ?? '';
    expect(twin).toMatch(/animation:\s*none/);
    expect(twin).toMatch(/opacity:\s*1/);
  });

  it('freezes CSS motion while the tour is paused', () => {
    expect(css).toMatch(/\.demo-stage\[data-paused="true"\]\s*\*\s*\{[^}]*animation-play-state:\s*paused/);
  });

  // A scene mounted while the stage is frozen would sit at its `from` keyframe, opacity 0. So a scene
  // entered while paused (data-still) is forced to its finished state, exactly as reduced motion does.
  it('shows a scene entered while paused in its finished state, for all four beat kinds', () => {
    const rule = css.match(/\.demo-stage\[data-still="true"\][^{]*\{([^}]*)\}/);
    expect(rule, 'no .demo-stage[data-still="true"] rule').not.toBeNull();
    const [selector, body] = [rule![0].slice(0, rule![0].indexOf('{')), rule![1]];
    for (const c of ['demo-beat', 'demo-slide', 'demo-email', 'demo-mark']) expect(selector, c).toContain(`.${c}`);
    expect(body).toMatch(/animation:\s*none/);
    expect(body).toMatch(/opacity:\s*1/);
    expect(body).toMatch(/transform:\s*none/);
  });

  // The flashpoint rings loop forever and are not `.demo-*`, so the rule above does not reach them: a
  // paused tour would keep pulsing. They are paused in place, NOT forced to a final state (a looping
  // ring has none), and the still rule stays targeted: a blanket pause under data-still would freeze
  // the entry animations at opacity 0 and bring the blank stage back.
  it('pauses the flashpoint pulses on a scene entered while paused, without a blanket freeze', () => {
    const rule = css.match(/\.demo-stage\[data-still="true"\]\s+\.pulse-ring\s*\{([^}]*)\}/);
    expect(rule, 'no .demo-stage[data-still="true"] .pulse-ring rule').not.toBeNull();
    expect(rule![1]).toMatch(/animation-play-state:\s*paused/);
    expect(css).not.toMatch(/\.demo-stage\[data-still="true"\]\s*\*\s*\{/);
  });

  it('takes every beat delay from --beat, so a scene can be re-timed from data', () => {
    for (const c of animated) {
      const rule = css.match(new RegExp(`\\.${c}\\s*\\{[^}]*\\}`))?.[0] ?? '';
      expect(rule, c).toContain('var(--beat');
    }
  });
});
