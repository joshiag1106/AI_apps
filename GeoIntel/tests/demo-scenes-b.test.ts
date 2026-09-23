// tests/demo-scenes-b.test.ts
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageScene, pinyinStep, PINYIN_MS } from '@/components/demo/scenes/LanguageScene';
import { LadderScene } from '@/components/demo/scenes/LadderScene';
import { TrailScene } from '@/components/demo/scenes/TrailScene';
import { EventScene } from '@/components/demo/scenes/EventScene';
import { DyadScene } from '@/components/demo/scenes/DyadScene';
import { toPinyin } from '@/lib/lang/pinyin';
import { fallbacks } from './fixtures/demo-fixtures';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

/** Every `--beat` delay a scene rendered, in document order: the scene's whole timeline. */
const beatsOf = (out: string) => [...out.matchAll(/--beat:(\d+)ms/g)].map((m) => Number(m[1]));

const LANG = {
  headline: '中方已向日方提出严正交涉，强烈抗议', outlet: 'Xinhua', date: '2026-09-10',
  rung: 4, ladderZh: '严正交涉', ladderEn: 'makes solemn representations',
};

describe('the language scene', () => {
  const out = html(createElement(LanguageScene, { data: LANG }));

  it('shows the headline in Chinese with the formula highlighted inside it', () => {
    expect(out).toContain('中方已向日方提出');
    expect(out).toMatch(/<mark class="demo-mark[^"]*"[^>]*>严正交涉<\/mark>/);
    expect(out).toContain('，强烈抗议');
  });

  it('reveals the pinyin one syllable at a time, marked as romanised Chinese', () => {
    expect(out).toContain('lang="zh-Latn"');
    const syllables = toPinyin(LANG.headline).split(' ').filter(Boolean);
    expect(syllables.length).toBeGreaterThan(8);
    for (const s of syllables.slice(0, 3)) expect(out).toContain(`>${s}</span>`);
  });

  it('resolves the formula to its curated English meaning and its rung', () => {
    expect(out).toContain('makes solemn representations');
    expect(out).toContain('of 13');
  });

  it('names where the example came from', () => {
    expect(out).toContain('Xinhua');
    expect(out).toContain('2026-09-10');
  });

  it('does not highlight a formula that is not in the headline — it would be a lie', () => {
    const bad = html(createElement(LanguageScene, { data: { ...LANG, ladderZh: '强烈谴责' } }));
    expect(bad).not.toContain('<mark');
  });
});

describe('the pinyin reveal timing', () => {
  it('never lets the reveal run past its budget, however long the headline', () => {
    for (const n of [1, 5, 12, 40, 60, 100, 400]) {
      expect((n - 1) * pinyinStep(n)).toBeLessThanOrEqual(PINYIN_MS);
    }
  });

  it('caps a short headline at 90 ms a syllable so it does not crawl', () => {
    expect(pinyinStep(3)).toBe(90);
    expect(pinyinStep(0)).toBe(90);
  });

  // pinyinStep is only half of it: the scene has to USE it, and the highlight (4900) and the meaning
  // (5800) are hard-coded, so they are safe only while the last syllable lands before them.
  describe('as the scene lays it out', () => {
    const timeline = (headline: string) => {
      const out = html(createElement(LanguageScene, { data: { ...LANG, headline } }));
      const syllables = [...out.matchAll(/<span class="demo-beat" style="--beat:(\d+)ms">/g)].map((m) => Number(m[1]));
      const mark = Number(out.match(/<mark class="demo-mark"[^>]*--beat:(\d+)ms/)?.[1]);
      const meaning = Math.max(...[...out.matchAll(/--beat:(\d+)ms/g)].map((m) => Number(m[1])));
      return { syllables, mark, meaning, count: toPinyin(headline).split(' ').filter(Boolean).length };
    };

    it('staggers the syllables by the step, starting at 1000 ms', () => {
      const { syllables, count } = timeline(LANG.headline);
      expect(syllables).toHaveLength(count);
      syllables.forEach((at, i) => expect(at).toBe(1000 + i * pinyinStep(count)));
    });

    it.each([['an ordinary headline', LANG.headline], ['a very long one', LANG.headline.repeat(6)]])(
      'finishes the syllables before the highlight, and the highlight before the meaning: %s',
      (_label, headline) => {
        const { syllables, mark, meaning } = timeline(headline);
        expect(Math.max(...syllables)).toBeLessThan(mark);
        expect(mark).toBeLessThan(meaning);
      },
    );
  });
});

describe('the ladder scene', () => {
  const data = fallbacks().ladder;
  const out = html(createElement(LadderScene, { data }));

  it('draws the whole ladder', () => {
    expect(out).toContain('PRC official escalation ladder');
  });

  // The gauge fills itself on mount, so it is not inside a Beat: the only beats are the two headline
  // rows and the note. A Beat of any delay around the gauge would add an entry.
  it('does not delay the gauge, so its fill is seen from the first frame', () => {
    expect(beatsOf(out)).toEqual([3200, 4600, 6000]);
  });

  it("labels the same kind of language by whose it is: Beijing's plainly, another party's as not Beijing", () => {
    expect(out).toContain('captured beijing');
    expect(out).toContain('captured other');
    expect(out).toContain('>rung 4<');
    expect(out).toContain('rung 5 · not Beijing');
  });

  it('brings the two headlines in after the gauge has drawn', () => {
    const beats = [...out.matchAll(/--beat:(\d+)ms/g)].map((m) => Number(m[1]));
    expect(Math.max(...beats)).toBeGreaterThanOrEqual(3000);
  });

  it('does not delay the gauge: its own bars draw in on mount, so it must not sit inside a Beat', () => {
    // The gauge is the first thing in the scene. If it were wrapped in a .demo-beat it would be held at
    // opacity 0 until its delay and its own draw-in would finish unseen; nothing beat-delayed may precede it.
    expect(out.indexOf('PRC official escalation ladder')).toBeGreaterThan(-1);
    expect(out.indexOf('PRC official escalation ladder')).toBeLessThan(out.indexOf('demo-beat'));
  });
});

describe('the trail scene', () => {
  const out = html(createElement(TrailScene, { data: fallbacks().trail }));

  it("draws Beijing's dots by country", () => {
    expect(out).toContain('data-trail-row="JPN"');
  });

  // Only the heading is beat-timed; a Beat of any delay or kind around the trail would add an entry.
  it('does not delay the trail: its dots draw in on mount, so the panel must not sit inside a Beat', () => {
    expect(beatsOf(out)).toEqual([0]);
  });
});

describe('the event scene', () => {
  const data = fallbacks().event;
  const out = html(createElement(EventScene, { data }));

  it('shows the distinct reports converging and the event they make', () => {
    expect(out).toContain('captured lead');
    expect(out).toContain('captured other');
    expect(out).toContain('CAPTURED event');
  });

  it('folds a reprint under the report it repeats, counted once, naming who else printed it', () => {
    expect(out).toContain('data-reveal-fold');
    expect(out).toContain('Also printed by C');
    expect(out).toContain('counted once');
  });

  it('draws no fold when nothing was reprinted', () => {
    const plain = html(createElement(EventScene, { data: { ...data, reprints: [] } }));
    expect(plain).not.toContain('data-reveal-fold');
    expect(plain).not.toContain('Also printed by');
  });

  it('does not delay the confidence meter or the reprint fold: both draw in on mount, so neither may sit inside a Beat', () => {
    // The meter's bars fill and the fold closes via RevealOnView on mount. `.demo-beat` holds an element at
    // opacity 0 until its delay, so a beat-wrapped meter would finish filling before anyone could see it.
    // The only beats are the reports after the lead, sliding in at 500 + i x 450: a Beat of any delay
    // around the meter or the fold would add an entry.
    expect(beatsOf(out)).toEqual(data.reports.slice(1).map((_, i) => 500 + i * 450));
    // The lead row (with its fold) is first in the scene and is not beat-timed: no beat precedes it.
    expect(out.indexOf('data-reveal-fold')).toBeGreaterThan(-1);
    expect(out.indexOf('data-reveal-fold')).toBeLessThan(out.indexOf('demo-slide'));
  });

  it("draws one panel around the meter, not a panel inside a panel: ConfidenceMeter's own is the only one", () => {
    // ConfidenceMeter's root is already `.panel p-4`; wrapping it in another Panel stacks a second border,
    // blur and 32px of padding. Nothing else in this scene (lead row, fold, other reports) uses a panel.
    expect(out.match(/class="[^"]*\bpanel\b[^"]*"/g)).toHaveLength(1);
  });
});

describe('the dyad scene', () => {
  const data = fallbacks().dyad;
  const out = html(createElement(DyadScene, { data }));

  it('names the two states and draws the tension series', () => {
    expect(out).toContain('China — Japan');
    expect(out).toContain('Daily tension, 5 days ending 2026-07-05');
  });

  it('marks the defining events: one inert link per event, each on the day it happened', () => {
    expect(out).toContain('defining event');
    for (const label of ['a', 'b', 'c']) expect(out).toContain(`aria-label="${label}"`);
    for (const i of [0, 1, 2]) expect(out).toContain(`href="#${i}"`);
  });

  it('keeps two defining events on the same day apart: each gets its own href, so the markers cannot collide', () => {
    // Columns keys a marker by `${date}-${href}`; with one shared href two same-day events would collide.
    const same = { ...data, markers: [{ date: '2026-07-02', label: 'x' }, { date: '2026-07-02', label: 'y' }] };
    const both = html(createElement(DyadScene, { data: same }));
    expect(both).toContain('aria-label="x"');
    expect(both).toContain('aria-label="y"');
    const hrefs = [...both.matchAll(/<a [^>]*href="(#[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toHaveLength(2);
    expect(new Set(hrefs).size).toBe(2);
  });

  it('shows the finished tension score', () => {
    expect(out).toContain('>40<');
  });

  // The header (0) and the score (2400) are the only beats; a Beat of any delay around the columns would add one.
  it('does not delay the columns: their markers pop on mount, so the panel must not sit inside a Beat', () => {
    expect(beatsOf(out)).toEqual([0, 2400]);
  });
});
