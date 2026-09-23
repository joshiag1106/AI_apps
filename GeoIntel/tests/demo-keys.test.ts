// tests/demo-keys.test.ts
import { describe, it, expect } from 'vitest';
import { keyResult, type KeyInput } from '@/lib/demo/keys';

const k = (key: string, p: Partial<KeyInput> = {}): KeyInput =>
  ({ key, repeat: false, metaKey: false, ctrlKey: false, altKey: false, ...p });
const LAST = 10;

describe('the tour keymap', () => {
  it.each([
    ['ArrowRight', { type: 'next' }],
    ['ArrowLeft', { type: 'prev' }],
    ['Home', { type: 'goto', index: 0 }],
    ['End', { type: 'goto', index: LAST }],
    [' ', { type: 'toggle' }],
  ])('%s maps to its action', (key, action) => {
    expect(keyResult(k(key), LAST)).toEqual({ action });
  });

  it('Escape leaves the tour, and other keys are none of its business', () => {
    expect(keyResult(k('Escape'), LAST)).toEqual({ exit: true });
    expect(keyResult(k('a'), LAST)).toBeNull();
    expect(keyResult(k('Tab'), LAST)).toBeNull();
  });

  it('leaves browser and OS shortcuts alone', () => {
    for (const mod of ['metaKey', 'ctrlKey', 'altKey'] as const) {
      expect(keyResult(k('ArrowRight', { [mod]: true }), LAST), mod).toBeNull();
      expect(keyResult(k(' ', { [mod]: true }), LAST), mod).toBeNull();
    }
  });

  it('a held Space toggles once, not once per repeat: holding it would flicker pause and play', () => {
    expect(keyResult(k(' ', { repeat: true }), LAST)).toBeNull();
  });

  it('leaves Space to a focused control, where it activates the control', () => {
    for (const tag of ['BUTTON', 'A', 'SUMMARY', 'INPUT', 'TEXTAREA', 'SELECT']) {
      expect(keyResult(k(' ', { tag }), LAST), tag).toBeNull();
    }
    expect(keyResult(k(' ', { editable: true }), LAST)).toBeNull();
  });

  it("still moves between chapters when the tour's own button has focus: → right after clicking 'Next chapter' must work", () => {
    for (const tag of ['BUTTON', 'A', 'SUMMARY']) {
      expect(keyResult(k('ArrowRight', { tag }), LAST), tag).toEqual({ action: { type: 'next' } });
    }
  });

  it('does not move chapters while someone is typing', () => {
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) expect(keyResult(k(key, { tag }), LAST), `${key} in ${tag}`).toBeNull();
      expect(keyResult(k(key, { editable: true }), LAST), `${key} in an editable`).toBeNull();
    }
  });
});
