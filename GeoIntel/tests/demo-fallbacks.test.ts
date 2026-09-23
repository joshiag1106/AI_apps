import { describe, it, expect } from 'vitest';
import { FALLBACKS } from '@/data/demo-fallbacks';
import { isJunkHeadline } from '@/lib/demo/junk';

describe('the captured fallbacks', () => {
  it('carry one capture date, in ISO form', () => {
    expect(FALLBACKS.capturedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('hold a real example for every chapter that can fall back', () => {
    expect(FALLBACKS.language.headline).toContain(FALLBACKS.language.ladderZh);
    expect(FALLBACKS.event.reports.length).toBeGreaterThanOrEqual(2);
    expect(FALLBACKS.ladder.beijing.title).toBeTruthy();
    expect(FALLBACKS.ladder.other.title).toBeTruthy();
    expect(FALLBACKS.trail.trail.dots).toBeGreaterThan(0);
    expect(FALLBACKS.dyad.markers.length).toBeGreaterThanOrEqual(3);
    expect(FALLBACKS.alert.subject).toMatch(/moved to rung \d+/);
  });

  it('contain no junk headline', () => {
    const titles = [
      FALLBACKS.language.headline, FALLBACKS.ladder.beijing.title, FALLBACKS.ladder.other.title,
      ...FALLBACKS.event.reports.map((r) => r.title), ...FALLBACKS.event.reprints.map((r) => r.title),
    ];
    for (const t of titles) expect(isJunkHeadline(t), t).toBe(false);
  });

  it('render the alert on the placeholder origin, and every link in it is on that origin', () => {
    expect(FALLBACKS.alert.text).not.toMatch(/localhost|127\.0\.0\.1/);
    const links = FALLBACKS.alert.text.match(/https?:\/\/\S+/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    // The file is tracked and published, so no link in it may point anywhere but the placeholder.
    for (const l of links) expect(l, l).toMatch(/^https:\/\/kautilya\.example\//);
  });
});

/** Visit every value in a JSON-shaped tree: the value itself, then each array item and object member. */
function walk(value: unknown, visit: (v: unknown) => void): void {
  visit(value);
  if (Array.isArray(value)) value.forEach((v) => walk(v, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => walk(v, visit));
}

/**
 * The fallbacks are self-contained: headline, outlet, date, rung, formula — no links into a corpus
 * that will have moved on. These walk the WHOLE object, so a link or a corpus id that arrives in a
 * field nobody thought to name (as the trail's evidence urls and event ids once did) is still caught.
 */
describe('the captured fallbacks are self-contained', () => {
  it('link nowhere but the placeholder origin, in any field', () => {
    const urls: string[] = [];
    walk(FALLBACKS, (v) => {
      if (typeof v === 'string') urls.push(...(v.match(/https?:\/\/[^\s"')]+/g) ?? []));
    });
    for (const u of urls) expect(u, u).toMatch(/^https:\/\/kautilya\.example\//);
  });

  it('carry no corpus event id, on any dot or evidence row', () => {
    const ids: unknown[] = [];
    walk(FALLBACKS, (v) => {
      if (v && typeof v === 'object' && !Array.isArray(v) && 'eventId' in v) ids.push((v as { eventId: unknown }).eventId);
    });
    // Guard against the walk finding nothing and the test passing for the wrong reason.
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toBeNull();
  });
});
