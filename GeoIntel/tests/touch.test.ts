import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChineseCompact, chineseTitle } from '@/components/ChineseText';

/**
 * The dense one-line rows — the live feed, the ladder column of the dashboard table —
 * carried their romanisation in a `title` attribute, so it appeared on hover and stayed
 * compact. On a touch screen there is no hover: an iPad or a phone showed the Chinese and
 * nothing else, silently losing the feature on the devices most likely to be reading in
 * transit.
 *
 * So the romanisation is real text in the document now. It is visible on a narrow viewport
 * — where the horizontal scannability those rows were protecting is already gone — and
 * screen-reader-only on a wide one, where the tooltip does the visible work. That also
 * repairs an accessibility gap: `title` is famously unreliable for assistive technology
 * and unreachable by keyboard, and the text is now announced on every viewport.
 */
const html = (text: string, english?: string | null) =>
  renderToStaticMarkup(createElement(ChineseCompact, { text, english }));

describe('compact Chinese on touch devices', () => {
  it('puts the romanisation in the document, not only in a tooltip', () => {
    expect(html('严正交涉')).toContain('yán zhèng jiāo shè');
  });

  it('shows it on a narrow viewport and hides it visually on a wide one', () => {
    // not-sr-only is visible; sm:sr-only takes it back out of the visual flow above 640px,
    // where the title attribute is doing the work instead.
    const out = html('严正交涉');
    expect(out).toContain('not-sr-only');
    expect(out).toContain('sm:sr-only');
  });

  it('keeps the romanisation announced to screen readers on every viewport', () => {
    // sr-only, not hidden — a display:none romanisation would be lost to assistive tech
    // exactly where the tooltip is also useless to it.
    expect(html('严正交涉')).not.toContain('sm:hidden');
  });

  it('carries the English too when there is one', () => {
    expect(html('严正交涉', 'makes solemn representations'))
      .toContain('makes solemn representations');
  });

  it('renders plain text untouched, so callers need not check the language', () => {
    const out = html('Taiwan Strait patrol');
    expect(out).toContain('Taiwan Strait patrol');
    expect(out).not.toContain('not-sr-only');
  });

  it('still offers the tooltip string for the hover path', () => {
    expect(chineseTitle('严正交涉', 'makes solemn representations'))
      .toBe('yán zhèng jiāo shè — makes solemn representations');
  });
});
