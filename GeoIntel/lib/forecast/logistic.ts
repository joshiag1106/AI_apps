import { SIGNAL_NAMES, type QuestionKind, type Signals } from '@/lib/forecast/types';

/** L2 penalty on the standardised weights (and the intercept): with little data, stay near the usual rate. */
export const LAMBDA = 1;
/**
 * Below this many "yes" examples a kind's model is not fitted and forecasts the usual rate: the standard
 * guideline of about ten events per signal for logistic regression. With the first backtest (2026-09-30: 26
 * incident positives, 9 signals) a model fitted on 10 overfitted and lost to both baselines.
 */
export const MIN_POSITIVES = 10 * SIGNAL_NAMES.length;
const P_MIN = 0.01;
const P_MAX = 0.99;

export const clip = (p: number) => Math.min(P_MAX, Math.max(P_MIN, p));
export const logit = (p: number) => Math.log(clip(p) / (1 - clip(p)));
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export interface Model {
  kind: QuestionKind;
  /** False when there were too few positives: every weight 0, so the forecast is the usual rate. */
  fitted: boolean;
  positives: number;
  n: number;
  means: number[];
  sds: number[];
  intercept: number;
  /** One per SIGNAL_NAMES entry, on standardised signals. */
  weights: number[];
}

export interface TrainingRow { signals: Signals; offset: number; outcome: 0 | 1 }

const vec = (s: Signals) => SIGNAL_NAMES.map((k) => s[k]);

/** Solve A·x = b by Gaussian elimination with partial pivoting. A is small and positive definite here. */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    [M[c], M[pivot]] = [M[pivot], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** L2-penalised logistic regression with a per-row offset, fitted by Newton's method (IRLS). */
export function fitModel(kind: QuestionKind, rows: TrainingRow[], lambda = LAMBDA, iterations = 50): Model {
  const k = SIGNAL_NAMES.length;
  const X = rows.map((r) => vec(r.signals));
  const positives = rows.reduce((s, r) => s + r.outcome, 0);
  const means = SIGNAL_NAMES.map((_, j) => (X.length ? X.reduce((s, x) => s + x[j], 0) / X.length : 0));
  const sds = SIGNAL_NAMES.map((_, j) => {
    if (X.length < 2) return 1;
    const v = X.reduce((s, x) => s + (x[j] - means[j]) ** 2, 0) / (X.length - 1);
    return v > 1e-12 ? Math.sqrt(v) : 1;
  });
  const unfitted: Model = { kind, fitted: false, positives, n: rows.length, means, sds, intercept: 0,
    weights: new Array<number>(k).fill(0) };
  if (positives < MIN_POSITIVES) return unfitted;

  const Z = X.map((x) => [1, ...x.map((v, j) => (v - means[j]) / sds[j])]);
  let w = new Array<number>(k + 1).fill(0);
  for (let it = 0; it < iterations; it++) {
    const H = Array.from({ length: k + 1 }, (_, i) => Array.from({ length: k + 1 }, (__, j) => (i === j ? lambda : 0)));
    const g = w.map((wi) => -lambda * wi);
    Z.forEach((z, r) => {
      const p = sigmoid(rows[r].offset + z.reduce((s, zi, i) => s + zi * w[i], 0));
      const weight = p * (1 - p);
      for (let i = 0; i <= k; i++) {
        g[i] += z[i] * (rows[r].outcome - p);
        for (let j = 0; j <= k; j++) H[i][j] += weight * z[i] * z[j];
      }
    });
    const step = solve(H, g);
    w = w.map((wi, i) => wi + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-12) break;
  }
  return { ...unfitted, fitted: true, intercept: w[0], weights: w.slice(1) };
}

export function predict(m: Model, usual: number, s: Signals): number {
  // Unfitted means "the usual rate", exactly: no round trip through logit and back.
  if (!m.fitted) return clip(usual);
  const z = vec(s).map((v, j) => (v - m.means[j]) / m.sds[j]);
  return clip(sigmoid(logit(usual) + m.intercept + z.reduce((sum, zi, j) => sum + zi * m.weights[j], 0)));
}

export interface Reason { signal: keyof Signals; value: number; points: number; words: string }
export interface Explanation { probability: number; usual: number; reasons: Reason[]; text: string }

const pct = (p: number) => `${Math.round(p * 100)}%`;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function words(k: keyof Signals, v: number): string {
  switch (k) {
    case 'incidents7': return `${plural(v, 'incident')} in the last week`;
    case 'incidents28': return `${plural(v, 'incident')} in the last 4 weeks`;
    case 'tension': return `tension at ${Math.round(v)}`;
    case 'tensionChange7': return v >= 0 ? `tension rising (+${Math.round(v)} in a week)` : `tension easing (${Math.round(v)} in a week)`;
    case 'surge': return `reporting ${v.toFixed(1)}× normal`;
    case 'escWeight7': return `escalation weight ${Math.round(v)} this week`;
    case 'beijing7': return `${plural(v, 'Beijing statement')} in the last week`;
    case 'beijing28': return `${plural(v, 'Beijing statement')} in the last 4 weeks`;
    case 'beijingMaxRung28': return `Beijing's highest rung ${v}`;
  }
}

/**
 * The forecast in plain words. A reason's points are the forecast minus the forecast with that signal at its
 * training average; reasons under one point are left out, and the points need not sum to the gap.
 */
export function explain(m: Model, usual: number, s: Signals, label: string,
  basis?: { weeks: number; pooled: number }): Explanation {
  const probability = predict(m, usual, s);
  // While a question has under half a year of history, say how little stands behind its usual rate.
  const rate = `The usual rate for ${label} is ${pct(usual)}`
    + (basis && basis.weeks < 26 ? ` (from ${plural(basis.weeks, 'week')} of history, drawn toward the ${pct(basis.pooled)} average)` : '');
  if (!m.fitted) {
    // No weights to attribute: say what is happening this week, as observations rather than effects.
    const notes = [
      s.incidents7 > 0 ? words('incidents7', s.incidents7) : null,
      s.surge >= 1.5 ? words('surge', s.surge) : null,
      Math.abs(s.tensionChange7) >= 5 ? words('tensionChange7', s.tensionChange7) : null,
      s.beijing7 > 0 ? words('beijing7', s.beijing7) : null,
    ].filter((n): n is string => n !== null);
    const text = `${pct(probability)}. ${rate}.`
      + (notes.length ? ` Too little history yet to weigh this week's signals, which are: ${notes.join('; ')}.` : '');
    return { probability, usual, reasons: [], text };
  }
  const reasons: Reason[] = [];
  SIGNAL_NAMES.forEach((name, j) => {
    const points = Math.round(100 * (probability - predict(m, usual, { ...s, [name]: m.means[j] })));
    if (Math.abs(points) >= 1) reasons.push({ signal: name, value: s[name], points, words: words(name, s[name]) });
  });
  reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const tail = reasons.map((r) => `${r.words} (${r.points > 0 ? '+' : '−'}${Math.abs(r.points)})`).join('; ');
  const text = `${pct(probability)}. ${rate}${tail ? `; ${tail}` : ''}.`;
  return { probability, usual, reasons, text };
}
