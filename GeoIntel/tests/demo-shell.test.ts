// tests/demo-shell.test.ts
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoTour, type TourChapter } from '@/components/demo/DemoTour';

const ch = (id: string, over: Partial<TourChapter> = {}): TourChapter => ({
  id, title: `Title ${id}`, caption: `Caption ${id}`, seconds: 10, badge: `Badge ${id}`,
  chip: null, interactive: false, scene: createElement('div', null, `SCENE-${id}`), ...over,
});
const three = [ch('a'), ch('b', { chip: 'Desk Pro' }), ch('c', { interactive: true })];
const html = (chapters: TourChapter[]) => renderToStaticMarkup(createElement(DemoTour, { chapters }));

describe('the tour shell, as first rendered', () => {
  const out = html(three);

  it('shows only the current chapter’s scene', () => {
    expect(out).toContain('SCENE-a');
    expect(out).not.toContain('SCENE-b');
    expect(out).not.toContain('SCENE-c');
  });

  it('shows the title, the caption and where the example came from', () => {
    expect(out).toContain('Title a');
    expect(out).toContain('Caption a');
    expect(out).toContain('Badge a');
  });

  // Two different things are "paused" here, and they must not be confused. The CLOCK opens paused
  // (the button reads Play), so a reduced-motion or no-JavaScript visitor is never moved on to chapter
  // 2. The STAGE, though, must not be CSS-frozen before hydration: app/globals.css freezes every
  // `.demo-beat` (declared `animation: … both`) at its `from` keyframe, opacity 0, whenever
  // `.demo-stage[data-paused="true"]`. A visitor without JavaScript would then see a blank stage,
  // and no script ever arrives to unfreeze it. So `data-paused` only takes effect after mount. The
  // same goes for `data-still`, which forces every beat to its finished state: before hydration the
  // beats are left to run, so neither flag may be set on the first render.
  it('opens with the clock paused but the stage neither frozen nor forced still, so a no-JavaScript visitor sees chapter 1 rather than a blank stage', () => {
    expect(out).toContain('aria-label="Play"');
    expect(out).toContain('data-paused="false"');
    expect(out).toContain('data-still="false"');
    expect(out).not.toContain('data-paused="true"');
    expect(out).not.toContain('data-still="true"');
  });

  it('makes the stage inert while an animation plays, so no link or focus stop hides inside it', () => {
    expect(out).toMatch(/class="demo-stage[^"]*"[^>]*\binert=""/);
  });

  it('leaves the stage interactive on the closing chapter', () => {
    expect(html([ch('close', { interactive: true })])).not.toMatch(/\binert=""/);
  });

  it('labels every control', () => {
    for (const label of ['Previous chapter', 'Next chapter', 'Replay chapter']) {
      expect(out).toContain(`aria-label="${label}"`);
    }
  });

  it('has one named button per chapter, marking the current one', () => {
    for (const c of three) expect(out).toContain(`aria-label="${c.title}"`);
    expect(out.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it('closes with a plain anchor to the splash', () => {
    expect(out).toContain('<a href="/"');
  });

  it('shows the plan chip when the chapter has one', () => {
    expect(html([three[1]])).toContain('Desk Pro');
    expect(out).not.toContain('Desk Pro');
  });

  it('carries the whole tour as text, always in the page', () => {
    expect(out).toContain('<details');
    for (const c of three) {
      expect(out).toContain(c.title);
      expect(out).toContain(c.caption);
      expect(out).toContain(c.badge);
    }
    expect(out).toContain('Caption b');
  });
});
