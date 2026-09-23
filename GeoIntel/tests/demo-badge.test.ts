import { describe, it, expect } from 'vitest';
import { sourceBadge } from '@/lib/demo/badge';

const NOW = Date.parse('2026-09-20T12:00:00.000Z');

describe('the source badge', () => {
  it('dates a captured example', () => {
    expect(sourceBadge({ kind: 'captured', capturedOn: '2026-09-14' }, null, NOW)).toBe('Example captured 14 Sep');
  });

  it('says how fresh a live example is', () => {
    expect(sourceBadge({ kind: 'live' }, '2026-09-20T11:46:00.000Z', NOW)).toBe('Live · updated 14m ago');
  });

  it('says only "Live" when nothing has ever been ingested', () => {
    expect(sourceBadge({ kind: 'live' }, null, NOW)).toBe('Live');
  });
});
