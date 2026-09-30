import { describe, it, expect } from 'vitest';
import { corpusAsOf, signalsFor, tensionOf } from '@/lib/forecast/geo/signals';
import { beijingQuestion, incidentQuestion } from '@/lib/forecast/geo/questions';
import { art, corpusOf, ev, incident, T } from './fixtures/forecast';

const asOf = T('2026-09-28T00:00:00Z');
const chnInd = incidentQuestion('CHN', 'IND');

describe('incident and reporting signals', () => {
  const recent = incident('CHN', 'IND', '2026-09-25T00:00:00.000Z');
  const older = incident('CHN', 'IND', '2026-09-10T00:00:00.000Z');
  const later = incident('CHN', 'IND', '2026-09-29T00:00:00.000Z'); // after asOf: must be ignored
  const reports = [
    ...Array.from({ length: 3 }, () => art({ publishedAt: '2026-09-24T00:00:00.000Z' })),  // last 7 days
    ...Array.from({ length: 8 }, () => art({ publishedAt: '2026-09-05T00:00:00.000Z' })),  // the 4 weeks before
  ];
  const c = corpusOf([recent.event, older.event, later.event],
    [...recent.articles, ...older.articles, ...later.articles, ...reports]);
  const s = signalsFor(chnInd, c, asOf, 5);

  it('counts qualifying incidents in the last 7 and 28 days, never after the snapshot', () => {
    expect(s.incidents7).toBe(1);
    expect(s.incidents28).toBe(2);
  });

  it('measures a reporting surge against the four weeks before', () => {
    // 5 reports in the last week (3 + the recent incident's 2); 10 in the 4 weeks before (8 + 2) -> 2.5 a week
    expect(s.surge).toBeCloseTo((5 + 1) / (10 / 4 + 1), 10);
  });

  it('sums escalation weight over events last seen this week', () => {
    expect(s.escWeight7).toBeCloseTo(20 * 0.4, 10);
  });

  it('takes the tension change against the snapshot a week earlier, or 0 without one', () => {
    expect(s.tension).toBe(tensionOf(chnInd, { ...c, events: c.events.filter((e) => Date.parse(e.firstSeen) < asOf) }, asOf));
    expect(s.tensionChange7).toBe(s.tension - 5);
    expect(signalsFor(chnInd, c, asOf, null).tensionChange7).toBe(0);
  });
});

describe('Beijing signals', () => {
  const said = (target: string | null, iso: string, rung = 6) =>
    art({ ladderSpeaker: 'prc', ladderRung: rung, ladderTarget: target, publishedAt: iso, actors: ['CHN'] });
  const c = corpusOf([], [said('JPN', '2026-09-26T00:00:00.000Z', 6), said('JPN', '2026-09-05T00:00:00.000Z', 8),
    said(null, '2026-09-27T00:00:00.000Z', 4)]);

  it('counts statements aimed at the other state of a pair that includes China', () => {
    expect(signalsFor(incidentQuestion('CHN', 'JPN'), c, asOf, null))
      .toMatchObject({ beijing7: 1, beijing28: 2, beijingMaxRung28: 8 });
  });

  it('gives zero to a pair without China', () => {
    expect(signalsFor(incidentQuestion('IND', 'PAK'), c, asOf, null))
      .toMatchObject({ beijing7: 0, beijing28: 0, beijingMaxRung28: 0 });
  });

  it("counts every statement for 'any'", () => {
    expect(signalsFor(beijingQuestion('any'), c, asOf, null)).toMatchObject({ beijing7: 2, beijing28: 3 });
  });
});

describe('no peeking', () => {
  it('a report published after the snapshot changes no signal', () => {
    let k = 0;
    const tag = () => `zq${(k++).toString(36)}x zr${k.toString(36)}y`;
    const before = Array.from({ length: 12 }, (_, i) =>
      art({ title: `${tag()} border standoff`, publishedAt: new Date(asOf - (i + 1) * 36e5 * 20).toISOString() }));
    const after = art({ title: `${tag()} border standoff`, publishedAt: new Date(asOf + 36e5).toISOString() });
    const plain = signalsFor(chnInd, corpusAsOf(before, asOf), asOf, null);
    const withLate = signalsFor(chnInd, corpusAsOf([...before, after], asOf), asOf, null);
    expect(withLate).toEqual(plain);
  });

  it('ignores an event first seen after the snapshot even if handed one', () => {
    const late = ev({ firstSeen: '2026-09-29T00:00:00.000Z', lastSeen: '2026-09-29T00:00:00.000Z' });
    expect(signalsFor(chnInd, corpusOf([late], []), asOf, null).escWeight7).toBe(0);
  });
});
