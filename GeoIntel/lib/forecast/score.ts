import { FORECASTERS, type QuestionKind } from '@/lib/forecast/types';

export interface Scored { forecaster: string; kind: QuestionKind; questionId: string; week: string; p: number; y: 0 | 1 }

/** Mean squared gap between probability and outcome; 0 is perfect. Null with nothing to score. */
export function brier(xs: { p: number; y: number }[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + (x.p - x.y) ** 2, 0) / xs.length : null;
}

export const BANDS: [number, number][] = [[0, 0.1], [0.1, 0.2], [0.2, 0.35], [0.35, 0.5], [0.5, 1]];
export interface Band { lo: number; hi: number; n: number; meanP: number | null; observed: number | null }

export function calibration(xs: { p: number; y: number }[]): Band[] {
  return BANDS.map(([lo, hi]) => {
    const inBand = xs.filter((x) => x.p >= lo && (x.p < hi || (hi === 1 && x.p <= 1)));
    const avg = (f: (x: { p: number; y: number }) => number) =>
      inBand.length ? inBand.reduce((s, x) => s + f(x), 0) / inBand.length : null;
    return { lo, hi, n: inBand.length, meanP: avg((x) => x.p), observed: avg((x) => x.y) };
  });
}

/** 1 − model ÷ baseline: above 0 is better than the baseline. */
export function skill(model: number | null, base: number | null): number | null {
  return model === null || base === null || base === 0 ? null : 1 - model / base;
}

export interface Summary {
  n: number;
  brier: { model: number | null; usual: number | null; persistence: number | null };
  skill: number | null;
  calibration: Band[];
}

export function summarise(scored: Scored[], kind: QuestionKind): Summary {
  const of = (f: string) => scored.filter((s) => s.kind === kind && s.forecaster === f);
  const model = of(FORECASTERS.model);
  const b = { model: brier(model), usual: brier(of(FORECASTERS.usual)), persistence: brier(of(FORECASTERS.persistence)) };
  return { n: model.length, brier: b, skill: skill(b.model, b.usual), calibration: calibration(model) };
}

export const GO_LIVE = { minWeeks: 6, minForecasts: 150, bandMin: 20, bandTolerance: 0.15, trailingWeeks: 8 } as const;

export interface GoLive extends Summary { kind: QuestionKind; live: boolean; weeks: number; needs: string[] }

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const beats = (b: Summary['brier']) =>
  b.model !== null && b.usual !== null && b.persistence !== null && b.model < b.usual && b.model < b.persistence;

/** Whether signal-model@1 has earned a place in front of readers for this kind. Live forecasts only. */
export function goLiveStatus(scored: Scored[], kind: QuestionKind): GoLive {
  const all = summarise(scored, kind);
  const weeks = [...new Set(scored.filter((s) => s.kind === kind && s.forecaster === FORECASTERS.model).map((s) => s.week))].sort();
  const needs: string[] = [];
  if (weeks.length < GO_LIVE.minWeeks) needs.push(plural(GO_LIVE.minWeeks - weeks.length, 'more settled week'));
  if (all.n < GO_LIVE.minForecasts) needs.push(plural(GO_LIVE.minForecasts - all.n, 'more settled forecast'));
  if (!beats(all.brier)) needs.push('a lower Brier score than both baselines');
  const off = all.calibration.filter((b) => b.n >= GO_LIVE.bandMin
    && Math.abs((b.observed ?? 0) - (b.meanP ?? 0)) > GO_LIVE.bandTolerance);
  if (off.length) {
    needs.push(`calibration within ±15 points in ${off.map((b) => `${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}%`).join(', ')}`);
  }
  if (!needs.length) {
    const trailing = new Set(weeks.slice(-GO_LIVE.trailingWeeks));
    if (!beats(summarise(scored.filter((s) => trailing.has(s.week)), kind).brier)) {
      needs.push('a lower Brier score than both baselines over the last 8 weeks');
    }
  }
  return { ...all, kind, live: needs.length === 0, weeks: weeks.length, needs };
}
