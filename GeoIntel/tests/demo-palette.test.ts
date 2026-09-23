// tests/demo-palette.test.ts
import { describe, it, expect } from 'vitest';
import { swapPalette, type PaletteRoot } from '@/lib/demo/palette';

const root = (palette?: string): PaletteRoot => ({ dataset: palette ? { palette } : {} });

describe('swapPalette', () => {
  it('sets the palette and hands back a way to restore it', () => {
    const r = root();
    const restore = swapPalette(r, 'accessible');
    expect(r.dataset.palette).toBe('accessible');
    restore();
    expect('palette' in r.dataset).toBe(false);
  });

  it("restores the reader's own choice, not the default", () => {
    const r = root('monochrome');
    const restore = swapPalette(r, 'accessible');
    expect(r.dataset.palette).toBe('accessible');
    restore();
    expect(r.dataset.palette).toBe('monochrome');
  });

  it('can clear the palette to the default', () => {
    const r = root('monochrome');
    swapPalette(r, null);
    expect('palette' in r.dataset).toBe(false);
  });

  it('is safe to restore twice', () => {
    const r = root('monochrome');
    const restore = swapPalette(r, 'accessible');
    restore();
    restore();
    expect(r.dataset.palette).toBe('monochrome');
  });
});
