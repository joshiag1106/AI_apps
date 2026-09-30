import { describe, it, expect } from 'vitest';
import { beijingQuestions, incidentQuestions, questionFromId } from '@/lib/forecast/geo/questions';
import { art, ev, T } from './fixtures/forecast';

describe('incident questions', () => {
  it('asks about every pair named together in at least the minimum number of events', () => {
    const events = [
      ...Array.from({ length: 3 }, () => ev({ actors: ['IND', 'CHN'] })),
      ...Array.from({ length: 2 }, () => ev({ actors: ['IND', 'PAK'] })),
    ];
    const qs = incidentQuestions(events, 3);
    expect(qs.map((q) => q.id)).toEqual(['incident:CHN-IND']);
    expect(qs[0]).toMatchObject({
      kind: 'incident', label: 'China–India',
      text: 'Will a corroborated military incident between China and India begin in the next 7 days?',
    });
  });

  it('uses 100 events as the default threshold', () => {
    expect(incidentQuestions(Array.from({ length: 99 }, () => ev()))).toEqual([]);
    expect(incidentQuestions(Array.from({ length: 100 }, () => ev()))).toHaveLength(1);
  });
});

describe('Beijing questions', () => {
  const now = T('2026-10-05T00:30:00Z');
  const said = (target: string | null, iso: string, speaker: 'prc' | 'other' = 'prc') =>
    art({ ladderSpeaker: speaker, ladderRung: 6, ladderTarget: target, publishedAt: iso });

  it('asks about every state Beijing targeted in the last 90 days, then anyone', () => {
    const qs = beijingQuestions([
      said('PHL', '2026-09-01T00:00:00Z'),
      said('JPN', '2026-08-01T00:00:00Z'),
      said('KOR', '2026-06-01T00:00:00Z'),          // more than 90 days before
      said('USA', '2026-09-01T00:00:00Z', 'other'),  // not Beijing speaking
    ], now);
    expect(qs.map((q) => q.id)).toEqual(['beijing:JPN', 'beijing:PHL', 'beijing:any']);
    expect(qs[0]).toMatchObject({ label: 'Beijing toward Japan',
      text: 'Will Beijing make an official escalation-ladder statement aimed at Japan in the next 7 days?' });
    expect(qs[2]).toMatchObject({ label: 'Beijing',
      text: 'Will Beijing make an official escalation-ladder statement in the next 7 days?' });
  });
});

describe('questionFromId', () => {
  it('rebuilds both kinds exactly', () => {
    expect(questionFromId('incident:CHN-IND')).toEqual(incidentQuestions(Array.from({ length: 100 }, () => ev()))[0]);
    expect(questionFromId('beijing:any').rule).toEqual({ kind: 'beijing', target: 'any', graceHours: 72 });
    expect(() => questionFromId('nonsense')).toThrow(/unknown question/);
  });
});
