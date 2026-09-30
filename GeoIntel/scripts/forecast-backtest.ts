/**
 * Walk-forward backtest of the three forecasters on reconstructed history. It WRITES forecast_signals rows,
 * so point KAUTILYA_DB at a copy of the database:
 *
 *   cp kautilya.db /tmp/kautilya-backtest.db && KAUTILYA_DB=/tmp/kautilya-backtest.db npm run forecast:backtest
 */
import { everyArticle } from '@/lib/db';
import { clusterArticles } from '@/lib/verify/cluster';
import { liveCorpus } from '@/lib/forecast/geo/signals';
import { reconstructStep, trainingHistory } from '@/lib/forecast/store';
import { walkForward } from '@/lib/forecast/backtest';
import { summarise } from '@/lib/forecast/score';

if (!process.env.KAUTILYA_DB) {
  console.error('Set KAUTILYA_DB to a COPY of the database — this script writes to it.');
  process.exit(1);
}

const now = Date.now();
const articles = everyArticle();
// Labels come from today's full clustering of every stored article, as the live settlement would see them.
const live = liveCorpus(clusterArticles(articles), articles);
while (!reconstructStep(now, 600_000, live).done) { /* one slice at a time */ }

const history = trainingHistory();
const weeks = [...new Set(history.map((h) => h.week))].sort();
console.log(`history: ${history.length} question-weeks over ${weeks.length} weeks (${weeks[0]} … ${weeks.at(-1)})`);
for (const kind of ['incident', 'beijing'] as const) {
  const rows = history.filter((h) => h.kind === kind);
  console.log(`  ${kind}: ${rows.length} rows, ${rows.filter((r) => r.outcome).length} yes, ${new Set(rows.map((r) => r.questionId)).size} questions`);
}

const scored = walkForward(history);
const f = (x: number | null) => (x === null ? '  —  ' : x.toFixed(4));
for (const kind of ['incident', 'beijing'] as const) {
  const s = summarise(scored, kind);
  console.log(`\n${kind}: ${s.n} backtest forecasts`);
  console.log(`  Brier  signal model ${f(s.brier.model)} | usual rate ${f(s.brier.usual)} | same as last week ${f(s.brier.persistence)}`);
  console.log(`  skill vs usual rate: ${s.skill === null ? '—' : s.skill.toFixed(3)}`);
  for (const b of s.calibration) {
    console.log(`  ${String(Math.round(b.lo * 100)).padStart(2)}–${String(Math.round(b.hi * 100)).padEnd(3)}% n=${String(b.n).padStart(4)}  said ${b.meanP === null ? ' — ' : (b.meanP * 100).toFixed(0).padStart(3)}%  happened ${b.observed === null ? ' — ' : (b.observed * 100).toFixed(0).padStart(3)}%`);
  }
}
