import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ABBREVIATIONS, CONCEPT_GROUPS, NETWORK_MEASURES, ZH_CATEGORY_LABELS, allEntries,
} from '@/data/glossary';
import { ESCALATION_LADDER, ZH_GLOSSARY, type GlossCategory } from '@/data/glossary.zh';
import { VECTORS } from '@/lib/risk';
import type { Domain } from '@/data/lexicon';
import type { Ownership } from '@/data/sources';
import type { EventFlag } from '@/lib/types';

/**
 * The glossary exists so a visitor can read the rest of the site. Its failure mode is not a
 * crash but drift: the site grows a new topic tag, event flag or network measure, prints it
 * on every page, and the glossary never mentions it — so the one page meant to explain the
 * vocabulary is the one that is quietly out of date.
 *
 * Every vocabulary the interface can PRINT is therefore listed below as an exhaustive record
 * keyed on the type that produces it. Adding a member to the type stops `tsc` until it is
 * listed here, and listing it here fails the test until the glossary defines it. Nothing
 * relies on somebody remembering.
 */
const DOMAINS = {
  Military: 1, Maritime: 1, Cyber: 1, Economic: 1, Energy: 1,
  Space: 1, Nuclear: 1, Diplomatic: 1, Internal: 1, Technology: 1,
} satisfies Record<Domain, 1>;

const OWNERSHIPS = {
  state: 1, state_affiliated: 1, public: 1, independent: 1, tabloid: 1, analysis: 1,
} satisfies Record<Ownership, 1>;

const FLAGS = {
  single_source: 1, state_media_only: 1, disputed: 1, uncorroborated: 1, primary_sourced: 1,
} satisfies Record<EventFlag, 1>;

const slug = (s: string) => s.toLowerCase().replace(/_/g, '-');
const ids = new Set(allEntries().map((e) => e.id));

describe('the glossary defines everything the interface prints', () => {
  it('has an entry for every topic tag an event can carry', () => {
    const missing = Object.keys(DOMAINS).map((d) => `domain-${slug(d)}`).filter((id) => !ids.has(id));
    expect(missing, `add these to data/glossary.ts:\n${missing.join('\n')}`).toEqual([]);
  });

  it('has an entry for every kind of outlet ownership', () => {
    const missing = Object.keys(OWNERSHIPS).map((o) => `owner-${slug(o)}`).filter((id) => !ids.has(id));
    expect(missing, `add these to data/glossary.ts:\n${missing.join('\n')}`).toEqual([]);
  });

  it('has an entry for every flag an event can carry', () => {
    const missing = Object.keys(FLAGS).map((f) => `flag-${slug(f)}`).filter((id) => !ids.has(id));
    expect(missing, `add these to data/glossary.ts:\n${missing.join('\n')}`).toEqual([]);
  });

  it('names every risk vector in the entry that explains them', () => {
    const entry = allEntries().find((e) => e.id === 'risk-vector');
    expect(entry, 'the glossary needs a risk-vector entry').toBeDefined();
    const missing = VECTORS.filter((v) => !entry!.meaning.includes(v));
    expect(missing).toEqual([]);
  });

  it('has an entry for every measure the network panels print', () => {
    // Read from the panels' own source: the labels are string literals inside functions that
    // need a whole graph to call, and a test that rebuilt a graph to learn eight words would
    // be testing the graph. The count is a guard on the guard — a changed literal style that
    // made the scrape find nothing would otherwise pass this test by checking nothing.
    const labels = ['lib/graph/panel.ts', 'lib/graph/person-panel.ts']
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/label: '([^']+)'/g)].map((m) => m[1]));
    expect(new Set(labels).size).toBeGreaterThanOrEqual(9);

    const defined = new Set(NETWORK_MEASURES.map((m) => m.term.toLowerCase()));
    const missing = [...new Set(labels)].filter((l) => !defined.has(l.toLowerCase()));
    expect(missing, `network measures with no glossary entry:\n${missing.join('\n')}`).toEqual([]);
  });

  it('covers every category the Chinese glossary uses', () => {
    const used = new Set<GlossCategory>(ZH_GLOSSARY.map((t) => t.category));
    const labelled = Object.keys(ZH_CATEGORY_LABELS);
    expect([...used].filter((c) => !labelled.includes(c))).toEqual([]);
    for (const c of labelled) {
      expect(ZH_CATEGORY_LABELS[c as GlossCategory].label.length).toBeGreaterThan(2);
    }
  });
});

describe('the glossary is well formed', () => {
  const entries = allEntries();

  it('gives every entry a unique, link-safe id', () => {
    // The id is the deep link: /glossary#lac. A duplicate would make two terms share one
    // address and a stray character would break it.
    const seen = new Set<string>();
    for (const e of entries) {
      expect(e.id, e.term).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(seen.has(e.id), `duplicate id "${e.id}"`).toBe(false);
      seen.add(e.id);
    }
    // A guard on the guard: an empty glossary would pass every check above.
    expect(entries.length).toBeGreaterThan(80);
  });

  it('explains each term rather than restating it', () => {
    for (const e of entries) {
      expect(e.term.trim().length, e.id).toBeGreaterThan(0);
      expect(e.meaning.trim().length, `"${e.term}" needs a real explanation`).toBeGreaterThan(24);
    }
  });

  it('lists abbreviations alphabetically, once each, so a reader can scan', () => {
    const terms = ABBREVIATIONS.map((a) => a.term);
    const sorted = [...terms].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    expect(terms).toEqual(sorted);
    expect(new Set(terms.map((t) => t.toLowerCase())).size).toBe(terms.length);
  });

  it('gives every abbreviation its long form', () => {
    for (const a of ABBREVIATIONS) {
      expect(a.expansion?.trim(), `${a.term} needs what it stands for`).toBeTruthy();
    }
  });

  it('puts every concept group under a heading a reader can jump to', () => {
    for (const g of CONCEPT_GROUPS) {
      expect(g.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(g.entries.length, g.title).toBeGreaterThan(0);
    }
  });
});

describe('the glossary page', () => {
  it('renders every entry under its own anchor', async () => {
    const { default: Page } = await import('@/app/glossary/page');
    const html = renderToStaticMarkup(createElement(Page));
    const missing = allEntries().map((e) => e.id).filter((id) => !html.includes(`id="${id}"`));
    expect(missing, `entries with no anchor on the page:\n${missing.join('\n')}`).toEqual([]);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
  });

  it('prints every ladder rung from the detector, not from a copy of it', async () => {
    // The ladder is the product's one distinctive feature, so the glossary must never
    // describe a different ladder from the one the detector uses.
    const { default: Page } = await import('@/app/glossary/page');
    const html = renderToStaticMarkup(createElement(Page));
    for (const r of ESCALATION_LADDER) {
      expect(html, `rung ${r.rung}`).toContain(r.zh);
      expect(html, `rung ${r.rung}`).toContain(r.en.replace(/"/g, '&quot;'));
    }
  });

  it('points at the Chinese terms page, which lives on its own', async () => {
    const { default: Page } = await import('@/app/glossary/page');
    expect(renderToStaticMarkup(createElement(Page))).toContain('href="/glossary/chinese"');
  });
});

describe('the Chinese terms page', () => {
  it('lists every term the engine recognises, from the engine’s own glossary', async () => {
    const { default: Page } = await import('@/app/glossary/chinese/page');
    const html = renderToStaticMarkup(createElement(Page));
    const missing = ZH_GLOSSARY.filter((t) => !html.includes(t.zh)).map((t) => t.zh);
    expect(missing, `terms the engine reads that the page omits:\n${missing.join('\n')}`).toEqual([]);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
  });

  it('marks the language of the Chinese text and links back to the glossary', async () => {
    const { default: Page } = await import('@/app/glossary/chinese/page');
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain('lang="zh');
    expect(html).toContain('href="/glossary"');
  });
});

describe('landing on a deep link', () => {
  // /glossary#lac scrolls the term to the top of the window, and the header is sticky. The
  // first version reserved 80px for it, but the menu wraps onto extra rows as the window
  // narrows and the header measured 92px at 1440 wide, 121px at 1024 and 171px on a phone —
  // so at every width the first lines of the term landed underneath it, and the reader saw a
  // definition with its heading cut off. The offset has to be at least the header's height at
  // each width, so it is taken from one shared constant rather than typed per element.
  it('reserves room for the sticky header at every width', async () => {
    const { ANCHOR_OFFSET } = await import('@/components/anchorOffset');
    // Below md the header is tallest; the constant must lead with a class that clears 171px
    // (scroll-mt-48 is 192px), and must not fall back to a smaller default.
    expect(ANCHOR_OFFSET).toMatch(/(^| )scroll-mt-(4[4-9]|[5-9]\d)( |$)/);

    const { default: Page } = await import('@/app/glossary/page');
    const html = renderToStaticMarkup(createElement(Page));
    const targets = [...html.matchAll(/<(?:div|section) id="([^"]+)"[^>]*class="([^"]*)"/g)];
    // A guard on the guard: the scrape must actually find the anchor targets.
    expect(targets.length).toBeGreaterThan(80);
    const bare = targets.filter(([, , cls]) => !cls.includes(ANCHOR_OFFSET)).map(([, id]) => id);
    expect(bare, `anchor targets that would hide under the header:\n${bare.join('\n')}`).toEqual([]);
  });

  it('does the same on the Chinese terms page', async () => {
    const { ANCHOR_OFFSET } = await import('@/components/anchorOffset');
    const { default: Page } = await import('@/app/glossary/chinese/page');
    const html = renderToStaticMarkup(createElement(Page));
    const targets = [...html.matchAll(/<section id="([^"]+)"[^>]*class="([^"]*)"/g)];
    expect(targets.length).toBeGreaterThanOrEqual(6);
    expect(targets.filter(([, , cls]) => !cls.includes(ANCHOR_OFFSET))).toEqual([]);
  });
});

describe('finding the glossary', () => {
  it('has both pages', () => {
    expect(existsSync('app/glossary/page.tsx')).toBe(true);
    expect(existsSync('app/glossary/chinese/page.tsx')).toBe(true);
  });

  it('is in the header menu', () => {
    const nav = readFileSync('components/Nav.tsx', 'utf8');
    expect(nav).toMatch(/href: '\/glossary'/);
  });

  it('is in the footer, with the Chinese terms beside it', () => {
    const layout = readFileSync('app/layout.tsx', 'utf8');
    const footer = layout.slice(layout.indexOf('<footer'));
    expect(footer).toContain('href="/glossary"');
    expect(footer).toContain('href="/glossary/chinese"');
  });
});
