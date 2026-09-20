import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LadderTrail, dotDiameter } from '@/components/LadderTrail';
import { ladderTrail } from '@/lib/verify/trail';
import type { Article } from '@/lib/types';

let n = 0;
function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `c${String(n).padStart(4, '0')}`, url: `https://x/chart/${n}`,
    title: `外交部：中方第${n}号声明强烈抗议日方涉靖国神社消极动向`, outlet: `Outlet ${n}`,
    publishedAt: '2026-08-15T10:00:00.000Z', snippet: '', imageUrl: null, language: 'zh',
    beatId: null, localeKey: null, sourceCountry: 'CHN', ownership: 'state', tier: 2,
    isPrimary: false, actors: ['CHN', 'JPN'], people: [], hotspots: [], domain: 'Diplomatic',
    escalation: 0, framing: 0, ladderRung: 8, ladderZh: '强烈抗议', ladderEn: 'strong protest',
    ladderSpeaker: 'prc', ladderTarget: 'JPN',
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}
const OPTS = { since: '2026-06-20T00:00:00.000Z', until: '2026-09-17T12:00:00.000Z' };
const render = (trail: ReturnType<typeof ladderTrail>, only?: string) =>
  renderToStaticMarkup(createElement(LadderTrail, { trail, only }));

const a1 = art({ ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'solemn representations', publishedAt: '2026-07-13T10:00:00.000Z' });
const a2 = art({ publishedAt: '2026-08-15T10:00:00.000Z' });
const a3 = art({ ladderTarget: 'PHL', ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'solemn representations', publishedAt: '2026-07-21T10:00:00.000Z' });
const a4 = art({ ladderTarget: null, ladderRung: 6, ladderZh: '坚决反对', ladderEn: 'resolute opposition', publishedAt: '2026-09-11T10:00:00.000Z' });
const eventOf = new Map([[a1.id, 'ev-1'], [a2.id, 'ev-2']]);
const trail = ladderTrail([a1, a2, a3, a4], { ...OPTS, eventOf });
const html = render(trail);

describe('the chart', () => {
  it('has one row per country, labelled with the direction', () => {
    expect(html).toContain('data-trail-row="JPN"');
    expect(html).toContain('data-trail-row="PHL"');
    expect(html).toMatch(/Beijing[\s\S]{0,60}→[\s\S]{0,60}Japan/);
    expect(html).toMatch(/Beijing[\s\S]{0,60}→[\s\S]{0,60}Philippines/);
  });

  it('has a row for what the headline does not say', () => {
    expect(html).toContain('data-trail-row="none"');
    expect(html).toContain('target not stated');
  });

  it('draws one dot per dot', () => {
    expect((html.match(/data-trail-dot/g) ?? []).length).toBe(4);
  });

  it('names each dot for a screen reader and on hover', () => {
    expect(html).toContain('aria-label="Beijing to Japan, 15 Aug: rung 8 (new high), strong protest — 1 report"');
    expect(html).toMatch(/title="Beijing to Japan, 13 Jul: rung 4, /);
  });

  it('tells a screen reader about a new high, which the ring alone would not', () => {
    // The chart must add nothing the table lacks: a reader who cannot see the ring is told.
    expect((html.match(/\(new high\)/g) ?? []).length).toBe(2); // aria-label and title of the one dot
    expect(html).toMatch(/rung 8[^<]*new high/);                // and its row in the table
  });

  it('links a dot to its event when it has one, and is still a labelled dot when it has none', () => {
    expect(html).toContain('href="/events/ev-1"');
    expect(html).toContain('href="/events/ev-2"');
    expect(html).toContain('role="img"'); // the Philippines dot and the unstated one have no event
  });

  it('rings a new high and nothing else', () => {
    expect((html.match(/data-new-high="true"/g) ?? []).length).toBe(1); // JPN: rung 4 on 13 Jul, then 8
  });

  it('makes a higher rung a bigger dot, but a small one', () => {
    expect(dotDiameter(8)).toBeGreaterThan(dotDiameter(4));
    expect(dotDiameter(13)).toBeGreaterThan(dotDiameter(8));
    // Days sit about 9px apart on a desktop axis. Dots much wider than that run together, so the
    // largest is capped well short of the 22px this first shipped with.
    expect(dotDiameter(1)).toBeGreaterThanOrEqual(6);
    expect(dotDiameter(13)).toBeLessThanOrEqual(16);
  });

  it('never lets a dot’s click target take its neighbour’s clicks', () => {
    // Measured in a real build: 24px targets on dots 9px apart made a click on the centre of the
    // 13 Jul dot open the 14 Jul event. The target is the dot's own width, and never wider than
    // two days' worth of axis, so a neighbour's centre is never inside it — whatever the width of
    // the screen and however many days the window spans (this one spans 90).
    const tags = [...html.matchAll(/<(?:a|span)\b[^>]*data-trail-dot[^>]*>\s*<span[^>]*reveal-scale[^>]*>/g)].map((m) => m[0]);
    expect(tags).toHaveLength(4);
    for (const tag of tags) {
      const widths = [...tag.matchAll(/width:([^;"]+)/g)].map((m) => m[1]);
      const inner = /^(\d+)px$/.exec(widths[widths.length - 1])![1];
      expect(widths[0], tag).toBe(`min(${inner}px, calc((100% - 24px) * ${2 / 90} - 1px))`);
    }
  });

  it('allows a wider target when the window is short, because days are then far apart', () => {
    const short = render(ladderTrail([a2], { since: '2026-08-14T00:00:00.000Z', until: '2026-08-17T12:00:00.000Z' }));
    expect(short).toContain(`calc((100% - 24px) * ${2 / 4} - 1px)`);
  });

  it('is honest about what it cannot see', () => {
    expect(html).toContain('headlines');
    expect(html).toContain('not that things were calm');
    expect(html).toContain('Collecting since 20 Jun');
  });

  it('says so, without claiming a start date, when the window has been cut to the last 90 days', () => {
    const cut = render(ladderTrail([a2], { since: '2026-04-01T00:00:00.000Z', until: '2026-09-17T12:00:00.000Z' }));
    expect(cut).toContain('Showing the last 90 days.');
    expect(cut).not.toContain('Collecting since');
  });

  it('warns that close days run together on a narrow screen, and points at the table', () => {
    expect(html).toContain('close together');
    expect(html).toContain('the table below lists every one');
  });
});

describe('the table under the chart', () => {
  it('lists every headline behind the dots, always rendered, closed by default', () => {
    expect(html).toContain('<details');
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    for (const a of [a1, a2, a3, a4]) expect(html).toContain(a.title);
    expect(html).toContain('Every dated headline behind the dots (4)');
  });

  it('links a headline to its event', () => {
    expect(html).toMatch(/<a\b(?=[^>]*href="\/events\/ev-2")(?=[^>]*data-trail-headline)[^>]*>/);
  });

  it('says whom each is about, including when it is not stated', () => {
    expect(html).toContain('Japan');
    expect(html).toContain('not stated');
  });
});

describe('narrowed to one country', () => {
  it('shows only that country’s row and table, and no unstated row', () => {
    const only = render(trail, 'JPN');
    expect(only).toContain('data-trail-row="JPN"');
    expect(only).not.toContain('data-trail-row="PHL"');
    expect(only).not.toContain('data-trail-row="none"');
    expect(only).toContain('Every dated headline behind the dots (2)');
  });

  it('says so, by name, when there is nothing to show', () => {
    expect(render(trail, 'KOR')).toContain('No Beijing formula about South Korea found in headlines since 20 Jun.');
  });
});

describe('with nothing to show', () => {
  it('says so and draws no chart', () => {
    const empty = render(ladderTrail([], OPTS));
    expect(empty).toContain('No Beijing formula found in headlines since 20 Jun.');
    expect(empty).not.toContain('data-trail-dot');
    expect(empty).not.toContain('<details');
  });
});

describe('motion', () => {
  // Only inline styles: class names such as Tailwind's `transition-colors` are not animation state.
  const styles = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]).join(' ');

  it('leaves every animated state to the reveal hook, so nothing is hidden without it', () => {
    expect(styles).not.toMatch(/transition|animation|scale\(0\)/);
    expect(html).toContain('reveal-scale');
    expect(html).toContain('data-reveal-delay');
  });

  it('staggers the dots by their order in time, capped', () => {
    const delays = [...html.matchAll(/data-reveal-delay="(\d+)"/g)].map((m) => Number(m[1]));
    expect(new Set(delays).size).toBe(4);
    expect(Math.max(...delays)).toBeLessThanOrEqual(900);
  });
});

describe('the reveal hook', () => {
  const src = readFileSync('components/RevealOnView.tsx', 'utf8');

  it('reads a per-element delay when it scales things in', () => {
    expect(src).toContain('s.dataset.revealDelay');
  });

  it('only reaches it after the reduced-motion early return', () => {
    // The call, not the doc comment that also mentions the query.
    const guard = src.indexOf("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(src.indexOf('s.dataset.revealDelay'));
  });
});
