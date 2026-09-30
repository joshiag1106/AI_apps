import { describe, it, expect } from 'vitest';
import { beijingRule, incidentRule, settle } from '@/lib/forecast/geo/settle';
import { art, corpusOf, incident, T } from './fixtures/forecast';

const week = { start: T('2026-10-05T00:30:00Z'), end: T('2026-10-12T00:00:00Z') };
const rule = incidentRule('IND', 'CHN');

describe('incident settlement', () => {
  it('sorts the pair and records every threshold', () => {
    expect(rule).toEqual({ kind: 'incident', states: ['CHN', 'IND'], domain: 'Military',
      minEscalation: 10, minConfidence: 30, minOutlets: 2, graceHours: 72 });
  });

  it('counts an incident first seen inside the week, with its evidence', () => {
    const { event, articles } = incident('CHN', 'IND', '2026-10-07T09:00:00.000Z', { title: 'Clash at the LAC' });
    const s = settle(rule, week, corpusOf([event], articles));
    expect(s.outcome).toBe(1);
    expect(s.evidence).toEqual([{ id: event.id, title: 'Clash at the LAC', outlets: ['Wire A', 'Wire B'],
      urls: articles.map((a) => a.url), date: '2026-10-07T09:00:00.000Z' }]);
  });

  it.each([
    ['two reports from one outlet', { outlet: 'same' }],
    ['first seen before the week', { firstSeen: '2026-10-04T09:00:00.000Z' }],
    ['not military', { domain: 'Diplomatic' as const }],
    ['escalation below 10', { escalation: 9 }],
    ['confidence below 30', { confidence: 29 }],
    ['only one of the two states', { actors: ['CHN', 'JPN'] }],
  ])('does not count %s', (_why, change) => {
    const { event, articles } = incident('CHN', 'IND', '2026-10-07T09:00:00.000Z');
    const arts = 'outlet' in change ? articles.map((a) => ({ ...a, outlet: 'same' })) : articles;
    const e = 'outlet' in change ? event : { ...event, ...change };
    expect(settle(rule, week, corpusOf([e], arts)).outcome).toBe(0);
  });
});

describe('Beijing settlement', () => {
  const said = (p: Parameters<typeof art>[0]) => art({ ladderSpeaker: 'prc', ladderRung: 6, ladderTarget: 'JPN',
    publishedAt: '2026-10-06T03:00:00.000Z', ...p });

  it('counts a Beijing statement aimed at the target inside the week', () => {
    const a = said({ title: '中方向日方提出严正交涉' });
    const s = settle(beijingRule('JPN'), week, corpusOf([], [a]));
    expect(s.outcome).toBe(1);
    expect(s.evidence[0]).toMatchObject({ id: a.id, outlets: [a.outlet], urls: [a.url] });
  });

  it.each([
    ['another speaker', { ladderSpeaker: 'other' as const }],
    ['another target', { ladderTarget: 'KOR' }],
    ['no rung', { ladderRung: null }],
    ['outside the week', { publishedAt: '2026-10-12T00:00:00.000Z' }],
  ])('does not count %s', (_why, p) => {
    expect(settle(beijingRule('JPN'), week, corpusOf([], [said(p)])).outcome).toBe(0);
  });

  it("'any' counts a statement aimed at anyone, or at no one named", () => {
    expect(settle(beijingRule('any'), week, corpusOf([], [said({ ladderTarget: null })])).outcome).toBe(1);
    expect(settle(beijingRule('any'), week, corpusOf([], [said({ ladderTarget: 'PHL' })])).outcome).toBe(1);
  });
});
