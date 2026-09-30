import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MailMessage } from '@/lib/alerts/send';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-envelope-')), 'test.db');

const { renderEnvelope, sendEnvelope } = await import('@/lib/forecast/envelope');
const { appendForecast, forecastsForWeek, chainHeads } = await import('@/lib/forecast/ledger');
const { incidentQuestion } = await import('@/lib/forecast/geo/questions');

const q = incidentQuestion('CHN', 'IND');
for (const [forecaster, p] of [['usual-rate@1', 0.21], ['same-as-last-week@1', 0.3], ['signal-model@1', 0.31]] as const) {
  appendForecast({ forecaster, questionId: q.id, week: '2026-W41', question: q.text, rule: q.rule,
    windowStart: '2026-10-05T00:30:00.000Z', windowEnd: '2026-10-12T00:00:00.000Z', issuedAt: '2026-10-05T00:30:00.000Z',
    probability: p, inputsHash: 'x',
    explanation: forecaster === 'signal-model@1'
      ? { probability: p, usual: 0.21, reasons: [], text: '31%. The usual rate for China–India is 21%.' } : null });
}

describe('the sealed envelope', () => {
  it('lists each question with all three forecasts and seals the record', () => {
    const d = renderEnvelope('2026-W41', forecastsForWeek('2026-W41'), chainHeads());
    expect(d.subject).toBe('Kautilya forecasts — 2026-W41 (sealed)');
    expect(d.text).toContain(q.text);
    expect(d.text).toContain('signal model 31% · usual rate 21% · same as last week 30%');
    expect(d.text).toContain('31%. The usual rate for China–India is 21%.');
    expect(d.text).toContain(`forecasts #3 ${chainHeads().forecasts!.hash}`);
    expect(d.text).toContain('outcomes: none yet');
  });

  it('sends nothing without a recipient', async () => {
    expect(await sendEnvelope('2026-W41', { to: '' })).toEqual({ delivered: false, reason: 'no_recipient' });
  });

  it('sends to the recipient through the alerts mailer', async () => {
    const sent: MailMessage[] = [];
    const r = await sendEnvelope('2026-W41', { to: 'owner@example.test', user: 'u', pass: 'p',
      transport: async (m) => { sent.push(m); } });
    expect(r).toEqual({ delivered: true });
    expect(sent[0]).toMatchObject({ to: 'owner@example.test', subject: 'Kautilya forecasts — 2026-W41 (sealed)' });
  });
});
