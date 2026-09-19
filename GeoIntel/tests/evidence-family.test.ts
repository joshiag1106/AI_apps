import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvidenceFamily } from '@/components/EvidenceFamily';

const render = (props: { outlets: string[]; sameOutlet?: string; count?: number }) => renderToStaticMarkup(
  createElement(EvidenceFamily, {
    lead: createElement('article', null, 'the lead report'),
    outlets: props.outlets,
    sameOutlet: props.sameOutlet ?? 'Reuters',
    count: props.count ?? props.outlets.length,
    children: createElement('div', null, 'a reprint row'),
  }),
);

/**
 * The reprints are folded under the report they repeat, but never hidden from anyone who
 * cannot run the animation: they sit in a native <details>, closed at rest, so they work with
 * no JavaScript and no pointer.
 */
describe('a family with reprints', () => {
  it('shows the report, then who else printed it, closed', () => {
    const html = render({ outlets: ['Dawn', 'chinaglobalsouth.com'] });
    expect(html).toContain('the lead report');
    expect(html).toContain('Also printed by Dawn, chinaglobalsouth.com');
    expect(html).toContain('2 reprints, counted once');
    expect(html).toContain('<details');
    expect(html).toContain('data-reveal-fold');
    expect(html).toContain('data-fold-body');
    expect(html, 'must rest closed').not.toMatch(/<details[^>]*\sopen/);
  });

  it('keeps the reprint rows in the document, where a reader can open them', () => {
    expect(render({ outlets: ['Dawn'] })).toContain('a reprint row');
  });

  it('says "reprint" for one', () => {
    expect(render({ outlets: ['Dawn'] })).toContain('1 reprint, counted once');
  });

  it('counts reports, not outlets, when one outlet printed it twice', () => {
    expect(render({ outlets: ['Dawn'], count: 2 })).toContain('2 reprints, counted once');
  });
});

describe('a family that is one outlet under one headline', () => {
  // Found in the real corpus: Al Jazeera's "… | AJ #shorts" beside the same headline, and a
  // magazine's numbered pages. Calling those "also printed by" the outlet already shown would
  // claim a second publisher that does not exist.
  it('does not claim another outlet printed it', () => {
    const html = render({ outlets: [], sameOutlet: 'Al Jazeera', count: 2 });
    expect(html).not.toContain('Also printed by');
    expect(html).toContain('More from Al Jazeera under the same headline');
    expect(html).toContain('2 other versions, counted once');
  });

  it('says "version" for one', () => {
    expect(render({ outlets: [], sameOutlet: 'Al Jazeera', count: 1 })).toContain('1 other version, counted once');
  });
});

describe('the page and the score share one definition of a family', () => {
  it('both read reprintFamilies from the same module', () => {
    const page = readFileSync('app/events/[id]/page.tsx', 'utf8');
    const scorer = readFileSync('lib/verify/confidence.ts', 'utf8');
    expect(page).toContain("from '@/lib/verify/reprints'");
    expect(scorer).toContain("from '@/lib/verify/reprints'");
    expect(page).toContain('reprintFamilies(articles)');
  });
});
