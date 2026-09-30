import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { art, incident } from './fixtures/forecast';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-fadmin-')), 'test.db');

const db = await import('@/lib/db');
const { forecastAdminView, previewForecasts } = await import('@/lib/forecast/admin');
const { ForecastPanel } = await import('@/components/ForecastPanel');
const { appendForecast, allForecasts } = await import('@/lib/forecast/ledger');
const { incidentQuestion } = await import('@/lib/forecast/geo/questions');

const now = Date.parse('2026-10-01T00:00:00Z');

describe('the admin view', () => {
  it('is empty but useful before anything is issued', () => {
    const v = forecastAdminView(now, { minPairEvents: 1 });
    expect(v).toMatchObject({ week: null, issued: [], historyWeeks: 0 });
    expect(v.live.incident.needs).toContain('6 more settled weeks');
    expect(renderToStaticMarkup(createElement(ForecastPanel, { view: v }))).toContain('No forecasts issued yet');
  });

  it("shows the latest week's forecasts, one row per question", () => {
    const q = incidentQuestion('CHN', 'IND');
    for (const [forecaster, p] of [['usual-rate@1', 0.21], ['signal-model@1', 0.31]] as const) {
      appendForecast({ forecaster, questionId: q.id, week: '2026-W41', question: q.text, rule: q.rule,
        windowStart: '2026-10-05T00:30:00.000Z', windowEnd: '2026-10-12T00:00:00.000Z',
        issuedAt: '2026-10-05T00:30:00.000Z', probability: p, inputsHash: 'x',
        explanation: forecaster === 'signal-model@1' ? { probability: p, usual: 0.21, reasons: [], text: 'why' } : null });
    }
    const v = forecastAdminView(Date.parse('2026-10-06T00:00:00Z'), { minPairEvents: 1 });
    expect(v.week).toBe('2026-W41');
    expect(v.issued).toEqual([{ questionId: q.id, question: q.text, usual: 0.21, persistence: null, model: 0.31, why: 'why' }]);
    const html = renderToStaticMarkup(createElement(ForecastPanel, { view: v }));
    expect(html).toContain(q.text);
    expect(html).toContain('31%');
  });
});

describe('the preview', () => {
  it('forecasts the next 7 days for every question without writing anything', () => {
    const inc = incident('CHN', 'IND', '2026-09-28T09:00:00.000Z');
    db.upsertArticles([...Array.from({ length: 3 }, () => art({ publishedAt: '2026-09-27T00:00:00.000Z' })), ...inc.articles]);
    db.replaceEvents([inc.event]);
    const before = { forecasts: allForecasts().length,
      signals: (db.getDb().prepare('SELECT COUNT(*) AS n FROM forecast_signals').get() as { n: number }).n };
    const p = previewForecasts(now, { minPairEvents: 1 });
    expect(p.rows.map((r) => r.questionId)).toEqual(expect.arrayContaining(['incident:CHN-IND', 'beijing:any']));
    const chnInd = p.rows.find((r) => r.questionId === 'incident:CHN-IND')!;
    expect(chnInd.model).toBeGreaterThan(0);
    expect(chnInd.why).toMatch(/^\d+%\. The usual rate for China–India is /);
    expect(allForecasts()).toHaveLength(before.forecasts);
    expect((db.getDb().prepare('SELECT COUNT(*) AS n FROM forecast_signals').get() as { n: number }).n).toBe(before.signals);
    const v = forecastAdminView(now, { minPairEvents: 1 });
    expect(renderToStaticMarkup(createElement(ForecastPanel, { view: v }))).toContain('Preview: the next 7 days');
  });
});

describe('the preview is computed by the hourly cycle, so the admin page only reads it', () => {
  it('stores the preview at cycle time and serves that one', async () => {
    const { runForecastCycle } = await import('@/lib/forecast/schedule');
    const at = Date.parse('2026-10-01T02:30:00Z');
    runForecastCycle(at, { budgetMs: -1, minPairEvents: 1 });
    const v = forecastAdminView(Date.parse('2026-10-01T03:10:00Z'), { minPairEvents: 1 });
    expect(v.preview.asOf).toBe('2026-10-01T02:30:00.000Z');
    expect(v.preview.rows.length).toBeGreaterThan(0);
  });
});

describe('scores too thin to mean anything', () => {
  it('shows "too few to score" instead of a Brier score below 30 forecasts', async () => {
    const { ScoreCells } = await import('@/components/ForecastPanel');
    const thin = { n: 1, brier: { model: 0.01, usual: 0.01, persistence: 0.25 }, skill: 0, calibration: [] };
    const html = renderToStaticMarkup(createElement('table', null, createElement('tbody', null,
      createElement('tr', null, createElement(ScoreCells, { s: thin }))))) ;
    expect(html).toContain('too few to score');
    expect(html).not.toContain('0.010');
    const enough = { ...thin, n: 30 };
    expect(renderToStaticMarkup(createElement('table', null, createElement('tbody', null,
      createElement('tr', null, createElement(ScoreCells, { s: enough })))))).toContain('0.010');
  });
});
