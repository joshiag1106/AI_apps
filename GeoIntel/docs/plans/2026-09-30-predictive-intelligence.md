# Predictive intelligence — release 1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Weekly, recorded, automatically settled and scored forecasts of corroborated military incidents and
Beijing ladder statements, with an admin view and a weekly sealed-envelope email — release 1 of the spec
(reader surfaces follow in a second plan before the earliest go-live).

**Architecture:** A subject-neutral `lib/forecast/` (time helpers, baselines, logistic model, scoring,
backtest, tamper-evident record, snapshot store, weekly cycle, envelope, admin view) and a geopolitics-specific
`lib/forecast/geo/` (questions, settlement rules, signals). The ingest runs the weekly cycle after
`maintainCorpus`, beside the alerts, and a forecasting failure never fails the ingest.

**Tech Stack:** TypeScript, Next.js 15 app router, `node:sqlite`, vitest, `nodemailer` (already a dependency).
No new dependencies.

**Spec:** `docs/specs/2026-09-30-predictive-intelligence-design.md`

## Global Constraints

- Questions are issued **once a week**; a question-week is the ISO week of its Monday (`2026-W41`).
- Incident questions: pairs with **≥ 100 stored events**. An incident counts if an event was **first seen
  inside the window**, has domain **Military**, names **both** states, escalation **≥ 10**, confidence
  **≥ 30**, and **≥ 2 distinct outlets**.
- Beijing questions: every state targeted by a `prc` ladder statement in the trailing **90 days**, plus
  `beijing:any`. A statement counts if `ladderSpeaker = 'prc'`, a rung is set, and the target matches (`any`:
  any target or none).
- Settlement **72 hours** after the window ends. Window = **issue time → next Monday 00:00 UTC**. A week whose
  first chance to issue is **more than 24 hours** after Monday 00:00 UTC is **skipped**.
- Forecasters, exactly: `usual-rate@1`, `same-as-last-week@1`, `signal-model@1`.
- `usual-rate`: `(yes + 4 × pooled) / (weeks + 4)` over up to **52** weeks. `signal-model`: offset
  `logit(usual)`, standardised signals, **L2 λ = 1**, Newton/IRLS, one model per question kind, refitted every
  Monday, **all weights 0 with fewer than 10 positives**. All probabilities clipped to **[0.01, 0.99]**.
- Go-live: **≥ 6 settled weeks**, **≥ 150 settled forecasts**, Brier **below both baselines**, every
  calibration band with **≥ 20** forecasts within **±15 points**; withdrawn if not below both baselines over the
  trailing **8** settled weeks. Bands: 0–10%, 10–20%, 20–35%, 35–50%, 50–100%. Live forecasts only.
- Reconstruction: Mondays only, in slices of at most **60 seconds** per ingest; reconstructed rows are never
  used for the live record or go-live.
- `forecasts` and `outcomes` are append-only (triggers) and hash-chained (SHA-256 over canonical JSON and the
  previous hash; genesis = 64 zeros). `forecast_signals` is never pruned.
- Tests set `process.env.KAUTILYA_DB` to a temp file before any `@/lib/db` import, as every DB test here does.
- The runtime is Node 24; `node:sqlite` accepts bare named parameters (`{ id }` for `@id`).

---

## File map

| File | Responsibility |
|---|---|
| `lib/forecast/types.ts` | Shared types, forecaster names, `SIGNAL_NAMES`, `kindOf` |
| `lib/forecast/time.ts` | `mondayStart`, `weekId`, `isoDay`, `HOUR`/`DAY`/`WEEK`/`GRACE_MS` |
| `lib/forecast/geo/settle.ts` | Settlement rules: `incidentRule`, `beijingRule`, `qualifyingIncidents`, `beijingStatements`, `settle` |
| `lib/forecast/geo/questions.ts` | `incidentQuestions`, `beijingQuestions`, `questionFromId` |
| `lib/forecast/geo/signals.ts` | `liveCorpus`, `corpusAsOf`, `tensionOf`, `signalsFor` |
| `lib/forecast/baselines.ts` | `usualRate`, `pooledRate`, `lastWeekYes`, `sameAsLastWeek` |
| `lib/forecast/logistic.ts` | `clip`, `logit`, `sigmoid`, `solve`, `fitModel`, `predict`, `explain` |
| `lib/forecast/score.ts` | `brier`, `calibration`, `skill`, `summarise`, `goLiveStatus` |
| `lib/forecast/backtest.ts` | `trainingRows`, `walkForward` |
| `lib/forecast/ledger.ts` | `canonical`, `entryHash`, `appendForecast`, `appendOutcome`, reads, `verifyLedger`, `chainHeads` |
| `lib/forecast/store.ts` | `forecast_signals` I/O, `snapshotLive`, `reconstructStep`, `labelPending`, `trainingHistory`, `liveScored` |
| `lib/forecast/schedule.ts` | `issueWeek`, `settleDue`, `runForecastCycle`, `engineVersion` |
| `lib/forecast/envelope.ts` | `renderEnvelope`, `sendEnvelope` |
| `lib/forecast/admin.ts` | `forecastAdminView` |
| `components/ForecastPanel.tsx` | The admin section |
| `lib/db/index.ts` | Three tables, triggers; export `tx` |
| `lib/ingest/pipeline.ts` | Call the cycle after alerts |
| `app/admin/page.tsx` | Render `ForecastPanel` |
| `scripts/forecast-backtest.ts`, `package.json` | The walk-forward backtest |
| `tests/fixtures/forecast.ts` | `art`, `ev`, `corpusOf`, `T` test builders |

---

### Task 1: Types, time helpers and test fixtures

**Files:**
- Create: `lib/forecast/types.ts`, `lib/forecast/time.ts`, `tests/fixtures/forecast.ts`
- Test: `tests/forecast-time.test.ts`

**Interfaces:**
- Produces: every type in `types.ts`; `HOUR`, `DAY`, `WEEK`, `GRACE_MS`, `mondayStart(ms)`, `weekId(ms)`,
  `isoDay(ms)`; fixtures `art(p)`, `ev(p)`, `corpusOf(events, articles)`, `T(iso)`.

- [ ] **Step 1: Write `lib/forecast/types.ts`** (types only — nothing to test on its own)

```ts
import type { Article, GeoEvent } from '@/lib/types';

/**
 * Predictive intelligence — see docs/specs/2026-09-30-predictive-intelligence-design.md.
 * Everything under lib/forecast/ except lib/forecast/geo/ is subject-neutral.
 */
export type QuestionKind = 'incident' | 'beijing';

export interface IncidentRule {
  kind: 'incident';
  /** Sorted ISO3 pair. The signal scope 'China with anyone' uses ['CHN', '*']. */
  states: [string, string];
  domain: 'Military';
  minEscalation: number;
  minConfidence: number;
  minOutlets: number;
  graceHours: number;
}

export interface BeijingRule {
  kind: 'beijing';
  /** ISO3 of the state a statement is aimed at, or 'any'. */
  target: string;
  graceHours: number;
}

export type SettlementRule = IncidentRule | BeijingRule;

export interface Question {
  id: string;
  kind: QuestionKind;
  /** The question in words, as recorded. */
  text: string;
  /** Short subject for explanations: 'China–India', 'Beijing toward Japan', 'Beijing'. */
  label: string;
  rule: SettlementRule;
}

/** A forecast window, epoch ms: start inclusive, end exclusive. */
export interface Window { start: number; end: number }

export interface Signals {
  incidents7: number;
  incidents28: number;
  tension: number;
  tensionChange7: number;
  surge: number;
  escWeight7: number;
  beijing7: number;
  beijing28: number;
  beijingMaxRung28: number;
}

export const SIGNAL_NAMES = [
  'incidents7', 'incidents28', 'tension', 'tensionChange7', 'surge',
  'escWeight7', 'beijing7', 'beijing28', 'beijingMaxRung28',
] as const satisfies readonly (keyof Signals)[];

export interface Evidence { id: string; title: string; outlets: string[]; urls: string[]; date: string }

export interface Settlement { outcome: 0 | 1; evidence: Evidence[] }

/** One past question-week: the signals at its start and what happened. */
export interface HistoryRow {
  questionId: string;
  kind: QuestionKind;
  week: string;
  signals: Signals;
  outcome: 0 | 1;
}

/** Everything the rules read, as of one moment. */
export interface Corpus {
  events: GeoEvent[];
  articles: Article[];
  /** Article id -> outlet name. */
  outlets: Map<string, string>;
}

export const FORECASTERS = {
  usual: 'usual-rate@1',
  persistence: 'same-as-last-week@1',
  model: 'signal-model@1',
} as const;

export function kindOf(questionId: string): QuestionKind {
  return questionId.startsWith('beijing:') ? 'beijing' : 'incident';
}
```

- [ ] **Step 2: Write the failing test `tests/forecast-time.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { DAY, isoDay, mondayStart, weekId } from '@/lib/forecast/time';

const T = (iso: string) => Date.parse(iso);

describe('forecast weeks', () => {
  it('finds Monday 00:00 UTC of any moment in the week', () => {
    expect(mondayStart(T('2026-09-30T12:00:00Z'))).toBe(T('2026-09-28T00:00:00Z'));
    expect(mondayStart(T('2026-09-28T00:00:00Z'))).toBe(T('2026-09-28T00:00:00Z'));
    expect(mondayStart(T('2026-10-04T23:59:59Z'))).toBe(T('2026-09-28T00:00:00Z'));
  });

  it('names weeks by ISO-8601, including the 53rd week of 2026', () => {
    expect(weekId(T('2026-09-30T12:00:00Z'))).toBe('2026-W40');
    expect(weekId(T('2026-10-05T00:00:00Z'))).toBe('2026-W41');
    expect(weekId(T('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    expect(weekId(T('2027-01-04T00:00:00Z'))).toBe('2027-W01');
  });

  it('gives the UTC calendar day', () => {
    expect(isoDay(T('2026-09-30T23:59:00Z'))).toBe('2026-09-30');
    expect(isoDay(T('2026-09-30T00:00:00Z') + DAY)).toBe('2026-10-01');
  });
});
```

- [ ] **Step 3: Run it — expect FAIL** (`Cannot find module '@/lib/forecast/time'`)

Run: `npx vitest run tests/forecast-time.test.ts`

- [ ] **Step 4: Write `lib/forecast/time.ts`**

```ts
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
/** How long after a window ends before its question is settled. */
export const GRACE_MS = 72 * HOUR;

/** Monday 00:00 UTC of the week containing `ms`. */
export function mondayStart(ms: number): number {
  const d = new Date(ms);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return midnight - sinceMonday * DAY;
}

/** ISO-8601 week of `ms`, e.g. '2026-W41'. A week belongs to the year of its Thursday. */
export function weekId(ms: number): string {
  const monday = mondayStart(ms);
  const year = new Date(monday + 3 * DAY).getUTCFullYear();
  const weekOne = mondayStart(Date.UTC(year, 0, 4)); // 4 January is always in week 1
  const week = 1 + Math.round((monday - weekOne) / WEEK);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** UTC calendar day of `ms`, 'YYYY-MM-DD'. */
export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
```

- [ ] **Step 5: Run it — expect PASS (3 tests)**

Run: `npx vitest run tests/forecast-time.test.ts`

- [ ] **Step 6: Write `tests/fixtures/forecast.ts`** (builders shared by every forecast test)

```ts
import type { Article, GeoEvent } from '@/lib/types';
import type { Corpus } from '@/lib/forecast/types';

let n = 0;

export const T = (iso: string) => Date.parse(iso);

export function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `fa${n}`, url: `https://example.test/a/${n}`, title: `Report ${n}`, outlet: `Outlet ${n}`,
    publishedAt: '2026-09-28T06:00:00.000Z', snippet: '', imageUrl: null, language: 'en',
    beatId: null, localeKey: null, sourceCountry: 'IND', ownership: 'independent', tier: 2,
    isPrimary: false, actors: ['CHN', 'IND'], people: [], hotspots: [], domain: 'Military',
    escalation: 20, framing: 0, ladderRung: null, ladderZh: null, ladderEn: null,
    ladderSpeaker: null, ladderTarget: null, glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}

export function ev(p: Partial<GeoEvent> = {}): GeoEvent {
  n += 1;
  return {
    id: `fe${n}`, title: `Event ${n}`, summary: '',
    firstSeen: '2026-09-28T06:00:00.000Z', lastSeen: '2026-09-28T06:00:00.000Z',
    actors: ['CHN', 'IND'], people: [], hotspots: [], domain: 'Military', escalation: 20, confidence: 40,
    signals: [], flags: [], articleIds: [], languages: ['en'], countries: ['IND'], imageUrl: null, videoId: null,
    ladderRung: null, ladderZh: null, ladderEn: null, ...p,
  };
}

/** A qualifying incident for `a`–`b` first seen at `iso`, with its two reports from two outlets. */
export function incident(a: string, b: string, iso: string, p: Partial<GeoEvent> = {}): { event: GeoEvent; articles: Article[] } {
  const r1 = art({ actors: [a, b], publishedAt: iso, outlet: 'Wire A' });
  const r2 = art({ actors: [a, b], publishedAt: iso, outlet: 'Wire B' });
  return { event: ev({ actors: [a, b], firstSeen: iso, lastSeen: iso, articleIds: [r1.id, r2.id], ...p }), articles: [r1, r2] };
}

export function corpusOf(events: GeoEvent[], articles: Article[]): Corpus {
  return { events, articles, outlets: new Map(articles.map((a) => [a.id, a.outlet])) };
}
```

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no output.

```bash
git add lib/forecast/types.ts lib/forecast/time.ts tests/fixtures/forecast.ts tests/forecast-time.test.ts
git commit -m "Forecasts: shared types, ISO-week time helpers, test fixtures"
```

---

### Task 2: Settlement rules

**Files:**
- Create: `lib/forecast/geo/settle.ts`
- Test: `tests/forecast-settle.test.ts`

**Interfaces:**
- Consumes: `IncidentRule`, `BeijingRule`, `SettlementRule`, `Window`, `Corpus`, `Settlement`, `Evidence` (Task 1).
- Produces: `INCIDENT_THRESHOLDS`, `incidentRule(a, b): IncidentRule`, `beijingRule(target): BeijingRule`,
  `qualifyingIncidents(rule, events, outlets, from, to): GeoEvent[]`,
  `beijingStatements(target, articles, from, to): Article[]`, `settle(rule, window, corpus): Settlement`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { beijingRule, incidentRule, settle } from '@/lib/forecast/geo/settle';
import { art, corpusOf, ev, incident, T } from './fixtures/forecast';

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
```

Save as `tests/forecast-settle.test.ts`.

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module '@/lib/forecast/geo/settle'`)

Run: `npx vitest run tests/forecast-settle.test.ts`

- [ ] **Step 3: Write `lib/forecast/geo/settle.ts`**

```ts
import type { Article, GeoEvent } from '@/lib/types';
import type { BeijingRule, Corpus, Evidence, IncidentRule, Settlement, SettlementRule, Window } from '@/lib/forecast/types';

/**
 * What "it happened" means, fixed when a forecast is made and written into its record entry.
 * One definition serves both settlement and the incident signals (lib/forecast/geo/signals).
 */
export const INCIDENT_THRESHOLDS = { minEscalation: 10, minConfidence: 30, minOutlets: 2, graceHours: 72 } as const;
export const BEIJING_GRACE_HOURS = 72;

export function incidentRule(a: string, b: string): IncidentRule {
  const [x, y] = [a, b].sort();
  return { kind: 'incident', states: [x, y], domain: 'Military', ...INCIDENT_THRESHOLDS };
}

export function beijingRule(target: string): BeijingRule {
  return { kind: 'beijing', target, graceHours: BEIJING_GRACE_HOURS };
}

function outletsOf(e: GeoEvent, outlets: Map<string, string>): string[] {
  return [...new Set(e.articleIds.map((id) => outlets.get(id)).filter((o): o is string => !!o))];
}

/** Events meeting an incident rule and FIRST seen in [from, to). A second state of '*' means any other state. */
export function qualifyingIncidents(
  rule: IncidentRule, events: GeoEvent[], outlets: Map<string, string>, from: number, to: number,
): GeoEvent[] {
  const [a, b] = rule.states;
  return events.filter((e) => {
    const t = Date.parse(e.firstSeen);
    return t >= from && t < to
      && e.domain === rule.domain
      && e.actors.includes(a)
      && (b === '*' ? e.actors.some((x) => x !== a) : e.actors.includes(b))
      && e.escalation >= rule.minEscalation
      && e.confidence >= rule.minConfidence
      && outletsOf(e, outlets).length >= rule.minOutlets;
  });
}

/** Beijing's ladder statements aimed at `target` ('any': at anyone, or at no one named), published in [from, to). */
export function beijingStatements(target: string, articles: Article[], from: number, to: number): Article[] {
  return articles.filter((a) => {
    const t = Date.parse(a.publishedAt);
    return t >= from && t < to && a.ladderSpeaker === 'prc' && a.ladderRung !== null
      && (target === 'any' || a.ladderTarget === target);
  });
}

/** Settle one question-week by its recorded rule, keeping the evidence. */
export function settle(rule: SettlementRule, w: Window, c: Corpus): Settlement {
  if (rule.kind === 'incident') {
    const byId = new Map(c.articles.map((a) => [a.id, a]));
    const hits = qualifyingIncidents(rule, c.events, c.outlets, w.start, w.end);
    const evidence: Evidence[] = hits.map((e) => ({
      id: e.id, title: e.title, outlets: outletsOf(e, c.outlets),
      urls: e.articleIds.map((id) => byId.get(id)?.url).filter((u): u is string => !!u),
      date: e.firstSeen,
    }));
    return { outcome: hits.length ? 1 : 0, evidence };
  }
  const hits = beijingStatements(rule.target, c.articles, w.start, w.end);
  return {
    outcome: hits.length ? 1 : 0,
    evidence: hits.map((a) => ({ id: a.id, title: a.title, outlets: [a.outlet], urls: [a.url], date: a.publishedAt })),
  };
}
```

- [ ] **Step 4: Run it — expect PASS (13 tests)**

Run: `npx vitest run tests/forecast-settle.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/forecast/geo/settle.ts tests/forecast-settle.test.ts
git commit -m "Forecasts: settlement rules for incidents and Beijing statements"
```

---

### Task 3: Questions

**Files:**
- Create: `lib/forecast/geo/questions.ts`
- Test: `tests/forecast-questions.test.ts`

**Interfaces:**
- Consumes: `incidentRule`, `beijingRule` (Task 2); `DAY` (Task 1).
- Produces: `MIN_PAIR_EVENTS = 100`, `incidentQuestion(a, b): Question`, `beijingQuestion(target): Question`,
  `incidentQuestions(events, minEvents?): Question[]`, `beijingQuestions(articles, now, lookbackDays?): Question[]`,
  `questionFromId(id): Question`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

Save as `tests/forecast-questions.test.ts`.

- [ ] **Step 2: Run it — expect FAIL** (module missing)

Run: `npx vitest run tests/forecast-questions.test.ts`

- [ ] **Step 3: Write `lib/forecast/geo/questions.ts`**

```ts
import { BY_ISO } from '@/data/countries';
import type { Article, GeoEvent } from '@/lib/types';
import { beijingRule, incidentRule } from '@/lib/forecast/geo/settle';
import { DAY } from '@/lib/forecast/time';
import type { Question } from '@/lib/forecast/types';

/** A pair is asked about once the corpus holds at least this many events naming both. */
export const MIN_PAIR_EVENTS = 100;

const name = (iso: string) => BY_ISO.get(iso)?.name ?? iso;

export function incidentQuestion(a: string, b: string): Question {
  const rule = incidentRule(a, b);
  const [x, y] = rule.states;
  return {
    id: `incident:${x}-${y}`, kind: 'incident', rule, label: `${name(x)}–${name(y)}`,
    text: `Will a corroborated military incident between ${name(x)} and ${name(y)} begin in the next 7 days?`,
  };
}

export function beijingQuestion(target: string): Question {
  const any = target === 'any';
  return {
    id: `beijing:${target}`, kind: 'beijing', rule: beijingRule(target),
    label: any ? 'Beijing' : `Beijing toward ${name(target)}`,
    text: any
      ? 'Will Beijing make an official escalation-ladder statement in the next 7 days?'
      : `Will Beijing make an official escalation-ladder statement aimed at ${name(target)} in the next 7 days?`,
  };
}

/** Every pair of states named together in at least `minEvents` stored events, in id order. */
export function incidentQuestions(events: GeoEvent[], minEvents = MIN_PAIR_EVENTS): Question[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const actors = [...new Set(e.actors)].sort();
    for (let i = 0; i < actors.length; i++) {
      for (let j = i + 1; j < actors.length; j++) {
        const key = `${actors[i]}-${actors[j]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...counts].filter(([, n]) => n >= minEvents).map(([k]) => k).sort()
    .map((k) => { const [a, b] = k.split('-'); return incidentQuestion(a, b); });
}

/** Every state Beijing aimed a ladder statement at in the `lookbackDays` before `now`, then 'any'. */
export function beijingQuestions(articles: Article[], now: number, lookbackDays = 90): Question[] {
  const from = now - lookbackDays * DAY;
  const targets = new Set<string>();
  for (const a of articles) {
    const t = Date.parse(a.publishedAt);
    if (t >= from && t < now && a.ladderSpeaker === 'prc' && a.ladderRung !== null && a.ladderTarget) {
      targets.add(a.ladderTarget);
    }
  }
  return [...[...targets].sort().map(beijingQuestion), beijingQuestion('any')];
}

export function questionFromId(id: string): Question {
  if (id.startsWith('incident:')) {
    const [a, b] = id.slice('incident:'.length).split('-');
    return incidentQuestion(a, b);
  }
  if (id.startsWith('beijing:')) return beijingQuestion(id.slice('beijing:'.length));
  throw new Error(`unknown question id: ${id}`);
}
```

- [ ] **Step 4: Run it — expect PASS (4 tests)**

Run: `npx vitest run tests/forecast-questions.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/forecast/geo/questions.ts tests/forecast-questions.test.ts
git commit -m "Forecasts: incident and Beijing questions"
```

---

### Task 4: Signals, and the corpus as it stood at a moment

**Files:**
- Create: `lib/forecast/geo/signals.ts`
- Test: `tests/forecast-signals.test.ts`

**Interfaces:**
- Consumes: `incidentRule`, `qualifyingIncidents`, `beijingStatements` (Task 2); `incidentQuestion`,
  `beijingQuestion` (Task 3, tests only); `clusterArticles` (`lib/verify/cluster`); `dyadTension`,
  `countryRisk`, `TREND_SERIES_DAYS` (`lib/risk`).
- Produces: `liveCorpus(events, articles): Corpus`, `corpusAsOf(articles, asOf, retentionDays?): Corpus`,
  `tensionOf(q, corpus, asOf): number`, `signalsFor(q, corpus, asOf, tension7dAgo: number | null): Signals`.

- [ ] **Step 1: Write the failing test**

```ts
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
    expect(s.tension).toBe(tensionOf(chnInd, c, asOf));
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
```

Save as `tests/forecast-signals.test.ts`.

- [ ] **Step 2: Run it — expect FAIL** (module missing)

Run: `npx vitest run tests/forecast-signals.test.ts`

- [ ] **Step 3: Write `lib/forecast/geo/signals.ts`**

```ts
import type { Article, GeoEvent } from '@/lib/types';
import { clusterArticles } from '@/lib/verify/cluster';
import { countryRisk, dyadTension, TREND_SERIES_DAYS } from '@/lib/risk';
import { beijingStatements, incidentRule, qualifyingIncidents } from '@/lib/forecast/geo/settle';
import { DAY, WEEK } from '@/lib/forecast/time';
import type { Corpus, IncidentRule, Question, Signals } from '@/lib/forecast/types';

export function liveCorpus(events: GeoEvent[], articles: Article[]): Corpus {
  return { events, articles, outlets: new Map(articles.map((a) => [a.id, a.outlet])) };
}

/**
 * The corpus as it stood at `asOf`: only reports published before it and within retention, clustered afresh.
 * This is what keeps a reconstructed snapshot from seeing its own future.
 */
export function corpusAsOf(articles: Article[], asOf: number, retentionDays = TREND_SERIES_DAYS): Corpus {
  const from = asOf - retentionDays * DAY;
  const kept = articles.filter((a) => {
    const t = Date.parse(a.publishedAt);
    return t < asOf && t >= from;
  });
  return liveCorpus(clusterArticles(kept), kept);
}

/** Whose signals a question reads: a pair, or 'China with anyone' ('*'); and whom Beijing's statements target. */
interface Scope { a: string; b: string; target: string | null }

function scopeOf(q: Question): Scope {
  if (q.rule.kind === 'incident') {
    const [a, b] = q.rule.states;
    return { a, b, target: a === 'CHN' ? b : b === 'CHN' ? a : null };
  }
  return q.rule.target === 'any'
    ? { a: 'CHN', b: '*', target: 'any' }
    : { a: 'CHN', b: q.rule.target, target: q.rule.target };
}

function scopeRule(s: Scope): IncidentRule {
  return s.b === '*' ? { ...incidentRule(s.a, s.a), states: [s.a, '*'] } : incidentRule(s.a, s.b);
}

/** A question's tension at `asOf`: its pair's dyad tension, or China's composite for 'China with anyone'. */
export function tensionOf(q: Question, c: Corpus, asOf: number): number {
  const s = scopeOf(q);
  return s.b === '*' ? countryRisk(s.a, c.events, asOf).composite : dyadTension(s.a, s.b, c.events, asOf).score;
}

/**
 * One question's signals as of `asOf`. Nothing published after `asOf` is read: events first seen later and
 * articles published later are dropped here too, as a second guard behind corpusAsOf.
 * `tension7dAgo` is the tension in the snapshot a week earlier, or null when there is none.
 */
export function signalsFor(q: Question, c: Corpus, asOf: number, tension7dAgo: number | null): Signals {
  const s = scopeOf(q);
  const rule = scopeRule(s);
  const inScope = (actors: string[]) =>
    actors.includes(s.a) && (s.b === '*' ? actors.some((x) => x !== s.a) : actors.includes(s.b));
  const events = c.events.filter((e) => Date.parse(e.firstSeen) < asOf && inScope(e.actors));
  const articles = c.articles.filter((a) => Date.parse(a.publishedAt) < asOf);
  const reports = (from: number, to: number) => articles.filter((a) => {
    const t = Date.parse(a.publishedAt);
    return t >= from && t < to && inScope(a.actors);
  }).length;
  const tension = tensionOf(q, { ...c, events: c.events.filter((e) => Date.parse(e.firstSeen) < asOf) }, asOf);
  const said28 = s.target ? beijingStatements(s.target, articles, asOf - 4 * WEEK, asOf) : [];

  return {
    incidents7: qualifyingIncidents(rule, events, c.outlets, asOf - WEEK, asOf).length,
    incidents28: qualifyingIncidents(rule, events, c.outlets, asOf - 4 * WEEK, asOf).length,
    tension,
    tensionChange7: tension7dAgo === null ? 0 : tension - tension7dAgo,
    surge: (reports(asOf - WEEK, asOf) + 1) / (reports(asOf - 5 * WEEK, asOf - WEEK) / 4 + 1),
    escWeight7: events
      .filter((e) => { const t = Date.parse(e.lastSeen); return t >= asOf - WEEK && t < asOf; })
      .reduce((sum, e) => sum + Math.max(0, e.escalation) * (e.confidence / 100), 0),
    beijing7: said28.filter((a) => Date.parse(a.publishedAt) >= asOf - WEEK).length,
    beijing28: said28.length,
    beijingMaxRung28: said28.reduce((m, a) => Math.max(m, a.ladderRung ?? 0), 0),
  };
}
```

- [ ] **Step 4: Run it — expect PASS (9 tests)**

Run: `npx vitest run tests/forecast-signals.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/forecast/geo/signals.ts tests/forecast-signals.test.ts
git commit -m "Forecasts: signals, and the corpus as of a moment (no peeking)"
```

---

### Task 5: The two baselines

**Files:**
- Create: `lib/forecast/baselines.ts`
- Test: `tests/forecast-baselines.test.ts`

**Interfaces:**
- Consumes: `HistoryRow`, `QuestionKind`, `Signals` (Task 1).
- Produces: `SHRINK_WEEKS = 4`, `MAX_WEEKS = 52`, `pooledRate(rows, kind)`, `usualRate(rows, questionId, kind)`,
  `lastWeekYes(kind, signals)`, `sameAsLastWeek(rows, kind, signals)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { sameAsLastWeek, usualRate } from '@/lib/forecast/baselines';
import type { HistoryRow, Signals } from '@/lib/forecast/types';

const quiet: Signals = { incidents7: 0, incidents28: 0, tension: 0, tensionChange7: 0, surge: 1,
  escWeight7: 0, beijing7: 0, beijing28: 0, beijingMaxRung28: 0 };
const row = (questionId: string, week: number, outcome: 0 | 1, s: Partial<Signals> = {}): HistoryRow => ({
  questionId, kind: 'incident', week: `2026-W${String(week).padStart(2, '0')}`, outcome, signals: { ...quiet, ...s },
});

describe('usual-rate@1', () => {
  it("shrinks a question's rate toward its kind's pooled rate by 4 weeks", () => {
    const rows = [
      row('incident:A-B', 1, 1), row('incident:A-B', 2, 0), row('incident:A-B', 3, 0), row('incident:A-B', 4, 0),
      row('incident:C-D', 1, 1), row('incident:C-D', 2, 1), row('incident:C-D', 3, 1), row('incident:C-D', 4, 0),
    ];
    // pooled 4/8 = 0.5; A-B: (1 + 4 × 0.5) / (4 + 4)
    expect(usualRate(rows, 'incident:A-B', 'incident')).toBeCloseTo(3 / 8, 12);
  });

  it('reads only the newest 52 weeks of the question', () => {
    // 2025-W01…W52 then 2026-W01…W08: the oldest 8 weeks said yes, the newest 52 said no.
    const weeks = [...Array.from({ length: 52 }, (_, i) => `2025-W${String(i + 1).padStart(2, '0')}`),
      ...Array.from({ length: 8 }, (_, i) => `2026-W${String(i + 1).padStart(2, '0')}`)];
    const rows = weeks.map((week, i): HistoryRow => ({ questionId: 'incident:A-B', kind: 'incident', week,
      outcome: i < 8 ? 1 : 0, signals: quiet }));
    const pooled = 8 / 60;
    expect(usualRate(rows, 'incident:A-B', 'incident')).toBeCloseTo((0 + 4 * pooled) / (52 + 4), 12);
  });

  it('falls back to 10% with no history at all', () => {
    expect(usualRate([], 'incident:A-B', 'incident')).toBeCloseTo(0.1, 12);
  });
});

describe('same-as-last-week@1', () => {
  it('uses the chance after a week with an incident, or after a quiet week, add-one smoothed', () => {
    const rows = [
      row('incident:A-B', 1, 1, { incidents7: 2 }), row('incident:A-B', 2, 1, { incidents7: 1 }),
      row('incident:A-B', 3, 0, { incidents7: 1 }),
      row('incident:A-B', 4, 1), row('incident:A-B', 5, 0), row('incident:A-B', 6, 0),
      row('incident:A-B', 7, 0), row('incident:A-B', 8, 0),
    ];
    expect(sameAsLastWeek(rows, 'incident', { ...quiet, incidents7: 1 })).toBeCloseTo((2 + 1) / (3 + 2), 12);
    expect(sameAsLastWeek(rows, 'incident', quiet)).toBeCloseTo((1 + 1) / (5 + 2), 12);
  });
});
```

Save as `tests/forecast-baselines.test.ts`.

- [ ] **Step 2: Run it — expect FAIL** (module missing)

Run: `npx vitest run tests/forecast-baselines.test.ts`

- [ ] **Step 3: Write `lib/forecast/baselines.ts`**

```ts
import type { HistoryRow, QuestionKind, Signals } from '@/lib/forecast/types';

/** Pseudo-weeks of the pooled rate added to every question, so one lucky week cannot swing a quiet pair. */
export const SHRINK_WEEKS = 4;
export const MAX_WEEKS = 52;
const FALLBACK_RATE = 0.1;

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** A question kind's share of "yes" weeks across every question of that kind. */
export function pooledRate(rows: HistoryRow[], kind: QuestionKind): number {
  const own = rows.filter((r) => r.kind === kind);
  return own.length ? mean(own.map((r) => r.outcome)) : FALLBACK_RATE;
}

/** usual-rate@1: the question's share of "yes" weeks over its newest 52, shrunk toward its kind's pooled rate. */
export function usualRate(rows: HistoryRow[], questionId: string, kind: QuestionKind): number {
  const pooled = pooledRate(rows, kind);
  const own = rows.filter((r) => r.questionId === questionId)
    .sort((a, b) => b.week.localeCompare(a.week)).slice(0, MAX_WEEKS);
  const yes = own.reduce((s, r) => s + r.outcome, 0);
  return (yes + SHRINK_WEEKS * pooled) / (own.length + SHRINK_WEEKS);
}

/**
 * Whether "last week" said yes, read from the signals at the week's start. Last week's own outcome is not
 * settled until 72 hours after it ends, so a Monday forecast cannot wait for it.
 */
export function lastWeekYes(kind: QuestionKind, s: Signals): boolean {
  return kind === 'incident' ? s.incidents7 > 0 : s.beijing7 > 0;
}

/** same-as-last-week@1: P(yes | last week yes) or P(yes | last week quiet), pooled over the kind, add-one smoothed. */
export function sameAsLastWeek(rows: HistoryRow[], kind: QuestionKind, s: Signals): number {
  const want = lastWeekYes(kind, s);
  const match = rows.filter((r) => r.kind === kind && lastWeekYes(kind, r.signals) === want);
  return (match.reduce((sum, r) => sum + r.outcome, 0) + 1) / (match.length + 2);
}
```

- [ ] **Step 4: Run it — expect PASS (4 tests)**

Run: `npx vitest run tests/forecast-baselines.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/forecast/baselines.ts tests/forecast-baselines.test.ts
git commit -m "Forecasts: usual-rate and same-as-last-week baselines"
```

---

### Task 6: The signal model and its explanation

**Files:**
- Create: `lib/forecast/logistic.ts`
- Test: `tests/forecast-logistic.test.ts`

**Interfaces:**
- Consumes: `SIGNAL_NAMES`, `Signals`, `QuestionKind` (Task 1).
- Produces: `LAMBDA`, `MIN_POSITIVES`, `clip(p)`, `logit(p)`, `sigmoid(x)`, `solve(A, b)`,
  `interface Model`, `interface TrainingRow { signals; offset; outcome }`, `fitModel(kind, rows, lambda?)`,
  `predict(model, usual, signals)`, `interface Explanation { probability; usual; reasons; text }`,
  `explain(model, usual, signals, label)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { explain, fitModel, predict, sigmoid, solve, type Model } from '@/lib/forecast/logistic';
import type { Signals } from '@/lib/forecast/types';

const zero: Signals = { incidents7: 0, incidents28: 0, tension: 0, tensionChange7: 0, surge: 0,
  escWeight7: 0, beijing7: 0, beijing28: 0, beijingMaxRung28: 0 };
const row = (s: Partial<Signals>, outcome: 0 | 1, offset = 0) => ({ signals: { ...zero, ...s }, outcome, offset });

describe('the linear solver', () => {
  it('solves a small symmetric system', () => {
    const x = solve([[2, 1], [1, 3]], [3, 5]);
    expect(x[0]).toBeCloseTo(0.8, 12);
    expect(x[1]).toBeCloseTo(1.4, 12);
  });
});

describe('fitModel', () => {
  it('stays exactly at the usual rate with fewer than 10 positives', () => {
    const m = fitModel('beijing', [...Array.from({ length: 9 }, () => row({ beijing7: 1 }, 1)),
      ...Array.from({ length: 30 }, () => row({}, 0))]);
    expect(m.fitted).toBe(false);
    expect(predict(m, 0.3, { ...zero, beijing7: 1 })).toBe(0.3);
    expect(predict(m, 0.001, zero)).toBe(0.01);   // clipped
  });

  it('reaches the optimum of the penalised likelihood (intercept-only check)', () => {
    // Identical signals, offset 0, 12 of 20 yes: the optimum solves 12 − 20·σ(w) − w = 0.
    const m = fitModel('incident', [...Array.from({ length: 12 }, () => row({}, 1)),
      ...Array.from({ length: 8 }, () => row({}, 0))]);
    expect(m.fitted).toBe(true);
    expect(Math.abs(12 - 20 * sigmoid(m.intercept) - m.intercept)).toBeLessThan(1e-9);
  });

  it('learns that recent incidents raise the chance', () => {
    const rows = [
      ...Array.from({ length: 24 }, () => row({ incidents7: 1 }, 1)), ...Array.from({ length: 6 }, () => row({ incidents7: 1 }, 0)),
      ...Array.from({ length: 6 }, () => row({}, 1)), ...Array.from({ length: 24 }, () => row({}, 0)),
    ];
    const m = fitModel('incident', rows);
    expect(m.weights[0]).toBeGreaterThan(0);
    expect(predict(m, 0.5, { ...zero, incidents7: 1 })).toBeGreaterThan(0.6);
    expect(predict(m, 0.5, zero)).toBeLessThan(0.4);
  });

  it('shrinks every weight to nothing under a huge penalty', () => {
    const rows = [...Array.from({ length: 20 }, () => row({ incidents7: 1 }, 1)), ...Array.from({ length: 20 }, () => row({}, 0))];
    const m = fitModel('incident', rows, 1e9);
    expect(Math.max(...m.weights.map(Math.abs), Math.abs(m.intercept))).toBeLessThan(1e-6);
  });
});

describe('explain', () => {
  it('states the chance, the usual rate and each reason worth a point', () => {
    const m: Model = { kind: 'incident', fitted: true, positives: 10, n: 20, intercept: 0,
      means: new Array(9).fill(0), sds: new Array(9).fill(1), weights: [1, 0, 0, 0, 0, 0, 0, 0, 0] };
    const e = explain(m, 0.2, { ...zero, incidents7: 1 }, 'China–India');
    expect(e.probability).toBeCloseTo(0.404608, 5);
    expect(e.text).toBe('40%. The usual rate for China–India is 20%; 1 incident in the last week (+20).');
  });
});
```

Save as `tests/forecast-logistic.test.ts`.

- [ ] **Step 2: Run it — expect FAIL** (module missing)

Run: `npx vitest run tests/forecast-logistic.test.ts`

- [ ] **Step 3: Write `lib/forecast/logistic.ts`**

```ts
import { SIGNAL_NAMES, type QuestionKind, type Signals } from '@/lib/forecast/types';

/** L2 penalty on the standardised weights (and the intercept): with little data, stay near the usual rate. */
export const LAMBDA = 1;
/** Below this many "yes" examples a kind's model is not fitted and forecasts the usual rate. */
export const MIN_POSITIVES = 10;
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
export function explain(m: Model, usual: number, s: Signals, label: string): Explanation {
  const probability = predict(m, usual, s);
  const reasons: Reason[] = [];
  SIGNAL_NAMES.forEach((name, j) => {
    const points = Math.round(100 * (probability - predict(m, usual, { ...s, [name]: m.means[j] })));
    if (Math.abs(points) >= 1) reasons.push({ signal: name, value: s[name], points, words: words(name, s[name]) });
  });
  reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const tail = reasons.map((r) => `${r.words} (${r.points > 0 ? '+' : '−'}${Math.abs(r.points)})`).join('; ');
  const text = `${pct(probability)}. The usual rate for ${label} is ${pct(usual)}${tail ? `; ${tail}` : ''}.`;
  return { probability, usual, reasons, text };
}
```

- [ ] **Step 4: Run it — expect PASS (6 tests)**

Run: `npx vitest run tests/forecast-logistic.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/forecast/logistic.ts tests/forecast-logistic.test.ts
git commit -m "Forecasts: penalised logistic signal model with plain-words explanations"
```

---

### Task 7: Scoring, the go-live rule and the walk-forward backtest

**Files:**
- Create: `lib/forecast/score.ts`, `lib/forecast/backtest.ts`
- Test: `tests/forecast-score.test.ts`

**Interfaces:**
- Consumes: `FORECASTERS`, `HistoryRow`, `QuestionKind` (Task 1); `usualRate`, `sameAsLastWeek` (Task 5);
  `fitModel`, `predict`, `logit`, `Model`, `TrainingRow` (Task 6).
- Produces: `interface Scored`, `brier(xs)`, `BANDS`, `interface Band`, `calibration(xs)`, `skill(model, base)`,
  `interface Summary`, `summarise(scored, kind)`, `GO_LIVE`, `interface GoLive`, `goLiveStatus(scored, kind)`;
  `trainingRows(history, kind): TrainingRow[]`, `walkForward(history, minTrainWeeks?): Scored[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { brier, calibration, goLiveStatus, skill, type Scored } from '@/lib/forecast/score';
import { walkForward } from '@/lib/forecast/backtest';
import { FORECASTERS, type HistoryRow, type Signals } from '@/lib/forecast/types';

describe('scores', () => {
  it('computes the Brier score and skill', () => {
    expect(brier([{ p: 0.2, y: 0 }, { p: 0.7, y: 1 }])).toBeCloseTo(0.065, 12);
    expect(brier([])).toBeNull();
    expect(skill(0.065, 0.1)).toBeCloseTo(0.35, 12);
  });

  it('bins forecasts into the five calibration bands', () => {
    const bands = calibration([{ p: 0.05, y: 0 }, { p: 0.1, y: 1 }, { p: 0.15, y: 0 }, { p: 1, y: 1 }]);
    expect(bands.map((b) => b.n)).toEqual([1, 2, 0, 0, 1]);
    expect(bands[1]).toMatchObject({ lo: 0.1, hi: 0.2, observed: 0.5 });
    expect(bands[1].meanP).toBeCloseTo(0.125, 12);
  });
});

describe('the go-live rule', () => {
  const week = (i: number) => `2026-W${String(41 + i).padStart(2, '0')}`;
  const record = (weeks: number, perWeek: number, model: (y: 0 | 1) => number): Scored[] =>
    Array.from({ length: weeks }).flatMap((_, w) => Array.from({ length: perWeek }).flatMap((__, q) => {
      const y: 0 | 1 = q % 5 === 0 ? 1 : 0;
      const base = { kind: 'incident' as const, questionId: `incident:Q${q}`, week: week(w), y };
      return [
        { ...base, forecaster: FORECASTERS.model, p: model(y) },
        { ...base, forecaster: FORECASTERS.usual, p: 0.2 },
        { ...base, forecaster: FORECASTERS.persistence, p: 0.3 },
      ];
    }));

  it('goes live after 6 weeks and 150 forecasts that beat both baselines and are calibrated', () => {
    const g = goLiveStatus(record(6, 30, (y) => (y ? 0.9 : 0.1)), 'incident');
    expect(g).toMatchObject({ live: true, weeks: 6, forecasts: 180, needs: [] });
  });

  it('says what is still needed', () => {
    const g = goLiveStatus(record(5, 20, () => 0.5), 'incident');
    expect(g.live).toBe(false);
    expect(g.needs).toEqual(expect.arrayContaining(['1 more settled week', '50 more settled forecasts',
      'a lower Brier score than both baselines']));
  });

  it('refuses a miscalibrated band', () => {
    const g = goLiveStatus(record(6, 30, (y) => (y ? 0.9 : 0.4)), 'incident');
    expect(g.needs.some((n) => n.startsWith('calibration within ±15 points'))).toBe(true);
  });
});

describe('the walk-forward backtest', () => {
  const quiet: Signals = { incidents7: 0, incidents28: 0, tension: 0, tensionChange7: 0, surge: 1,
    escWeight7: 0, beijing7: 0, beijing28: 0, beijingMaxRung28: 0 };
  const history: HistoryRow[] = Array.from({ length: 6 }).flatMap((_, w) => Array.from({ length: 5 }, (__, q) => ({
    questionId: `incident:Q${q}`, kind: 'incident' as const, week: `2026-W${30 + w}`,
    signals: { ...quiet, incidents7: q % 2 }, outcome: (q + w) % 3 === 0 ? 1 as const : 0 as const,
  })));

  it('forecasts only weeks with 4 earlier weeks, with all three forecasters', () => {
    const scored = walkForward(history);
    expect([...new Set(scored.map((s) => s.week))]).toEqual(['2026-W34', '2026-W35']);
    expect(scored).toHaveLength(2 * 5 * 3);
  });

  it("never lets a week's own outcomes change its forecasts", () => {
    const flipped = history.map((r) => (r.week === '2026-W35' ? { ...r, outcome: (1 - r.outcome) as 0 | 1 } : r));
    const p = (xs: Scored[]) => xs.filter((s) => s.week === '2026-W35').map((s) => s.p);
    expect(p(walkForward(flipped))).toEqual(p(walkForward(history)));
  });
});
```

Save as `tests/forecast-score.test.ts`.

- [ ] **Step 2: Run it — expect FAIL** (modules missing)

Run: `npx vitest run tests/forecast-score.test.ts`

- [ ] **Step 3: Write `lib/forecast/score.ts`**

```ts
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
  if (weeks.length < GO_LIVE.minWeeks) needs.push(`${plural(GO_LIVE.minWeeks - weeks.length, 'more settled week')}`);
  if (all.n < GO_LIVE.minForecasts) needs.push(`${plural(GO_LIVE.minForecasts - all.n, 'more settled forecast')}`);
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
```

- [ ] **Step 4: Write `lib/forecast/backtest.ts`**

```ts
import { sameAsLastWeek, usualRate } from '@/lib/forecast/baselines';
import { fitModel, logit, predict, type Model, type TrainingRow } from '@/lib/forecast/logistic';
import type { Scored } from '@/lib/forecast/score';
import { FORECASTERS, type HistoryRow, type QuestionKind } from '@/lib/forecast/types';

export const MIN_TRAIN_WEEKS = 4;
const KINDS: QuestionKind[] = ['incident', 'beijing'];

/** A kind's training rows. Each row's offset is its question's usual rate from the weeks BEFORE it only. */
export function trainingRows(history: HistoryRow[], kind: QuestionKind): TrainingRow[] {
  return history.filter((r) => r.kind === kind).map((r) => ({
    signals: r.signals,
    outcome: r.outcome,
    offset: logit(usualRate(history.filter((h) => h.week < r.week), r.questionId, kind)),
  }));
}

export function fitAll(history: HistoryRow[]): Map<QuestionKind, Model> {
  return new Map(KINDS.map((k) => [k, fitModel(k, trainingRows(history, k))]));
}

/** Forecast each week from the weeks before it only, once MIN_TRAIN_WEEKS earlier weeks exist. */
export function walkForward(history: HistoryRow[], minTrainWeeks = MIN_TRAIN_WEEKS): Scored[] {
  const weeks = [...new Set(history.map((r) => r.week))].sort();
  const out: Scored[] = [];
  weeks.forEach((week, i) => {
    if (i < minTrainWeeks) return;
    const train = history.filter((r) => r.week < week);
    const models = fitAll(train);
    for (const r of history.filter((h) => h.week === week)) {
      const usual = usualRate(train, r.questionId, r.kind);
      const ps: [string, number][] = [
        [FORECASTERS.usual, usual],
        [FORECASTERS.persistence, sameAsLastWeek(train, r.kind, r.signals)],
        [FORECASTERS.model, predict(models.get(r.kind)!, usual, r.signals)],
      ];
      for (const [forecaster, p] of ps) out.push({ forecaster, kind: r.kind, questionId: r.questionId, week, p, y: r.outcome });
    }
  });
  return out;
}
```

- [ ] **Step 5: Run it — expect PASS (7 tests)**

Run: `npx vitest run tests/forecast-score.test.ts`

- [ ] **Step 6: Commit**

```bash
git add lib/forecast/score.ts lib/forecast/backtest.ts tests/forecast-score.test.ts
git commit -m "Forecasts: Brier, calibration, the go-live rule and a walk-forward backtest"
```

---

### Task 8: The tables and the tamper-evident record

**Files:**
- Modify: `lib/db/index.ts` (export `tx`; add the three tables and four triggers in `migrate`)
- Create: `lib/forecast/ledger.ts`
- Test: `tests/forecast-ledger.test.ts`

**Interfaces:**
- Consumes: `getDb`, `tx` (`lib/db`); `SettlementRule`, `Evidence` (Task 1); `Explanation` (Task 6).
- Produces: `GENESIS`, `canonical(v)`, `sha256(s)`, `entryHash(fields, prev)`, `interface NewForecast`,
  `interface StoredForecast`, `interface NewOutcome`, `interface StoredOutcome`, `appendForecast(f): boolean`,
  `appendOutcome(o): number`, `allForecasts()`, `forecastsForWeek(week)`, `currentOutcomes(): Map<string, StoredOutcome>`
  (key `` `${questionId}|${week}` ``), `verifyLedger()`, `interface ChainHeads`, `chainHeads()`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-ledger-')), 'test.db');

const { getDb } = await import('@/lib/db');
const L = await import('@/lib/forecast/ledger');

const forecast = (p: Partial<import('@/lib/forecast/ledger').NewForecast> = {}) => ({
  forecaster: 'usual-rate@1', questionId: 'incident:CHN-IND', week: '2026-W41',
  question: 'Will a corroborated military incident between China and India begin in the next 7 days?',
  rule: { kind: 'beijing' as const, target: 'JPN', graceHours: 72 },
  windowStart: '2026-10-05T00:30:00.000Z', windowEnd: '2026-10-12T00:00:00.000Z',
  issuedAt: '2026-10-05T00:30:00.000Z', probability: 0.21, explanation: null, inputsHash: 'abc', ...p,
});
const outcome = (p: Partial<import('@/lib/forecast/ledger').NewOutcome> = {}) => ({
  questionId: 'incident:CHN-IND', week: '2026-W41', outcome: 1 as const, settledAt: '2026-10-15T00:30:00.000Z',
  evidence: [], engineVersion: 'dev', corrects: null, reason: null, ...p,
});

describe('the record', () => {
  it('hashes canonically, whatever the key order', () => {
    expect(L.canonical({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });

  it('chains each forecast to the one before and refuses a duplicate', () => {
    expect(L.appendForecast(forecast())).toBe(true);
    expect(L.appendForecast(forecast())).toBe(false);
    expect(L.appendForecast(forecast({ forecaster: 'signal-model@1', probability: 0.31 }))).toBe(true);
    const [a, b] = L.allForecasts();
    expect(a.prevHash).toBe(L.GENESIS);
    expect(b.prevHash).toBe(a.hash);
    expect(L.forecastsForWeek('2026-W41')).toHaveLength(2);
  });

  it('refuses every edit and deletion', () => {
    L.appendOutcome(outcome());
    for (const sql of ['UPDATE forecasts SET probability = 0.99', 'DELETE FROM forecasts',
      'UPDATE outcomes SET outcome = 0', 'DELETE FROM outcomes']) {
      expect(() => getDb().exec(sql)).toThrow(/append-only/);
    }
  });

  it('lets a correction replace an outcome without erasing it', () => {
    const first = [...L.currentOutcomes().values()][0];
    L.appendOutcome(outcome({ outcome: 0, corrects: first.seq, reason: 'duplicate event' }));
    const now = L.currentOutcomes().get('incident:CHN-IND|2026-W41')!;
    expect(now).toMatchObject({ outcome: 0, corrects: first.seq, reason: 'duplicate event' });
    expect(L.chainHeads().outcomes?.seq).toBe(now.seq);
  });

  it('verifies an intact chain, and finds an edit made behind the triggers', () => {
    expect(L.verifyLedger()).toMatchObject({ ok: true, brokenAt: null, forecasts: 2, outcomes: 2 });
    const db = getDb();
    db.exec('DROP TRIGGER forecasts_append_only_u');
    db.exec('UPDATE forecasts SET probability = 0.99 WHERE seq = 2');
    expect(L.verifyLedger()).toMatchObject({ ok: false, brokenAt: { table: 'forecasts', seq: 2 } });
  });
});
```

Save as `tests/forecast-ledger.test.ts`. (Top-level `await import` keeps the temp database in place before
`lib/db` loads; vitest supports it in ESM test files.)

- [ ] **Step 2: Run it — expect FAIL** (module missing)

Run: `npx vitest run tests/forecast-ledger.test.ts`

- [ ] **Step 3: Export `tx` in `lib/db/index.ts`**

Change `function tx<T>(db: DatabaseSync, fn: () => T): T {` to `export function tx<T>(db: DatabaseSync, fn: () => T): T {`.

- [ ] **Step 4: Add the tables to `migrate` in `lib/db/index.ts`**, directly after the closing `` `); `` of the
first big `db.exec` (before the "Additive column migrations" comment):

```ts
  // Predictive intelligence (docs/specs/2026-09-30-predictive-intelligence-design.md). forecast_signals is
  // the model's memory and is never pruned; outcome holds the hindsight label of a reconstructed Monday row.
  // forecasts and outcomes are the record: append-only by trigger, hash-chained in lib/forecast/ledger.ts.
  db.exec(`
    CREATE TABLE IF NOT EXISTS forecast_signals (
      day TEXT NOT NULL, question_id TEXT NOT NULL, signals TEXT NOT NULL, source TEXT NOT NULL,
      outcome INTEGER, created_at TEXT NOT NULL, PRIMARY KEY (day, question_id)
    );
    CREATE TABLE IF NOT EXISTS forecasts (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, forecaster TEXT NOT NULL, question_id TEXT NOT NULL,
      week TEXT NOT NULL, question TEXT NOT NULL, rule TEXT NOT NULL, window_start TEXT NOT NULL,
      window_end TEXT NOT NULL, issued_at TEXT NOT NULL, probability REAL NOT NULL, explanation TEXT NOT NULL,
      inputs_hash TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL,
      UNIQUE (forecaster, question_id, week)
    );
    CREATE TABLE IF NOT EXISTS outcomes (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, question_id TEXT NOT NULL, week TEXT NOT NULL,
      outcome INTEGER NOT NULL, settled_at TEXT NOT NULL, evidence TEXT NOT NULL, engine_version TEXT NOT NULL,
      corrects INTEGER, reason TEXT, prev_hash TEXT NOT NULL, hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_outcomes_qw ON outcomes(question_id, week);
    CREATE TRIGGER IF NOT EXISTS forecasts_append_only_u BEFORE UPDATE ON forecasts
      BEGIN SELECT RAISE(ABORT, 'append-only'); END;
    CREATE TRIGGER IF NOT EXISTS forecasts_append_only_d BEFORE DELETE ON forecasts
      BEGIN SELECT RAISE(ABORT, 'append-only'); END;
    CREATE TRIGGER IF NOT EXISTS outcomes_append_only_u BEFORE UPDATE ON outcomes
      BEGIN SELECT RAISE(ABORT, 'append-only'); END;
    CREATE TRIGGER IF NOT EXISTS outcomes_append_only_d BEFORE DELETE ON outcomes
      BEGIN SELECT RAISE(ABORT, 'append-only'); END;
  `);
```

- [ ] **Step 5: Write `lib/forecast/ledger.ts`**

```ts
import { createHash } from 'node:crypto';
import { getDb, tx } from '@/lib/db';
import type { Explanation } from '@/lib/forecast/logistic';
import type { Evidence, SettlementRule } from '@/lib/forecast/types';

/**
 * The forecast record. Append-only by trigger (lib/db); each entry's hash covers its stored columns and the
 * previous entry's hash, so any change to an old entry breaks every hash after it. Corrections are new
 * outcome entries that point at the one they correct.
 */
export const GENESIS = '0'.repeat(64);

/** JSON with object keys sorted at every depth, so an entry always hashes the same. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const entryHash = (fields: Record<string, unknown>, prev: string) => sha256(`${canonical(fields)}|${prev}`);

export interface NewForecast {
  forecaster: string; questionId: string; week: string; question: string; rule: SettlementRule;
  windowStart: string; windowEnd: string; issuedAt: string; probability: number;
  explanation: Explanation | null; inputsHash: string;
}
export interface StoredForecast extends NewForecast { seq: number; prevHash: string; hash: string }

export interface NewOutcome {
  questionId: string; week: string; outcome: 0 | 1; settledAt: string; evidence: Evidence[];
  engineVersion: string; corrects: number | null; reason: string | null;
}
export interface StoredOutcome extends NewOutcome { seq: number; prevHash: string; hash: string }

type Row = Record<string, string | number | null>;

// Exactly the stored columns (JSON columns as their stored text), so verification recomputes from disk.
const forecastFields = (r: Row) => ({
  forecaster: r.forecaster, question_id: r.question_id, week: r.week, question: r.question, rule: r.rule,
  window_start: r.window_start, window_end: r.window_end, issued_at: r.issued_at, probability: r.probability,
  explanation: r.explanation, inputs_hash: r.inputs_hash,
});
const outcomeFields = (r: Row) => ({
  question_id: r.question_id, week: r.week, outcome: r.outcome, settled_at: r.settled_at, evidence: r.evidence,
  engine_version: r.engine_version, corrects: r.corrects, reason: r.reason,
});

function head(table: 'forecasts' | 'outcomes'): string {
  const r = getDb().prepare(`SELECT hash FROM ${table} ORDER BY seq DESC LIMIT 1`).get() as { hash: string } | undefined;
  return r?.hash ?? GENESIS;
}

/** Record one forecast. False, and nothing written, if this forecaster already has one for the question-week. */
export function appendForecast(f: NewForecast): boolean {
  const db = getDb();
  return tx(db, () => {
    if (db.prepare('SELECT 1 FROM forecasts WHERE forecaster = ? AND question_id = ? AND week = ?')
      .get(f.forecaster, f.questionId, f.week)) return false;
    const row = {
      forecaster: f.forecaster, question_id: f.questionId, week: f.week, question: f.question,
      rule: canonical(f.rule), window_start: f.windowStart, window_end: f.windowEnd, issued_at: f.issuedAt,
      probability: f.probability, explanation: canonical(f.explanation), inputs_hash: f.inputsHash,
    };
    const prev = head('forecasts');
    db.prepare(`INSERT INTO forecasts (forecaster, question_id, week, question, rule, window_start, window_end,
      issued_at, probability, explanation, inputs_hash, prev_hash, hash) VALUES (@forecaster, @question_id, @week,
      @question, @rule, @window_start, @window_end, @issued_at, @probability, @explanation, @inputs_hash,
      @prev_hash, @hash)`).run({ ...row, prev_hash: prev, hash: entryHash(row, prev) });
    return true;
  });
}

/** Record one settlement (or a correction). Returns its seq. */
export function appendOutcome(o: NewOutcome): number {
  const db = getDb();
  return tx(db, () => {
    const row = {
      question_id: o.questionId, week: o.week, outcome: o.outcome, settled_at: o.settledAt,
      evidence: canonical(o.evidence), engine_version: o.engineVersion, corrects: o.corrects, reason: o.reason,
    };
    const prev = head('outcomes');
    const r = db.prepare(`INSERT INTO outcomes (question_id, week, outcome, settled_at, evidence, engine_version,
      corrects, reason, prev_hash, hash) VALUES (@question_id, @week, @outcome, @settled_at, @evidence,
      @engine_version, @corrects, @reason, @prev_hash, @hash)`).run({ ...row, prev_hash: prev, hash: entryHash(row, prev) });
    return Number(r.lastInsertRowid);
  });
}

const toForecast = (r: Row): StoredForecast => ({
  seq: Number(r.seq), forecaster: String(r.forecaster), questionId: String(r.question_id), week: String(r.week),
  question: String(r.question), rule: JSON.parse(String(r.rule)), windowStart: String(r.window_start),
  windowEnd: String(r.window_end), issuedAt: String(r.issued_at), probability: Number(r.probability),
  explanation: JSON.parse(String(r.explanation)), inputsHash: String(r.inputs_hash),
  prevHash: String(r.prev_hash), hash: String(r.hash),
});
const toOutcome = (r: Row): StoredOutcome => ({
  seq: Number(r.seq), questionId: String(r.question_id), week: String(r.week), outcome: Number(r.outcome) as 0 | 1,
  settledAt: String(r.settled_at), evidence: JSON.parse(String(r.evidence)), engineVersion: String(r.engine_version),
  corrects: r.corrects === null ? null : Number(r.corrects), reason: r.reason === null ? null : String(r.reason),
  prevHash: String(r.prev_hash), hash: String(r.hash),
});

export function allForecasts(): StoredForecast[] {
  return (getDb().prepare('SELECT * FROM forecasts ORDER BY seq').all() as Row[]).map(toForecast);
}

export function forecastsForWeek(week: string): StoredForecast[] {
  return (getDb().prepare('SELECT * FROM forecasts WHERE week = ? ORDER BY seq').all(week) as Row[]).map(toForecast);
}

/** The outcome in force for each question-week: the newest entry, so a correction wins. */
export function currentOutcomes(): Map<string, StoredOutcome> {
  const out = new Map<string, StoredOutcome>();
  for (const r of getDb().prepare('SELECT * FROM outcomes ORDER BY seq').all() as Row[]) {
    const o = toOutcome(r);
    out.set(`${o.questionId}|${o.week}`, o);
  }
  return out;
}

export interface LedgerCheck {
  ok: boolean; forecasts: number; outcomes: number;
  brokenAt: { table: 'forecasts' | 'outcomes'; seq: number } | null;
}

/** Recompute both chains from what is on disk. */
export function verifyLedger(): LedgerCheck {
  const count = { forecasts: 0, outcomes: 0 };
  for (const [table, fields] of [['forecasts', forecastFields], ['outcomes', outcomeFields]] as const) {
    let prev = GENESIS;
    for (const r of getDb().prepare(`SELECT * FROM ${table} ORDER BY seq`).all() as Row[]) {
      count[table] += 1;
      if (r.prev_hash !== prev || r.hash !== entryHash(fields(r), prev)) {
        return { ok: false, ...count, brokenAt: { table, seq: Number(r.seq) } };
      }
      prev = String(r.hash);
    }
  }
  return { ok: true, ...count, brokenAt: null };
}

export interface ChainHeads { forecasts: { seq: number; hash: string } | null; outcomes: { seq: number; hash: string } | null }

export function chainHeads(): ChainHeads {
  const one = (table: string) => {
    const r = getDb().prepare(`SELECT seq, hash FROM ${table} ORDER BY seq DESC LIMIT 1`).get() as
      { seq: number; hash: string } | undefined;
    return r ? { seq: Number(r.seq), hash: r.hash } : null;
  };
  return { forecasts: one('forecasts'), outcomes: one('outcomes') };
}
```

- [ ] **Step 6: Run it — expect PASS (5 tests)**

Run: `npx vitest run tests/forecast-ledger.test.ts`

- [ ] **Step 7: Commit**

```bash
git add lib/db/index.ts lib/forecast/ledger.ts tests/forecast-ledger.test.ts
git commit -m "Forecasts: tables and an append-only, hash-chained record"
```

---

### Task 9: The signal store, reconstruction and the training history

**Files:**
- Create: `lib/forecast/store.ts`
- Modify: `docs/specs/2026-09-30-predictive-intelligence-design.md` (the `outcome` column)
- Test: `tests/forecast-store.test.ts`

**Interfaces:**
- Consumes: `getDb`, `getMeta`, `setMeta` (`lib/db`); Tasks 1–4 and 8.
- Produces: `writeSignals(day, questionId, signals, source, now, outcome?)`, `signalsOn(day, questionId)`,
  `snapshotLive(questions, corpus, now): number`, `RECON_WARMUP_DAYS = 28`, `interface ReconStatus`,
  `reconstructionStatus()`, `reconstructStep(now, budgetMs, live, opts?: { minPairEvents?: number }): { done; wrote }`,
  `labelPending(now, live): number`, `trainingHistory(): HistoryRow[]`, `liveScored(): Scored[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { art, corpusOf, incident, T } from './fixtures/forecast';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-fstore-')), 'test.db');

const { getDb } = await import('@/lib/db');
const S = await import('@/lib/forecast/store');
const { incidentQuestion } = await import('@/lib/forecast/geo/questions');
const { appendForecast, appendOutcome } = await import('@/lib/forecast/ledger');

// Ten weeks of China–India reporting from Monday 6 July, two reports a day, every title unique.
let k = 0;
const tag = () => `zq${(k++).toString(36)}x zp${k.toString(36)}w`;
const reports = Array.from({ length: 70 }).flatMap((_, d) => [0, 1].map((h) => art({
  title: `${tag()} border patrol`, outlet: `Outlet ${h}`,
  publishedAt: new Date(T('2026-07-06T06:00:00Z') + d * 86_400_000 + h * 3_600_000).toISOString(),
})));
// The hindsight label: one qualifying incident in the week of Monday 10 August.
const aug = incident('CHN', 'IND', '2026-08-12T06:00:00.000Z');
const live = corpusOf([aug.event], [...reports, ...aug.articles]);
const now = T('2026-09-30T12:00:00Z');

describe('reconstruction', () => {
  it('does nothing without budget, then rebuilds every Monday from four weeks after the first report', () => {
    expect(S.reconstructStep(now, -1, live, { minPairEvents: 5 })).toEqual({ done: false, wrote: 0 });
    const r = S.reconstructStep(now, 600_000, live, { minPairEvents: 5 });
    expect(r.done).toBe(true);
    const days = (getDb().prepare("SELECT DISTINCT day FROM forecast_signals WHERE source = 'reconstructed' ORDER BY day")
      .all() as { day: string }[]).map((d) => d.day);
    expect(days).toEqual(['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31',
      '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
    expect(S.reconstructStep(now, 600_000, live)).toEqual({ done: true, wrote: 0 });
  });

  it('labels settled weeks with hindsight and leaves the rest for later', () => {
    const label = (day: string) => (getDb().prepare(
      "SELECT outcome FROM forecast_signals WHERE day = ? AND question_id = 'incident:CHN-IND'").get(day) as { outcome: number | null }).outcome;
    expect(label('2026-08-10')).toBe(1);
    expect(label('2026-08-17')).toBe(0);
    expect(label('2026-09-21')).toBeNull();
    expect(S.labelPending(T('2026-10-10T00:00:00Z'), live)).toBeGreaterThan(0);
    expect(label('2026-09-21')).toBe(0);
  });
});

describe('live snapshots and the training history', () => {
  const q = incidentQuestion('CHN', 'IND');

  it('writes one live row per question per day, reading the tension change from a week before', () => {
    const monday = T('2026-10-05T00:30:00Z');
    expect(S.snapshotLive([q], live, monday)).toBe(1);
    expect(S.snapshotLive([q], live, monday + 3_600_000)).toBe(0);
    expect(S.signalsOn('2026-10-05', q.id)).not.toBeNull();
  });

  it('trains on labelled reconstructed weeks plus settled live weeks', () => {
    const before = S.trainingHistory().length;
    appendForecast({ forecaster: 'usual-rate@1', questionId: q.id, week: '2026-W41', question: q.text, rule: q.rule,
      windowStart: '2026-10-05T00:30:00.000Z', windowEnd: '2026-10-12T00:00:00.000Z',
      issuedAt: '2026-10-05T00:30:00.000Z', probability: 0.2, explanation: null, inputsHash: 'x' });
    expect(S.trainingHistory()).toHaveLength(before);   // not settled yet
    appendOutcome({ questionId: q.id, week: '2026-W41', outcome: 1, settledAt: '2026-10-15T00:30:00.000Z',
      evidence: [], engineVersion: 'dev', corrects: null, reason: null });
    const history = S.trainingHistory();
    expect(history).toHaveLength(before + 1);
    expect(history.at(-1)).toMatchObject({ questionId: q.id, week: '2026-W41', outcome: 1 });
    expect(S.liveScored()).toEqual([{ forecaster: 'usual-rate@1', kind: 'incident', questionId: q.id,
      week: '2026-W41', p: 0.2, y: 1 }]);
  });
});
```

Save as `tests/forecast-store.test.ts`.

- [ ] **Step 2: Run it — expect FAIL** (module missing)

Run: `npx vitest run tests/forecast-store.test.ts`

- [ ] **Step 3: Write `lib/forecast/store.ts`**

```ts
import { getDb, getMeta, setMeta } from '@/lib/db';
import { beijingQuestions, incidentQuestions, questionFromId } from '@/lib/forecast/geo/questions';
import { settle } from '@/lib/forecast/geo/settle';
import { corpusAsOf, signalsFor, tensionOf } from '@/lib/forecast/geo/signals';
import { allForecasts, currentOutcomes } from '@/lib/forecast/ledger';
import type { Scored } from '@/lib/forecast/score';
import { DAY, GRACE_MS, WEEK, isoDay, mondayStart, weekId } from '@/lib/forecast/time';
import { kindOf, type Corpus, type HistoryRow, type Question, type Signals } from '@/lib/forecast/types';

export function writeSignals(day: string, questionId: string, s: Signals, source: 'live' | 'reconstructed',
  now: number, outcome: 0 | 1 | null = null): boolean {
  const r = getDb().prepare(`INSERT OR IGNORE INTO forecast_signals (day, question_id, signals, source, outcome, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(day, questionId, JSON.stringify(s), source, outcome, new Date(now).toISOString());
  return Number(r.changes) > 0;
}

export function signalsOn(day: string, questionId: string): Signals | null {
  const r = getDb().prepare('SELECT signals FROM forecast_signals WHERE day = ? AND question_id = ?').get(day, questionId) as
    { signals: string } | undefined;
  return r ? JSON.parse(r.signals) : null;
}

/** Today's live row for every question that has none yet. Returns how many were written. */
export function snapshotLive(questions: Question[], c: Corpus, now: number): number {
  const day = isoDay(now);
  const weekAgo = isoDay(now - WEEK);
  let written = 0;
  for (const q of questions) {
    if (signalsOn(day, q.id)) continue;
    const s = signalsFor(q, c, now, signalsOn(weekAgo, q.id)?.tension ?? null);
    if (writeSignals(day, q.id, s, 'live', now)) written += 1;
  }
  return written;
}

const RECON_NEXT = 'forecast_reconstruct_next';
const RECON_UNTIL = 'forecast_reconstruct_until';
/** A reconstructed Monday needs this much reporting behind it for its 28-day signals to mean anything. */
export const RECON_WARMUP_DAYS = 28;

export interface ReconStatus { done: boolean; next: string | null; until: string | null }

export function reconstructionStatus(): ReconStatus {
  const next = getMeta(RECON_NEXT);
  const until = getMeta(RECON_UNTIL);
  const day = (v: string | null) => (v && v !== 'done' ? isoDay(Number(v)) : null);
  return { done: next === 'done', next: day(next), until: day(until) };
}

function reconstructMonday(m: number, live: Corpus, now: number, minPairEvents?: number): number {
  const at = corpusAsOf(live.articles, m);
  const weekBefore = corpusAsOf(live.articles, m - WEEK);
  const questions = [...incidentQuestions(at.events, minPairEvents), ...beijingQuestions(at.articles, m)];
  const settled = m + WEEK + GRACE_MS <= now;
  let written = 0;
  for (const q of questions) {
    const s = signalsFor(q, at, m, tensionOf(q, weekBefore, m - WEEK));
    const outcome = settled ? settle(q.rule, { start: m, end: m + WEEK }, live).outcome : null;
    if (writeSignals(isoDay(m), q.id, s, 'reconstructed', now, outcome)) written += 1;
  }
  return written;
}

/**
 * Rebuild past Mondays, oldest first, until `budgetMs` of wall-clock time has passed. The range is fixed on the
 * first call: from the first Monday with RECON_WARMUP_DAYS of reporting behind it, to this week's Monday.
 */
export function reconstructStep(now: number, budgetMs: number, live: Corpus,
  opts: { minPairEvents?: number } = {}): { done: boolean; wrote: number } {
  if (getMeta(RECON_NEXT) === 'done') return { done: true, wrote: 0 };
  if (!live.articles.length || budgetMs < 0) return { done: false, wrote: 0 };
  if (!getMeta(RECON_UNTIL)) {
    const earliest = live.articles.reduce((m, a) => Math.min(m, Date.parse(a.publishedAt)), Infinity);
    let first = mondayStart(earliest + RECON_WARMUP_DAYS * DAY);
    if (first < earliest + RECON_WARMUP_DAYS * DAY) first += WEEK;
    setMeta(RECON_NEXT, String(first));
    setMeta(RECON_UNTIL, String(mondayStart(now)));
  }
  const started = Date.now();
  const until = Number(getMeta(RECON_UNTIL));
  let next = Number(getMeta(RECON_NEXT));
  let wrote = 0;
  while (next <= until && Date.now() - started <= budgetMs) {
    wrote += reconstructMonday(next, live, now, opts.minPairEvents);
    next += WEEK;
    setMeta(RECON_NEXT, String(next));
  }
  if (next > until) {
    setMeta(RECON_NEXT, 'done');
    return { done: true, wrote };
  }
  return { done: false, wrote };
}

/** Label reconstructed Monday rows whose week has now been settled. Returns how many were labelled. */
export function labelPending(now: number, live: Corpus): number {
  const rows = getDb().prepare(
    "SELECT day, question_id FROM forecast_signals WHERE source = 'reconstructed' AND outcome IS NULL",
  ).all() as { day: string; question_id: string }[];
  const update = getDb().prepare('UPDATE forecast_signals SET outcome = ? WHERE day = ? AND question_id = ?');
  let labelled = 0;
  for (const r of rows) {
    const m = Date.parse(`${r.day}T00:00:00.000Z`);
    if (m + WEEK + GRACE_MS > now) continue;
    update.run(settle(questionFromId(r.question_id).rule, { start: m, end: m + WEEK }, live).outcome, r.day, r.question_id);
    labelled += 1;
  }
  return labelled;
}

/** Every labelled past question-week: reconstructed (hindsight) and live (settled on the record). */
export function trainingHistory(): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const r of getDb().prepare(
    "SELECT day, question_id, signals, outcome FROM forecast_signals WHERE source = 'reconstructed' AND outcome IS NOT NULL",
  ).all() as { day: string; question_id: string; signals: string; outcome: number }[]) {
    rows.push({ questionId: r.question_id, kind: kindOf(r.question_id), week: weekId(Date.parse(`${r.day}T00:00:00.000Z`)),
      signals: JSON.parse(r.signals), outcome: r.outcome as 0 | 1 });
  }
  const outcomes = currentOutcomes();
  const seen = new Set<string>();
  for (const f of allForecasts()) {
    const key = `${f.questionId}|${f.week}`;
    const o = outcomes.get(key);
    const s = signalsOn(isoDay(Date.parse(f.windowStart)), f.questionId);
    if (seen.has(key) || !o || !s) continue;
    seen.add(key);
    rows.push({ questionId: f.questionId, kind: kindOf(f.questionId), week: f.week, signals: s, outcome: o.outcome });
  }
  return rows;
}

/** Every live forecast that has an outcome, for scoring and the go-live rule. */
export function liveScored(): Scored[] {
  const outcomes = currentOutcomes();
  return allForecasts().flatMap((f) => {
    const o = outcomes.get(`${f.questionId}|${f.week}`);
    return o ? [{ forecaster: f.forecaster, kind: kindOf(f.questionId), questionId: f.questionId, week: f.week,
      p: f.probability, y: o.outcome }] : [];
  });
}
```

- [ ] **Step 4: Run it — expect PASS (4 tests)**

Run: `npx vitest run tests/forecast-store.test.ts`

- [ ] **Step 5: Record the `outcome` column in the spec.** In
`docs/specs/2026-09-30-predictive-intelligence-design.md`, in the `forecast_signals` table, add after the
`source` row:

```markdown
| `outcome` | For a reconstructed Monday row, its week's hindsight label once settled (null until then); unused for live rows, whose outcomes are on the record |
```

- [ ] **Step 6: Commit**

```bash
git add lib/forecast/store.ts tests/forecast-store.test.ts docs/specs/2026-09-30-predictive-intelligence-design.md
git commit -m "Forecasts: signal store, sliced reconstruction and the training history"
```

---

### Task 10: The weekly cycle, wired into the ingest

**Files:**
- Create: `lib/forecast/schedule.ts`
- Modify: `lib/ingest/pipeline.ts` (after the alerts `try` block in `runIngest`)
- Modify: `docs/specs/2026-09-30-predictive-intelligence-design.md` (where the cycle is called from)
- Test: `tests/forecast-schedule.test.ts`

**Interfaces:**
- Consumes: Tasks 1–9; `everyEvent`, `everyArticle`, `getMeta`, `setMeta` (`lib/db`).
- Produces: `ISSUE_LATE_LIMIT_MS`, `RECONSTRUCT_BUDGET_MS`, `engineVersion()`, `issueWeek(questions, now)`,
  `settleDue(now, live, version?)`, `interface CycleReport`, `runForecastCycle(now?, opts?)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { art, incident, T } from './fixtures/forecast';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-fsched-')), 'test.db');

const db = await import('@/lib/db');
const { runForecastCycle } = await import('@/lib/forecast/schedule');
const { forecastsForWeek, currentOutcomes } = await import('@/lib/forecast/ledger');

const inc = incident('CHN', 'IND', '2026-10-07T09:00:00.000Z');
db.upsertArticles([...Array.from({ length: 4 }, () => art({ publishedAt: '2026-09-20T00:00:00.000Z' })), ...inc.articles]);
db.replaceEvents([inc.event]);
const run = (iso: string) => runForecastCycle(T(iso), { budgetMs: -1, minPairEvents: 1 });

describe('the weekly cycle', () => {
  it('skips a week whose first chance comes more than 24 hours late, once', () => {
    const r = run('2026-09-30T12:00:00Z');
    expect(r.snapshot).toBeGreaterThan(0);
    expect(r).toMatchObject({ issued: 0, skipped: '2026-W40' });
    expect(run('2026-09-30T13:00:00Z')).toMatchObject({ issued: 0, skipped: null });
  });

  it('issues all three forecasters once on Monday, windowed from issue to next Monday', () => {
    const r = run('2026-10-05T00:30:00Z');
    const qs = forecastsForWeek('2026-W41');
    expect(r.issued).toBe(qs.length);
    expect(new Set(qs.map((f) => f.forecaster))).toEqual(new Set(['usual-rate@1', 'same-as-last-week@1', 'signal-model@1']));
    expect(qs[0]).toMatchObject({ windowStart: '2026-10-05T00:30:00.000Z', windowEnd: '2026-10-12T00:00:00.000Z' });
    expect(qs.find((f) => f.forecaster === 'signal-model@1')!.explanation!.text).toMatch(/^\d+%\. The usual rate for /);
    expect(run('2026-10-05T01:30:00Z').issued).toBe(0);
  });

  it('skips the next week when Monday is missed by more than a day', () => {
    expect(run('2026-10-13T00:10:00Z')).toMatchObject({ issued: 0, skipped: '2026-W42' });
  });

  it('settles 72 hours after the window, with evidence, exactly once', () => {
    expect(run('2026-10-14T23:00:00Z').settled).toBe(0);
    const r = run('2026-10-15T00:30:00Z');
    expect(r.settled).toBeGreaterThan(0);
    expect(currentOutcomes().get('incident:CHN-IND|2026-W41')).toMatchObject({ outcome: 1, engineVersion: 'dev' });
    expect(run('2026-10-15T01:30:00Z').settled).toBe(0);
  });

  it('verifies the record once a day', () => {
    expect(run('2026-10-16T00:30:00Z').ledgerOk).toBe(true);
    expect(run('2026-10-16T01:30:00Z').ledgerOk).toBeNull();
  });

  it('is called by the ingest, where a failure cannot fail the refresh', () => {
    const src = readFileSync('lib/ingest/pipeline.ts', 'utf8');
    expect(src).toMatch(/try \{\s*const \{ runForecastCycle \} = await import\('@\/lib\/forecast\/schedule'\);/);
    expect(src).toMatch(/forecasts skipped: /);
  });
});
```

Save as `tests/forecast-schedule.test.ts`.

- [ ] **Step 2: Run it — expect FAIL** (module missing)

Run: `npx vitest run tests/forecast-schedule.test.ts`

- [ ] **Step 3: Write `lib/forecast/schedule.ts`**

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { everyArticle, everyEvent, getMeta, setMeta } from '@/lib/db';
import { fitAll } from '@/lib/forecast/backtest';
import { sameAsLastWeek, usualRate } from '@/lib/forecast/baselines';
import { beijingQuestions, incidentQuestions } from '@/lib/forecast/geo/questions';
import { settle } from '@/lib/forecast/geo/settle';
import { liveCorpus } from '@/lib/forecast/geo/signals';
import { allForecasts, appendForecast, appendOutcome, canonical, currentOutcomes, forecastsForWeek, sha256,
  verifyLedger, type NewForecast, type StoredForecast } from '@/lib/forecast/ledger';
import { clip, explain } from '@/lib/forecast/logistic';
import { labelPending, reconstructStep, signalsOn, snapshotLive, trainingHistory } from '@/lib/forecast/store';
import { HOUR, WEEK, isoDay, mondayStart, weekId } from '@/lib/forecast/time';
import { FORECASTERS, type Corpus, type Question } from '@/lib/forecast/types';

/** A week whose first chance to issue comes later than this after Monday 00:00 UTC is skipped. */
export const ISSUE_LATE_LIMIT_MS = 24 * HOUR;
/** Reconstruction is sliced so that no ingest approaches the cron route's 300-second limit. */
export const RECONSTRUCT_BUDGET_MS = 60_000;

/** The build that settled an outcome: the standalone server runs from its own folder, next to .next/BUILD_ID. */
export function engineVersion(): string {
  try {
    return readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
  } catch {
    return 'dev';
  }
}

/** Issue this week's forecasts from all three forecasters, if due. Idempotent. */
export function issueWeek(questions: Question[], now: number): { issued: number; skipped: string | null } {
  const week = weekId(now);
  const monday = mondayStart(now);
  const late = now - monday > ISSUE_LATE_LIMIT_MS;
  if (late) {
    if (forecastsForWeek(week).length) return { issued: 0, skipped: null };
    const skipped = JSON.parse(getMeta('forecast_skipped_weeks') ?? '[]') as string[];
    if (skipped.includes(week)) return { issued: 0, skipped: null };
    setMeta('forecast_skipped_weeks', JSON.stringify([...skipped, week]));
    return { issued: 0, skipped: week };
  }
  const history = trainingHistory();
  const models = fitAll(history);
  const day = isoDay(now);
  const windowStart = new Date(now).toISOString();
  const windowEnd = new Date(monday + WEEK).toISOString();
  let issued = 0;
  for (const q of questions) {
    const s = signalsOn(day, q.id);
    if (!s) continue;
    const usual = usualRate(history, q.id, q.kind);
    const expl = explain(models.get(q.kind)!, usual, s, q.label);
    const base = { questionId: q.id, week, question: q.text, rule: q.rule, windowStart, windowEnd,
      issuedAt: windowStart, inputsHash: sha256(canonical(s)) };
    const entries: NewForecast[] = [
      { ...base, forecaster: FORECASTERS.usual, probability: clip(usual), explanation: null },
      { ...base, forecaster: FORECASTERS.persistence, probability: clip(sameAsLastWeek(history, q.kind, s)), explanation: null },
      { ...base, forecaster: FORECASTERS.model, probability: expl.probability, explanation: expl },
    ];
    for (const e of entries) if (appendForecast(e)) issued += 1;
  }
  return { issued, skipped: null };
}

/** Settle every question-week whose window ended at least its rule's grace period ago. */
export function settleDue(now: number, live: Corpus, version = engineVersion()): number {
  const outcomes = currentOutcomes();
  const first = new Map<string, StoredForecast>();
  for (const f of allForecasts()) {
    const key = `${f.questionId}|${f.week}`;
    if (!first.has(key)) first.set(key, f);
  }
  let settled = 0;
  for (const [key, f] of first) {
    const end = Date.parse(f.windowEnd);
    if (outcomes.has(key) || end + f.rule.graceHours * HOUR > now) continue;
    const s = settle(f.rule, { start: Date.parse(f.windowStart), end }, live);
    appendOutcome({ questionId: f.questionId, week: f.week, outcome: s.outcome, settledAt: new Date(now).toISOString(),
      evidence: s.evidence, engineVersion: version, corrects: null, reason: null });
    settled += 1;
  }
  return settled;
}

export interface CycleReport {
  week: string; snapshot: number; reconstructed: { done: boolean; wrote: number }; labelled: number;
  issued: number; skipped: string | null; settled: number; ledgerOk: boolean | null;
}

/** One pass of the forecast cycle; the ingest calls it after clustering. Every step is idempotent. */
export function runForecastCycle(now = Date.now(),
  opts: { budgetMs?: number; minPairEvents?: number } = {}): CycleReport {
  const live = liveCorpus(everyEvent(), everyArticle());
  const questions = [...incidentQuestions(live.events, opts.minPairEvents), ...beijingQuestions(live.articles, now)];
  const snapshot = snapshotLive(questions, live, now);
  const reconstructed = reconstructStep(now, opts.budgetMs ?? RECONSTRUCT_BUDGET_MS, live, { minPairEvents: opts.minPairEvents });
  const labelled = labelPending(now, live);
  const { issued, skipped } = issueWeek(questions, now);
  const settled = settleDue(now, live);
  let ledgerOk: boolean | null = null;
  const today = isoDay(now);
  if (getMeta('forecast_verified_day') !== today) {
    const check = verifyLedger();
    setMeta('forecast_verified_day', today);
    setMeta('forecast_ledger', JSON.stringify({ ...check, at: new Date(now).toISOString() }));
    ledgerOk = check.ok;
  }
  return { week: weekId(now), snapshot, reconstructed, labelled, issued, skipped, settled, ledgerOk };
}
```

- [ ] **Step 4: Wire it into `runIngest` in `lib/ingest/pipeline.ts`**, directly after the alerts `try … catch`
block (before `const byLanguage`):

```ts
  // Forecasts run here for the same reason alerts do: new events exist. A failure is logged and never fails
  // the refresh. See docs/specs/2026-09-30-predictive-intelligence-design.md.
  try {
    const { runForecastCycle } = await import('@/lib/forecast/schedule');
    const f = runForecastCycle();
    if (f.snapshot) log(`forecasts: ${f.snapshot} signal snapshots`);
    if (f.reconstructed.wrote) log(`forecasts: reconstructed ${f.reconstructed.wrote} past rows${f.reconstructed.done ? ' (done)' : ''}`);
    if (f.skipped) log(`forecasts: week ${f.skipped} skipped — the first chance came more than 24 hours late`);
    if (f.issued) {
      const { sendEnvelope } = await import('@/lib/forecast/envelope');
      const sent = await sendEnvelope(f.week);
      log(`forecasts: issued ${f.issued} for ${f.week}; envelope ${sent.delivered ? 'sent' : `not sent (${sent.reason})`}`);
    }
    if (f.settled) log(`forecasts: settled ${f.settled}`);
    if (f.ledgerOk === false) log('forecasts: RECORD CHAIN BROKEN — see /admin');
  } catch (e) {
    log(`forecasts skipped: ${e instanceof Error ? e.message : String(e)}`);
  }
```

(`sendEnvelope` arrives in Task 11; until then this `import` fails at runtime only inside the `try`, and the
source test above does not execute it.)

- [ ] **Step 5: Correct the spec's "called from".** In `docs/specs/2026-09-30-predictive-intelligence-design.md`,
change the heading `### The weekly cycle — \`lib/forecast/schedule.ts\`, called from \`maintainCorpus\`` to
`### The weekly cycle — \`lib/forecast/schedule.ts\`, called by the ingest after \`maintainCorpus\``.

- [ ] **Step 6: Run it — expect PASS (6 tests)**

Run: `npx vitest run tests/forecast-schedule.test.ts`

- [ ] **Step 7: Commit**

```bash
git add lib/forecast/schedule.ts lib/ingest/pipeline.ts tests/forecast-schedule.test.ts docs/specs/2026-09-30-predictive-intelligence-design.md
git commit -m "Forecasts: the weekly cycle — snapshot, reconstruct, issue, settle, verify — run by the ingest"
```

---

### Task 11: The weekly sealed envelope

**Files:**
- Create: `lib/forecast/envelope.ts`
- Modify: `.env.example`
- Test: `tests/forecast-envelope.test.ts`

**Interfaces:**
- Consumes: `sendDigest`, `Digest`, `SendOptions`, `SendResult`, `MailMessage` (`lib/alerts/send`);
  `chainHeads`, `forecastsForWeek`, `StoredForecast`, `ChainHeads` (Task 8); `FORECASTERS` (Task 1).
- Produces: `renderEnvelope(week, forecasts, heads): Digest`, `sendEnvelope(week, opts?): Promise<SendResult>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-envelope-')), 'test.db');

const { renderEnvelope, sendEnvelope } = await import('@/lib/forecast/envelope');
const { appendForecast } = await import('@/lib/forecast/ledger');
const { incidentQuestion } = await import('@/lib/forecast/geo/questions');
import type { MailMessage } from '@/lib/alerts/send';

const q = incidentQuestion('CHN', 'IND');
for (const [forecaster, p] of [['usual-rate@1', 0.21], ['same-as-last-week@1', 0.3], ['signal-model@1', 0.31]] as const) {
  appendForecast({ forecaster, questionId: q.id, week: '2026-W41', question: q.text, rule: q.rule,
    windowStart: '2026-10-05T00:30:00.000Z', windowEnd: '2026-10-12T00:00:00.000Z', issuedAt: '2026-10-05T00:30:00.000Z',
    probability: p, inputsHash: 'x',
    explanation: forecaster === 'signal-model@1'
      ? { probability: p, usual: 0.21, reasons: [], text: '31%. The usual rate for China–India is 21%.' } : null });
}

describe('the sealed envelope', () => {
  it('lists each question with all three forecasts and seals the record', async () => {
    const { forecastsForWeek, chainHeads } = await import('@/lib/forecast/ledger');
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
```

Save as `tests/forecast-envelope.test.ts`.

- [ ] **Step 2: Run it — expect FAIL** (module missing)

Run: `npx vitest run tests/forecast-envelope.test.ts`

- [ ] **Step 3: Write `lib/forecast/envelope.ts`**

```ts
import { sendDigest, type Digest, type SendOptions, type SendResult } from '@/lib/alerts/send';
import { chainHeads, forecastsForWeek, type ChainHeads, type StoredForecast } from '@/lib/forecast/ledger';
import { FORECASTERS } from '@/lib/forecast/types';

const pct = (p: number | undefined) => (p === undefined ? '—' : `${Math.round(p * 100)}%`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const seal = (label: string, h: ChainHeads['forecasts']) => (h ? `${label} #${h.seq} ${h.hash}` : `${label}: none yet`);

/**
 * The week's forecasts plus the heads of both record chains. Kept in the owner's inbox, it is a dated copy
 * outside the server that any later rewrite of the record would contradict.
 */
export function renderEnvelope(week: string, forecasts: StoredForecast[], heads: ChainHeads): Digest {
  const byQuestion = new Map<string, StoredForecast[]>();
  for (const f of forecasts) byQuestion.set(f.questionId, [...(byQuestion.get(f.questionId) ?? []), f]);
  const items = [...byQuestion.values()].map((fs) => {
    const p = (name: string) => fs.find((f) => f.forecaster === name);
    const model = p(FORECASTERS.model);
    return {
      question: fs[0].question,
      line: `signal model ${pct(model?.probability)} · usual rate ${pct(p(FORECASTERS.usual)?.probability)} · same as last week ${pct(p(FORECASTERS.persistence)?.probability)}`,
      why: model?.explanation?.text ?? '',
    };
  });
  const intro = 'These are this week\'s forecasts, recorded before the outcomes are known. Keep this email: the seal '
    + 'below fingerprints the whole record so far, so any later change to it would no longer match.';
  const seals = [seal('forecasts', heads.forecasts), seal('outcomes', heads.outcomes)];
  const text = [intro, '', ...items.flatMap((i) => [i.question, `  ${i.line}`, i.why ? `  ${i.why}` : '', '']),
    'Seal:', ...seals.map((s) => `  ${s}`)].join('\n');
  const html = `<p>${esc(intro)}</p><ul>${items.map((i) =>
    `<li><strong>${esc(i.question)}</strong><br>${esc(i.line)}${i.why ? `<br><em>${esc(i.why)}</em>` : ''}</li>`).join('')}</ul>`
    + `<p><strong>Seal</strong><br><code>${seals.map(esc).join('<br>')}</code></p>`;
  return { subject: `Kautilya forecasts — ${week} (sealed)`, text, html };
}

export async function sendEnvelope(week: string, opts: SendOptions & { to?: string } = {}): Promise<SendResult> {
  const to = (opts.to ?? process.env.FORECAST_DIGEST_TO ?? '').trim();
  if (!to) return { delivered: false, reason: 'no_recipient' };
  return sendDigest(to, renderEnvelope(week, forecastsForWeek(week), chainHeads()), opts);
}
```

- [ ] **Step 4: Add to `.env.example`**, after the `ALERTS_FROM=` block:

```bash
# Weekly "sealed envelope" for the forecast record: after each Monday's forecasts are issued, this address
# receives them with a fingerprint of the whole record so far. Keep the emails — they are a dated copy held
# outside the server. Uses the SMTP settings above. Unset means nothing is sent.
FORECAST_DIGEST_TO=
```

- [ ] **Step 5: Run it — expect PASS (3 tests)**

Run: `npx vitest run tests/forecast-envelope.test.ts tests/forecast-schedule.test.ts`

- [ ] **Step 6: Commit**

```bash
git add lib/forecast/envelope.ts tests/forecast-envelope.test.ts .env.example
git commit -m "Forecasts: weekly sealed-envelope email with both chain heads"
```

---

### Task 12: The admin section

**Files:**
- Create: `lib/forecast/admin.ts`, `components/ForecastPanel.tsx`
- Modify: `app/admin/page.tsx`
- Test: `tests/forecast-admin.test.ts`

**Interfaces:**
- Consumes: Tasks 7–9 and 11; `getMeta` (`lib/db`); `Panel`, `SectionTitle`, `Stat` (`components/ui`).
- Produces: `interface AdminForecast`, `interface ForecastAdminView`, `forecastAdminView(now?)`,
  `ForecastPanel({ view })`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-fadmin-')), 'test.db');

const { forecastAdminView } = await import('@/lib/forecast/admin');
const { ForecastPanel } = await import('@/components/ForecastPanel');
const { appendForecast } = await import('@/lib/forecast/ledger');
const { incidentQuestion } = await import('@/lib/forecast/geo/questions');

describe('the admin view', () => {
  it('is empty but useful before anything is issued', () => {
    const v = forecastAdminView(Date.parse('2026-10-01T00:00:00Z'));
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
    const v = forecastAdminView(Date.parse('2026-10-06T00:00:00Z'));
    expect(v.week).toBe('2026-W41');
    expect(v.issued).toEqual([{ questionId: q.id, question: q.text, usual: 0.21, persistence: null, model: 0.31, why: 'why' }]);
    const html = renderToStaticMarkup(createElement(ForecastPanel, { view: v }));
    expect(html).toContain(q.text);
    expect(html).toContain('31%');
  });
});
```

Save as `tests/forecast-admin.test.ts`.

- [ ] **Step 2: Run it — expect FAIL** (modules missing)

Run: `npx vitest run tests/forecast-admin.test.ts`

- [ ] **Step 3: Write `lib/forecast/admin.ts`**

```ts
import { getMeta } from '@/lib/db';
import { walkForward } from '@/lib/forecast/backtest';
import { allForecasts, chainHeads, forecastsForWeek, type ChainHeads, type LedgerCheck } from '@/lib/forecast/ledger';
import { goLiveStatus, summarise, type GoLive, type Summary } from '@/lib/forecast/score';
import { liveScored, reconstructionStatus, trainingHistory, type ReconStatus } from '@/lib/forecast/store';
import { FORECASTERS, type QuestionKind } from '@/lib/forecast/types';

export interface AdminForecast {
  questionId: string; question: string;
  usual: number | null; persistence: number | null; model: number | null; why: string | null;
}

export interface ForecastAdminView {
  /** The latest week with forecasts, or null before the first. */
  week: string | null;
  issued: AdminForecast[];
  live: Record<QuestionKind, GoLive>;
  backtest: Record<QuestionKind, Summary>;
  ledger: { check: (LedgerCheck & { at: string }) | null; heads: ChainHeads };
  skipped: string[];
  reconstruction: ReconStatus;
  historyWeeks: number;
}

export function forecastAdminView(now = Date.now()): ForecastAdminView {
  void now;
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
  return {
    week,
    issued: [...rows.values()],
    live: { incident: goLiveStatus(scored, 'incident'), beijing: goLiveStatus(scored, 'beijing') },
    backtest: { incident: summarise(backtest, 'incident'), beijing: summarise(backtest, 'beijing') },
    ledger: { check: check ? JSON.parse(check) : null, heads: chainHeads() },
    skipped: JSON.parse(getMeta('forecast_skipped_weeks') ?? '[]'),
    reconstruction: reconstructionStatus(),
    historyWeeks: new Set(history.map((h) => h.week)).size,
  };
}
```

- [ ] **Step 4: Write `components/ForecastPanel.tsx`**

```tsx
import { Panel, SectionTitle, Stat } from '@/components/ui';
import type { ForecastAdminView } from '@/lib/forecast/admin';
import type { GoLive, Summary } from '@/lib/forecast/score';

const pct = (p: number | null) => (p === null ? '—' : `${Math.round(p * 100)}%`);
const num = (x: number | null) => (x === null ? '—' : x.toFixed(3));
const KIND_LABEL = { incident: 'Incidents', beijing: 'Beijing statements' } as const;

function ScoreRow({ label, s }: { label: string; s: Summary }) {
  return (
    <tr className="border-t border-line">
      <td className="py-1 pr-3">{label}</td>
      <td className="py-1 pr-3 tabular-nums">{s.n}</td>
      <td className="py-1 pr-3 tabular-nums">{num(s.brier.model)}</td>
      <td className="py-1 pr-3 tabular-nums">{num(s.brier.usual)}</td>
      <td className="py-1 pr-3 tabular-nums">{num(s.brier.persistence)}</td>
      <td className="py-1 tabular-nums">{s.skill === null ? '—' : s.skill.toFixed(2)}</td>
    </tr>
  );
}

function GoLiveStat({ kind, g }: { kind: keyof typeof KIND_LABEL; g: GoLive }) {
  return <Stat label={`${KIND_LABEL[kind]}: readers`} value={g.live ? 'Live' : 'Not yet'}
    sub={g.live ? 'shown to readers' : `needs ${g.needs.join('; ')}`} />;
}

/** Josh's view of the forecast record: what was issued, how it scores, and whether it may be shown. */
export function ForecastPanel({ view }: { view: ForecastAdminView }) {
  const check = view.ledger.check;
  return (
    <Panel className="space-y-4 p-4">
      <SectionTitle kicker="Recorded before the outcome; readers see them only once they beat the baselines">Forecasts</SectionTitle>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Record chain" value={check === null ? 'Not yet checked' : check.ok ? 'Intact' : 'BROKEN'}
          sub={check ? (check.ok ? `${check.forecasts} forecasts, ${check.outcomes} outcomes` : `first break: ${check.brokenAt?.table} #${check.brokenAt?.seq}`) : undefined} />
        <Stat label="History weeks" value={view.historyWeeks}
          sub={view.reconstruction.done ? 'reconstruction complete' : `rebuilding from ${view.reconstruction.next ?? 'the start'}`} />
        <GoLiveStat kind="incident" g={view.live.incident} />
        <GoLiveStat kind="beijing" g={view.live.beijing} />
      </div>

      <div>
        <div className="mb-1.5 text-[12px] uppercase tracking-[0.16em] text-faint">Brier score (lower is better) · skill vs usual rate</div>
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-faint">
            <th className="pr-3 font-normal">Scored on</th><th className="pr-3 font-normal">n</th>
            <th className="pr-3 font-normal">Signal model</th><th className="pr-3 font-normal">Usual rate</th>
            <th className="pr-3 font-normal">Same as last week</th><th className="font-normal">Skill</th>
          </tr></thead>
          <tbody>
            <ScoreRow label="Incidents — live" s={view.live.incident} />
            <ScoreRow label="Incidents — backtest" s={view.backtest.incident} />
            <ScoreRow label="Beijing — live" s={view.live.beijing} />
            <ScoreRow label="Beijing — backtest" s={view.backtest.beijing} />
          </tbody>
        </table>
      </div>

      <div>
        <div className="mb-1.5 text-[12px] uppercase tracking-[0.16em] text-faint">
          {view.week ? `Issued for ${view.week}` : 'No forecasts issued yet'}
        </div>
        {view.issued.length > 0 && (
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-faint">
              <th className="pr-3 font-normal">Question</th><th className="pr-3 font-normal">Model</th>
              <th className="pr-3 font-normal">Usual</th><th className="pr-3 font-normal">Same</th><th className="font-normal">Why</th>
            </tr></thead>
            <tbody>
              {view.issued.map((r) => (
                <tr key={r.questionId} className="border-t border-line align-top">
                  <td className="py-1 pr-3">{r.question}</td>
                  <td className="py-1 pr-3 tabular-nums">{pct(r.model)}</td>
                  <td className="py-1 pr-3 tabular-nums">{pct(r.usual)}</td>
                  <td className="py-1 pr-3 tabular-nums">{pct(r.persistence)}</td>
                  <td className="py-1 text-muted">{r.why ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {view.skipped.length > 0 && (
        <p className="text-[13px] text-muted">Skipped weeks (first chance came more than 24 hours late): {view.skipped.join(', ')}</p>
      )}
    </Panel>
  );
}
```

- [ ] **Step 5: Render it on `app/admin/page.tsx`.** Add the imports

```ts
import { ForecastPanel } from '@/components/ForecastPanel';
import { forecastAdminView } from '@/lib/forecast/admin';
```

and, directly after the closing `</Panel>` of the "Corpus" panel, add:

```tsx
      <ForecastPanel view={forecastAdminView()} />
```

- [ ] **Step 6: Run it — expect PASS (2 tests)**, then the admin-related suites

Run: `npx vitest run tests/forecast-admin.test.ts tests/nav-admin.test.ts tests/a11y.test.ts`

If `border-line`, `text-faint` or `text-muted` are not classes this codebase defines, replace them with the ones
`app/admin/page.tsx` already uses (`grep -o 'text-[a-z]*' app/admin/page.tsx | sort -u`).

- [ ] **Step 7: Commit**

```bash
git add lib/forecast/admin.ts components/ForecastPanel.tsx app/admin/page.tsx tests/forecast-admin.test.ts
git commit -m "Forecasts: admin section — record integrity, scores, go-live progress, this week's forecasts"
```

---

### Task 13: The backtest script — run it, report before deploying

**Files:**
- Create: `scripts/forecast-backtest.ts`
- Modify: `package.json` (`scripts`)

**Interfaces:**
- Consumes: `everyArticle` (`lib/db`), `clusterArticles`, `liveCorpus`, `reconstructStep`, `trainingHistory`,
  `walkForward`, `summarise`.

- [ ] **Step 1: Write `scripts/forecast-backtest.ts`**

```ts
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
```

- [ ] **Step 2: Add the npm script** to `package.json` `scripts`, after `"demo:capture"`:

```json
    "forecast:backtest": "tsx --tsconfig tsconfig.scripts.json scripts/forecast-backtest.ts"
```

(Add a comma to the `"demo:capture"` line.)

- [ ] **Step 3: Run it on a copy of the local corpus**

```bash
cp kautilya.db "$TMPDIR/kautilya-backtest.db"
KAUTILYA_DB="$TMPDIR/kautilya-backtest.db" npm run forecast:backtest
```

Expected: a history summary, then per kind the three Brier scores, the skill and five calibration rows. Record
the numbers.

- [ ] **Step 4: STOP and report to Josh** — the three Brier scores and the skill per kind, in plain words: does
the signal model beat both baselines on history? If it does not for incidents, do not deploy; bring the result
back to the design (the signals and λ are the levers). Beijing is expected to sit at the usual rate (too few
positives to fit).

- [ ] **Step 5: Commit**

```bash
git add scripts/forecast-backtest.ts package.json
git commit -m "Forecasts: walk-forward backtest script"
```

---

### Task 14: Full verification, STATE.md, deploy

**Files:**
- Modify: `STATE.md`

- [ ] **Step 1: Full suite and type check**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: no type errors; every test passes (1,219 before this plan, plus the new forecast tests).

- [ ] **Step 2: STATE.md** — a new top section: what was built, the backtest numbers from Task 13, that the first
forecasts are due the first Monday after the deploy (5 October 2026 if deployed by then), that
`FORECAST_DIGEST_TO` must be set in `/etc/kautilya.env` for the envelope, and the go-live rule. Commit.

- [ ] **Step 3: Deploy** with Josh's approval, following `docs/runbooks/vps-deploy.md` exactly: build from an empty
`.next`, bundle check, `cp -r .next/static .next/standalone/.next/static`, dry run with the written-out excludes
and `bad = 0`, transfer as root + `chown`, restart, the step-11 probes, a browser check of `/admin`.
Set `FORECAST_DIGEST_TO` in `/etc/kautilya.env` only with Josh's confirmation of the address.

- [ ] **Step 4: Verify the first cycle read-only** after the next hourly ingest: the three tables exist with the
triggers (`sqlite3 -readonly … ".schema forecasts"`), `forecast_signals` has today's live rows, reconstruction has
progressed (`SELECT value FROM meta WHERE key = 'forecast_reconstruct_next'`), and the journal shows
`forecasts:` lines and no `forecasts skipped:`.

- [ ] **Step 5: Mirror** to AI_apps by the usual `git archive` refresh and a PR (Josh merges).
