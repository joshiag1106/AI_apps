import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { allEntries } from '@/data/glossary';

const read = (p: string) => readFileSync(p, 'utf8');

describe('where the trail appears', () => {
  const china = read('app/china/page.tsx');
  const dyad = read('app/dyad/[pair]/page.tsx');

  it('is a section on China Watch, after the official statement detections', () => {
    expect(china).toContain("import { LadderTrail } from '@/components/LadderTrail'");
    expect(china).toContain('ladderTrailData');
    expect(china).toContain('<LadderTrail trail={trail} />');
    expect(china.indexOf('Official statement detections')).toBeLessThan(china.indexOf('<LadderTrail'));
  });

  it('is narrowed to the other country on a dyad page that includes China, and only there', () => {
    expect(dyad).toContain("import { LadderTrail } from '@/components/LadderTrail'");
    expect(dyad).toMatch(/<LadderTrail trail=\{ladderTrailData\(\)\} only=\{/);
    // Exactly one side may be China: a China–China pair is not a page, and a non-China pair has no ladder.
    expect(dyad).toMatch(/\(a\.iso === 'CHN'\) !== \(b\.iso === 'CHN'\)/);
  });

  it('sits behind the dyad page’s paywall, not in front of it', () => {
    // The gate is `{!gate.allowed ? <Paywall/> : (<> … </>)}`. The trail must come after the
    // Paywall element, i.e. inside the allowed branch, or a gated reader would see it.
    expect(dyad.indexOf('<Paywall')).toBeGreaterThan(-1);
    expect(dyad.indexOf('<LadderTrail')).toBeGreaterThan(dyad.indexOf('<Paywall'));
  });
});

describe('what the copy says', () => {
  it('explains whom a formula is about on /methodology, and that a gap is not calm', () => {
    const m = read('app/methodology/page.tsx');
    expect(m).toContain('Whom it is about.');
    expect(m).toContain('left unstated rather');
    expect(m).toContain('not that things were calm');
  });

  it('defines both new terms in the glossary', () => {
    const ids = allEntries().map((e) => e.id);
    expect(ids).toContain('ladder-target');
    expect(ids).toContain('evidence-trail');
  });

  it('exports the target', () => {
    expect(read('app/api/export/route.ts')).toContain("ladder_target: a.ladderTarget ?? ''");
  });
});

describe('the audit', () => {
  it('lists every resolved target and every headline left unstated', () => {
    const s = read('scripts/ladder-shift.ts');
    expect(s).toContain('whom Beijing');
    expect(s).toContain('target not stated');
    expect(s).toContain('ladderTarget');
  });
});
