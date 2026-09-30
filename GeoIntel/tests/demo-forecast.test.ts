import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ForecastScene } from '@/components/demo/scenes/ForecastScene';
import { renderScene } from '@/components/demo/scenes';
import { selectForecast } from '@/lib/demo/select';
import { buildDemoScript } from '@/lib/demo/script';
import { fallbacks, input, richInput } from './fixtures/demo-fixtures';

/**
 * Chapter 11, "A forecast you can check": the method and the live state of the record. It must never
 * show a forecast's probability — readers see forecasts only once the record shows they beat the
 * baselines (docs/specs/2026-09-30-predictive-intelligence-design.md), and the tour is seen by readers.
 */
describe('the forecast chapter', () => {
  it('reads the record: nothing recorded yet, and when the first week begins', () => {
    expect(selectForecast(input()).status)
      .toBe('No forecasts recorded yet · the first recorded week begins Monday 5 October · record intact');
  });

  it('counts recorded and settled question-weeks once there are some', () => {
    const f = { recorded: 72, settled: 36, intact: true, firstWeekStart: '2026-10-05T00:00:00.000Z' };
    expect(selectForecast(input({ forecast: f })).status).toBe('72 questions forecast, 36 settled · record intact');
  });

  it('says so if the record chain is broken, or not yet checked', () => {
    const base = { recorded: 0, settled: 0, firstWeekStart: '2026-10-05T00:00:00.000Z' };
    expect(selectForecast(input({ forecast: { ...base, intact: false } })).status).toMatch(/record chain broken$/);
    expect(selectForecast(input({ forecast: { ...base, intact: null } })).status).toMatch(/record not yet checked$/);
  });

  it('shows a real question, the three steps in order, and the status — and no probability', () => {
    const data = selectForecast(input());
    const out = renderToStaticMarkup(createElement(ForecastScene, { data }));
    expect(out).toContain('Will a corroborated military incident between China and India begin in the next 7 days?');
    const order = ['Recorded', 'Settled', 'Scored', 'Shown to readers only once it beats both'].map((s) => out.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out).toContain(data.status);
    expect(out).not.toMatch(/\d+\s*%/);
  });

  it('is in the tour, live, right after Ask', () => {
    const s = buildDemoScript(richInput(), fallbacks());
    const ids = s.chapters.map((c) => c.id);
    expect(ids.indexOf('forecast')).toBe(ids.indexOf('ask') + 1);
    const c = s.chapters.find((x) => x.id === 'forecast')!;
    expect(c.source).toEqual({ kind: 'live' });
    expect(renderToStaticMarkup(createElement('div', null, renderScene(c)))).toContain('Recorded');
  });
});
