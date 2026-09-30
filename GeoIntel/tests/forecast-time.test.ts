import { describe, it, expect } from 'vitest';
import { DAY, isoDay, mondayStart, weekId } from '@/lib/forecast/time';

const T = (iso: string) => Date.parse(iso);

describe('forecast weeks', () => {
  it('finds Monday 00:00 UTC of any moment in the week', () => {
    expect(mondayStart(T('2026-09-30T12:00:00Z'))).toBe(T('2026-09-28T00:00:00Z'));
    expect(mondayStart(T('2026-09-28T00:00:00Z'))).toBe(T('2026-09-28T00:00:00Z'));
    expect(mondayStart(T('2026-10-04T23:59:59Z'))).toBe(T('2026-09-28T00:00:00Z'));
  });

  it('names weeks by ISO-8601, including the 53rd week of 2026', () => {
    expect(weekId(T('2026-09-30T12:00:00Z'))).toBe('2026-W40');
    expect(weekId(T('2026-10-05T00:00:00Z'))).toBe('2026-W41');
    expect(weekId(T('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    expect(weekId(T('2027-01-04T00:00:00Z'))).toBe('2027-W01');
  });

  it('gives the UTC calendar day', () => {
    expect(isoDay(T('2026-09-30T23:59:00Z'))).toBe('2026-09-30');
    expect(isoDay(T('2026-09-30T00:00:00Z') + DAY)).toBe('2026-10-01');
  });
});
