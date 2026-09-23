// tests/demo-helpers.test.ts
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CountIn, countAt } from '@/components/demo/CountIn';
import { TypeIn } from '@/components/demo/TypeIn';
import { DemoStar } from '@/components/demo/DemoStar';
import { PaletteMorph } from '@/components/demo/PaletteMorph';

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('the timed-beat helpers render their FINAL state on the server', () => {
  it('CountIn shows the finished number, formatted the same on every machine', () => {
    expect(render(createElement(CountIn, { value: 8381 }))).toBe('8,381');
  });

  it('CountIn takes a custom format', () => {
    expect(render(createElement(CountIn, { value: 7, format: (n: number) => `${n} events` }))).toBe('7 events');
  });

  it('TypeIn shows the whole question', () => {
    expect(render(createElement(TypeIn, { text: 'what is happening between China and Japan?' })))
      .toContain('what is happening between China and Japan?');
  });

  it('DemoStar starts unlit, so its pop is a real change of state', () => {
    expect(render(createElement(DemoStar, {}))).toContain('☆');
  });

  it('PaletteMorph draws nothing', () => {
    expect(render(createElement(PaletteMorph, { atMs: 100, backMs: 200 }))).toBe('');
  });
});

describe('countAt', () => {
  it('starts at zero', () => {
    expect(countAt(0, 8381)).toBe(0);
  });

  it('lands exactly on the value at t = 1', () => {
    expect(countAt(1, 8381)).toBe(8381);
  });

  it('never goes negative when the frame clock is behind the start (t < 0)', () => {
    // A requestAnimationFrame timestamp can precede the performance.now() taken when the timer fired.
    // Without the clamp, (1 - (-0.3)) ** 3 > 1 and the count goes negative for a frame.
    expect(countAt(-0.3, 8381)).toBe(0);
    expect(countAt(-0.3, 8381)).toBeGreaterThanOrEqual(0);
  });

  it('holds at the value past the end (t > 1)', () => {
    expect(countAt(1.4, 8381)).toBe(8381);
  });

  it('treats NaN as the start', () => {
    expect(countAt(Number.NaN, 8381)).toBe(0);
  });

  it('never counts backwards', () => {
    let previous = -Infinity;
    for (let i = 0; i <= 10; i += 1) {
      const n = countAt(i / 10, 8381);
      expect(n).toBeGreaterThanOrEqual(previous);
      previous = n;
    }
  });

  it('lands exactly on a non-integer value', () => {
    expect(countAt(1, 12.6)).toBe(12.6);
  });
});
