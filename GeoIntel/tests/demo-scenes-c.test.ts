// tests/demo-scenes-c.test.ts
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AskScene } from '@/components/demo/scenes/AskScene';
import { YoursScene } from '@/components/demo/scenes/YoursScene';
import { CloseScene } from '@/components/demo/scenes/CloseScene';
import { renderScene, isInteractive } from '@/components/demo/scenes';
import { closingFor } from '@/lib/demo/claims';
import { meta } from '@/lib/demo/chapters';
import { buildDemoScript } from '@/lib/demo/script';
import { CHAPTER_IDS } from '@/lib/demo/types';
import { fallbacks, richInput } from './fixtures/demo-fixtures';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('the ask scene', () => {
  const data = {
    question: 'what is happening between China and Japan?',
    readAs: [{ label: 'Actors', value: 'China, Japan' }, { label: 'Window', value: 'all time' }],
    headline: '12 events name both China and Japan.',
    figures: [{ label: 'Events', value: '12', sub: 'in the corpus' }],
  };
  const out = html(createElement(AskScene, { data }));

  it('shows the question, how it was read, and the answer', () => {
    expect(out).toContain('what is happening between China and Japan?');
    expect(out).toContain('Actors: China, Japan');
    expect(out).toContain('Window: all time');
    expect(out).toContain('12 events name both China and Japan.');
    expect(out).toContain('in the corpus');
  });

  it('shows the reading of the question BEFORE the answer', () => {
    expect(out.indexOf('Actors: China, Japan')).toBeLessThan(out.indexOf('12 events name both'));
  });

  // The reading must not appear while the question is still typing. A pair such as "United Arab
  // Emirates" and another 20-character name types for ~3180 ms, so a fixed 3200 ms reading beat left a
  // 20 ms margin that a run of chained 40 ms timers can eat.
  describe('timing against the typing', () => {
    const beatsFor = (question: string) =>
      [...html(createElement(AskScene, { data: { ...data, question } })).matchAll(/--beat:(\d+)ms/g)].map((m) => Number(m[1]));

    it('keeps the fixed 3200 / 4200 / 5200 beats for an ordinary question', () => {
      expect(beatsFor('what is happening between China and Japan?')).toEqual([0, 3200, 4200, 5200]);
    });

    it('holds the reading back until the longest question has finished typing, with a margin', () => {
      const [, reading, answer, figures] = beatsFor('x'.repeat(72));
      expect(reading).toBeGreaterThanOrEqual(300 + 72 * 40 + 400);
      expect(answer - reading).toBe(1000);
      expect(figures - reading).toBe(2000);
    });

    it('still finishes inside the chapter for a very long question', () => {
      const figures = beatsFor('x'.repeat(120))[3];
      expect(figures).toBeLessThan(meta('ask').seconds * 1000 - 1000);
    });
  });
});

describe('the "make it yours" scene', () => {
  const alert = fallbacks().alert;
  const out = html(createElement(YoursScene, { data: { ...alert, exportChip: null } }));

  it('shows the watched file, the real email, and the export control', () => {
    expect(out).toContain('Watch Japan');
    expect(out).toContain('CAPTURED Japan moved to rung 4');
    expect(out).toContain('CAPTURED body');
    expect(out).toContain('Export · CSV · JSON');
  });

  it('shows the palette as the site\'s own tokens, so the swap recolours them', () => {
    for (const t of ['low', 'guarded', 'elevated', 'high', 'severe']) expect(out).toContain(`var(--color-${t})`);
  });

  // The swatches are the reader's live tokens, and the swap that makes them colour-blind-safe is a
  // timer — skipped under reduced motion and absent without JavaScript. Those readers see their own
  // ramp under the label, so the label invites the choice instead of describing the colours on screen.
  it('invites the choice rather than claiming the swatches on screen are the safe ramp', () => {
    expect(out).toContain('Choose a colour-blind-safe palette');
  });

  // renderDigest writes the event link as one unbroken token; at 375px it ran past the panel and the
  // tail of the URL was cut off (watched in Chrome, 2026-09-20).
  it('lets the digest\'s long event link break, so the email fits a phone', () => {
    const pre = out.match(/<pre[^>]*class="([^"]*)"/)?.[1] ?? '';
    expect(pre).toContain('break-words');
  });

  it('names no plan of its own — the chip lives in the shell, derived from the billing state', () => {
    expect(out).not.toContain('Desk');
  });

  it('carries an export chip only when one is given', () => {
    const chipped = html(createElement(YoursScene, { data: { ...alert, exportChip: 'Desk' } }));
    expect(chipped).toContain('Desk');
  });

  it('slides the email in after the star, and the palette last', () => {
    const beats = [...out.matchAll(/--beat:(\d+)ms/g)].map((m) => Number(m[1]));
    expect(beats).toEqual(expect.arrayContaining([0, 1800, 5200, 7000]));
    expect(out).toContain('demo-email');
  });
});

describe('the closing scene', () => {
  const data = closingFor({ enforced: false, mode: 'stripe', freeLimit: 5 });
  const out = html(createElement(CloseScene, { data }));

  it('says what the billing state lets it say', () => {
    expect(out).toContain('open while Kautilya is in preview');
  });

  it('offers real links as plain anchors, because a soft navigation out of /demo would keep the chrome hidden', () => {
    expect(out).toContain('<a href="/kautilya/board"');
    expect(out).toContain('<a href="/kautilya/pricing"');
    expect(out).not.toContain('data-nextjs');
  });

  it('offers only Enter while plans cannot be bought', () => {
    const closed = html(createElement(CloseScene, { data: closingFor({ enforced: false, mode: 'closed', freeLimit: 5 }) }));
    expect(closed).toContain('href="/kautilya/board"');
    expect(closed).not.toContain('href="/kautilya/pricing"');
  });
});

describe('the scene registry', () => {
  const script = buildDemoScript(richInput(), fallbacks());

  it('renders every chapter of a full tour to non-empty markup', () => {
    expect(script.chapters.map((c) => c.id)).toEqual([...CHAPTER_IDS]);
    for (const c of script.chapters) {
      const out = html(createElement('div', null, renderScene(c)));
      expect(out.length, c.id).toBeGreaterThan(40);
      expect(out, c.id).toContain('--beat:');
    }
  });

  it('makes only the closing chapter interactive', () => {
    for (const id of CHAPTER_IDS) expect(isInteractive(id), id).toBe(id === 'close');
  });
});
