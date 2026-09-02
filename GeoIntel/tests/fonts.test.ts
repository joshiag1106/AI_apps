import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The site's argument is that you should read a source in the language it was published
 * in. That fails if the reader's machine cannot draw the characters — and for most of this
 * app's life the Chinese face was whatever the operating system happened to supply, which
 * on Linux is frequently a fallback with the wrong regional glyph forms or no Han coverage.
 *
 * The face is bundled now. These guard the wiring, because a font that silently stops
 * being applied looks like nothing at all on the machine of whoever changed it.
 */
const css = readFileSync('app/globals.css', 'utf8');
const layout = readFileSync('app/layout.tsx', 'utf8');

describe('bundled Chinese typeface', () => {
  it('is applied to Chinese source text', () => {
    const zh = css.slice(css.indexOf('@utility zh-text'), css.indexOf('@utility zh-text') + 300);
    expect(zh).toContain('var(--font-zh)');
  });

  it('is reachable from the default stack too, not only the Chinese treatment', () => {
    // Chinese appears in headlines rendered with the ordinary body font as well.
    const sans = css.split('\n').find((l) => l.includes('--font-sans:')) ?? '';
    expect(sans).toContain('var(--font-zh)');
  });

  it('keeps the system faces behind it as a fallback', () => {
    // If the bundled face ever fails to load, the page must fall back to what it did
    // before rather than to something with no Han coverage.
    for (const line of [css.split('\n').find((l) => l.includes('--font-sans:')) ?? '',
      css.slice(css.indexOf('@utility zh-text'), css.indexOf('@utility zh-text') + 300)]) {
      expect(line).toContain('PingFang SC');
      expect(line).toContain('Microsoft YaHei');
    }
  });

  it('does not preload, because there are ~200 subsets', () => {
    // Preloading is for a small known set. Preloading two hundred files would flood the
    // connection to save nothing.
    expect(layout).toMatch(/preload:\s*false/);
  });

  it('is self-hosted rather than fetched from a third party at runtime', () => {
    expect(layout).toContain("from 'next/font/google'");
    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).not.toContain('fonts.gstatic.com');
  });
});
