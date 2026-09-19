import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { allEntries } from '@/data/glossary';
import { FLAG_LABEL } from '@/lib/format';

/**
 * A score that quietly drops needs the pages that describe it to change with it — and to be
 * honest about the limit: collapsing catches reprints, and misses rewritten or translated copy.
 */
describe('the words around reprint collapse', () => {
  it('reads "single source" as one original, not one outlet', () => {
    expect(FLAG_LABEL.single_source.help).toMatch(/original/i);
    expect(FLAG_LABEL.single_source.help).not.toMatch(/only one outlet/i);
  });

  it('defines a reprint in the glossary', () => {
    const e = allEntries().find((x) => x.id === 'reprint');
    expect(e, 'the glossary needs a reprint entry').toBeDefined();
    expect(e!.meaning).toMatch(/counted once|counts it once/i);
    expect(e!.meaning).toMatch(/rewritten|translated/i);
  });

  it('has the methodology page say what is caught and what is not', () => {
    const page = readFileSync('app/methodology/page.tsx', 'utf8');
    expect(page).toMatch(/reprint/i);
    expect(page).toMatch(/rewritten/i);
    expect(page).toMatch(/0\.8/);
    // The figures rule was found by reading real output; a reader deserves to know it exists.
    expect(page).toMatch(/figures|numbers/i);
  });

  it('mentions it in the README', () => {
    expect(readFileSync('README.md', 'utf8')).toMatch(/reprint/i);
  });
});
