import { everyArticle, everyEvent, getMeta } from '@/lib/db';
import { walkForward } from '@/lib/forecast/backtest';
import { beijingQuestions, incidentQuestions } from '@/lib/forecast/geo/questions';
import { liveCorpus } from '@/lib/forecast/geo/signals';
import { allForecasts, chainHeads, forecastsForWeek, type ChainHeads, type LedgerCheck } from '@/lib/forecast/ledger';
import { previewFrom, type Preview } from '@/lib/forecast/schedule';
import { goLiveStatus, summarise, type GoLive, type Summary } from '@/lib/forecast/score';
import { liveScored, reconstructionStatus, trainingHistory, type ReconStatus } from '@/lib/forecast/store';
import { FORECASTERS, type QuestionKind } from '@/lib/forecast/types';

export interface AdminForecast {
  questionId: string; question: string;
  usual: number | null; persistence: number | null; model: number | null; why: string | null;
}


export type { Preview };

export interface ForecastAdminView {
  /** The latest week with forecasts, or null before the first. */
  week: string | null;
  issued: AdminForecast[];
  preview: Preview;
  live: Record<QuestionKind, GoLive>;
  backtest: Record<QuestionKind, Summary>;
  ledger: { check: (LedgerCheck & { at: string }) | null; heads: ChainHeads };
  skipped: string[];
  reconstruction: ReconStatus;
  historyWeeks: number;
}

/** The preview computed now (the cycle normally stores one each hour; see previewFrom). Writes nothing. */
export function previewForecasts(now = Date.now(), opts: { minPairEvents?: number } = {}): Preview {
  const live = liveCorpus(everyEvent(), everyArticle());
  return previewFrom(live, [...incidentQuestions(live.events, opts.minPairEvents), ...beijingQuestions(live.articles, now)], now);
}

export function forecastAdminView(now = Date.now(), opts: { minPairEvents?: number } = {}): ForecastAdminView {
  const week = allForecasts().reduce<string | null>((w, f) => (w === null || f.week > w ? f.week : w), null);
  const rows = new Map<string, AdminForecast>();
  for (const f of week ? forecastsForWeek(week) : []) {
    const r = rows.get(f.questionId) ?? { questionId: f.questionId, question: f.question, usual: null, persistence: null, model: null, why: null };
    if (f.forecaster === FORECASTERS.usual) r.usual = f.probability;
    if (f.forecaster === FORECASTERS.persistence) r.persistence = f.probability;
    if (f.forecaster === FORECASTERS.model) { r.model = f.probability; r.why = f.explanation?.text ?? null; }
    rows.set(f.questionId, r);
  }
  const scored = liveScored();
  const history = trainingHistory();
  const backtest = walkForward(history);
  const check = getMeta('forecast_ledger');
  const storedPreview = getMeta('forecast_preview');
  return {
    week,
    issued: [...rows.values()],
    preview: storedPreview ? JSON.parse(storedPreview) : previewForecasts(now, opts),
    live: { incident: goLiveStatus(scored, 'incident'), beijing: goLiveStatus(scored, 'beijing') },
    backtest: { incident: summarise(backtest, 'incident'), beijing: summarise(backtest, 'beijing') },
    ledger: { check: check ? JSON.parse(check) : null, heads: chainHeads() },
    skipped: JSON.parse(getMeta('forecast_skipped_weeks') ?? '[]'),
    reconstruction: reconstructionStatus(),
    historyWeeks: new Set(history.map((h) => h.week)).size,
  };
}
