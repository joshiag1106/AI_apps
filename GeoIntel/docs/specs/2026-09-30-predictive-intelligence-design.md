# Predictive intelligence — design

2026-09-30. Approved in conversation with Josh, section by section. His choices: predict **incidents and
Beijing's rhetoric**; a **transparent model** (no AI forecaster for now); readers see forecasts only once they
**earn it**; build the **record first** (approach A), with an independent cross-check as a later phase.

## Problem

Kautilya describes what has happened — events, corroboration, risk, framing — but says nothing about what is
likely to happen next. A forecast is only worth reading if it can be checked, and most "predictions" cannot:
they are vague, they are never scored, and they are quietly forgotten when wrong. Kautilya's standing rule is
that confidence measures corroboration, not truth; forecasts need the same honesty, which means stating them
as probabilities, writing them down before the outcome is known, and publishing the score — misses included.

## Goals

- Weekly probabilities for two kinds of real-world event: **a corroborated military incident** between two
  states, and **an official Beijing escalation-ladder statement** aimed at a state.
- Every forecast recorded **before** its outcome is known, in a record that cannot be changed afterwards
  without detection, with the rule for "did it happen?" fixed at the moment of forecasting.
- Every question **settled automatically** against corroborated evidence, with the evidence kept.
- Every forecaster **scored** (Brier score, skill against baselines, calibration), and compared against two
  simple baselines it must beat.
- A plain-words explanation with every forecast.
- Readers see forecasts **only once the live record shows they beat the baselines**; until then, the admin
  page only.
- Subject-neutral machinery (record, scoring, model fitting) kept apart from the geopolitics-specific
  questions and signals, so another subject can reuse it later.

## Non-goals

- An AI (language-model) forecaster. It can join later as another named forecaster on the same record.
- An independent external check of outcomes (e.g. GDELT). Phase 2, once weeks of live forecasts exist.
- Forecasting Kautilya's own indices ("will tension rise?") — not a real-world event.
- Per-rung Beijing questions ("rung 6 or higher"); pairs below the activity threshold; any forecast horizon
  other than the week.
- Showing reconstructed (backtest) forecasts to readers as if they were a track record.

## Design

### The questions — `lib/forecast/geo.ts`

Issued **once a week**. A question-week is identified by the ISO week of its Monday (`2026-W41`).

**Incident questions** — `incident:<A>-<B>` (ISO3, sorted). *"Will a corroborated military incident between
A and B begin in the next 7 days?"* Asked for every pair with **at least 100 stored events** at issue time — the
corpus holds 90 days — which was 36 pairs locally on 2026-09-30.

An incident **counts** if there is an event that:

1. was **first seen inside the window**;
2. has domain **Military**;
3. names **both** states among its actors;
4. has escalation **≥ 10**;
5. has confidence **≥ 30**;
6. is reported by **at least two different outlets**.

**Beijing questions** — `beijing:<X>`, and one `beijing:any`. *"Will Beijing make an official
escalation-ladder statement aimed at X in the next 7 days?"* Asked for every state that was the target of a
Beijing (`prc`-speaker) ladder statement in the trailing 90 days (Japan, the USA, the Philippines, South Korea
and Pakistan locally). A statement **counts** if a stored article published inside the window has
`ladderSpeaker = 'prc'`, a ladder rung, and `ladderTarget = X` (for `any`, any target or none).

Both rules, with every threshold, are written into each forecast's record entry as JSON, so the definition in
force when a forecast was made can never be confused with a later one.

### The signals and the daily snapshot — table `forecast_signals`

| Column | Meaning |
|---|---|
| `day` | UTC date of the snapshot |
| `question_id` | `incident:CHN-IND`, `beijing:JPN`, … |
| `signals` | JSON, below |
| `source` | `live` or `reconstructed` |
| `outcome` | For a reconstructed Monday row, its week's hindsight label once settled (null until then); unused for live rows, whose outcomes are on the record |
| `created_at` | ISO timestamp |

Primary key `(day, question_id)`. **Never pruned** — it is the model's memory beyond the 90-day article
retention (about 15,000 rows a year).

Signals, each computed only from reports published **before the snapshot time** — for a live row, the
ingest run that writes it; for a reconstructed row, 00:00 UTC of `day`. A forecast issued in the same run uses
that snapshot, and its window starts at the issue time, so no signal can see into the window:

| Signal | Definition |
|---|---|
| `incidents7`, `incidents28` | Qualifying incidents (the rule above) first seen in the last 7 / 28 days |
| `tension` | The pair's `dyadTension` score |
| `tensionChange7` | `tension` minus the snapshot's `tension` 7 days earlier (0 if that snapshot is missing) |
| `surge` | (reports on the pair in the last 7 days + 1) ÷ (average weekly reports over the 28 days before + 1) |
| `escWeight7` | Σ max(0, escalation) × confidence/100 over the pair's events last seen in the last 7 days |
| `beijing7`, `beijing28`, `beijingMaxRung28` | Beijing ladder statements in the last 7 / 28 days, and the highest rung: for an incident pair that includes China, those aimed at the other state (0 for pairs without China); for `beijing:X`, those aimed at X; for `any`, all |

**Live rows** are written by the first ingest at or after 00:00 UTC each day, from the events that ingest has
just clustered — no extra clustering.

**Reconstructed rows** rebuild the past from the stored articles: for each past Monday (and the day 7 days
before it, for `tensionChange7`), cluster only the articles published before that moment and compute the
signals "as of" then. Only Mondays are needed, so this is about two clusterings per past week. The ingest does
it itself when it finds the table empty, **in slices of at most 60 seconds per run** so no single ingest
approaches the cron route's 300-second limit. Reconstructed rows carry a mild hindsight advantage (today's
matching rules; topic searches that reach back 7 days), so they are used for fitting and the backtest only,
**never** for scoring the live record or the go-live test. Production holds articles from 3 July, so its
reconstructed history begins once 28 days of signals exist — about 8 usable weeks.

### The forecasters — `lib/forecast/baselines.ts`, `lib/forecast/logistic.ts`

Three named forecasters issue for every question, every week. Each record entry carries `name@version`.

1. **`usual-rate@1`** — the question's share of past weeks with a "yes", shrunk toward the pooled rate of its
   question type: `(yes + 4 × pooled) / (weeks + 4)`, over up to 52 past weeks (reconstructed and settled).
2. **`same-as-last-week@1`** — P(yes | last week yes) or P(yes | last week no), pooled across the question
   type, with add-one smoothing.
3. **`signal-model@1`** — logistic regression with the question's usual rate as offset:
   `logit(p) = logit(usual) + Σ wᵢ · zᵢ`, where `zᵢ` are the signals standardised over the training set.
   L2-penalised (λ = 1 on standardised weights), fitted by Newton's method (IRLS), one model per question
   type, **refitted every Monday before issuing** on all past weeks. With fewer than **10 "yes" examples per
   signal** (90) for a type, all weights are 0 — the model is exactly the usual rate until there is something to
   learn, and its explanation lists the week's notable signals as observations. (Changed from 10 in total after
   the first backtest, 2026-09-30: fitted on 26 positives it overfitted and lost to both baselines.)

All probabilities are clipped to **[0.01, 0.99]**.

**The explanation** stored with each signal-model forecast: the usual rate, then each signal whose effect is at
least 1 point — its value in words and its effect, where a signal's effect is the forecast minus the forecast
with that signal at its training average. *"31%. India–China's usual rate is 21%; two incidents last week
(+7 points); reporting 1.8× normal (+4); tension easing (−1)."* The effects need not sum exactly to the gap,
and the text does not claim they do.

### The record — tables `forecasts` and `outcomes`, `lib/forecast/ledger.ts`

**`forecasts`**: `seq` (autoincrement), `forecaster`, `question_id`, `week`, `question` (the words), `rule`
(JSON), `window_start`, `window_end`, `issued_at`, `probability`, `explanation` (JSON), `inputs_hash`
(SHA-256 of the signals used), `prev_hash`, `hash`. Unique `(forecaster, question_id, week)`.

**`outcomes`**: `seq`, `question_id`, `week`, `outcome` (0 or 1), `settled_at`, `evidence` (JSON: event or
article ids, titles, outlets, links, dates), `engine_version` (the build id that settled it), `corrects`
(null, or the `seq` this entry corrects), `reason` (null, or why), `prev_hash`, `hash`. One outcome per
question-week, shared by all forecasters.

**Tamper evidence**, three layers:

1. **Triggers** reject every `UPDATE` and `DELETE` on both tables (`RAISE(ABORT, 'append-only')`).
2. **A hash chain per table**: `hash = SHA-256(canonical JSON of the entry's fields, prev_hash)`, where
   `prev_hash` is the previous entry's hash (64 zeros for the first). `verifyLedger()` recomputes both chains;
   the daily ingest runs it, and the admin page shows the result in green or red with the first broken `seq`.
3. **A weekly sealed envelope**: after the Monday issue, an email to the address in `FORECAST_DIGEST_TO` with
   both chain heads (latest `seq` and `hash`) and the week's forecasts. The owner's inbox then holds dated,
   third-party copies that any rewrite of history would contradict. If the variable is unset, nothing is sent
   and the admin page says so.

**Corrections, never edits**: a wrong settlement is fixed by a new `outcomes` entry with `corrects` and
`reason`. Scoring uses the newest entry for a question-week; both remain visible.

### The weekly cycle — `lib/forecast/schedule.ts`, called by the ingest after `maintainCorpus`

On each ingest, after clustering:

1. **Snapshot** — if today's live `forecast_signals` rows do not exist, write them.
2. **Reconstruct** — if reconstruction is incomplete, do the next ≤ 60-second slice.
3. **Issue** — if it is Monday 00:00 UTC or later and this ISO week has no forecasts: refit, then issue all
   three forecasters for every question. The window runs **from the issue time to the next Monday 00:00 UTC**.
   If the first chance comes **more than 24 hours late**, the week is skipped (and the admin page shows it) so
   that no forecast is ever made after much of its window has passed.
4. **Settle** — every question-week whose window ended **72 hours or more** ago and has no outcome is settled
   by the rule stored with its forecasts. The 72 hours let a second outlet's report join an incident that
   began inside the window; an incident first seen after the window never counts.
5. **Verify** — once a day, `verifyLedger()`.

Every step is idempotent and wrapped like the alerts are: a forecasting failure is logged and never fails the
ingest.

### Scoring and the go-live rule — `lib/forecast/score.ts`

Per forecaster and question type, over **live, settled** forecasts only:

- **Brier score**: mean of (p − outcome)².
- **Skill** against `usual-rate`: 1 − Brier(model) ÷ Brier(usual rate).
- **Calibration**: bands 0–10%, 10–20%, 20–35%, 35–50%, 50–100%; per band, mean forecast against observed
  frequency and the count.

`signal-model` is **live for readers** for a question type when all hold:

1. at least **6 settled weeks** and **150 settled forecasts** of that type;
2. its Brier score is **lower than both baselines'**;
3. in every calibration band with **20 or more** forecasts, the observed frequency is within **±15 points** of
   the mean forecast.

It is **withdrawn** again, automatically, if over the trailing 8 settled weeks its Brier score is not lower than
both baselines'. Go-live is a function of the record, computed on read — there is no switch to flip or forget.

### What people see

- **Admin page, from the first week**: this week's forecasts from all three forecasters with explanations; the
  scores, skill and calibration chart per question type; the backtest results; chain integrity; skipped weeks;
  and go-live progress ("needs 3 more settled weeks and 60 more forecasts").
- **Admin preview** (added 2026-09-30, approved by Josh for the 1 October presentation): what the three
  forecasters would say for the next 7 days if asked now, computed on demand through the same code path as the
  weekly issue and **never written to the record**. The record holds only forecasts issued at the start of their
  week; the first is Monday 5 October.
- **Readers, once live**: a "Next 7 days" card on each pair page (*"Chance of a corroborated military
  incident: 31% — usually 21%"*, with the explanation and a link to the record), and a **/forecasts** page:
  the full live record including misses, the calibration chart, the rules and the method. Like every page, it
  needs an account.
- **Readers, before go-live**: nothing.

## Verification — before any deploy

- Test-first, as usual, for: each settlement rule on hand-built fixtures (two outlets, not two reports from
  one; first seen inside the window; the 72-hour grace; `beijing:any`); the **no-peeking** rule (a report
  published after the snapshot time must not change any signal); both baselines and the logistic fit against
  hand-worked examples; Brier, skill and calibration arithmetic; the record — triggers refuse edits and
  deletes, a row altered with the triggers dropped is caught by `verifyLedger()`, no duplicate issue, a late
  issue shifts the window and a very late one skips the week, corrections; the go-live and withdrawal rules.
- A **walk-forward backtest** over the local corpus: for each reconstructed week, fit on the weeks before it
  only, forecast it, settle it. Report each forecaster's Brier score, skill and calibration **to Josh before
  deploying**. If the signal model cannot beat the baselines even on history, adjust before shipping.
- Full suite and `tsc` clean; the runbook's deploy and probes.

## Rollout

1. Deploy the record, forecasters, scoring and admin page (additive tables only; no change to existing rows or
   pages). The reader surfaces (pair-page card, /forecasts) can follow in a second release, any time before the
   earliest go-live — until then the go-live rule simply has nothing to switch on.
2. The same night's first ingest past 00:00 UTC writes the first live snapshot and begins reconstruction.
3. **First forecasts: Monday 5 October 2026**, 05:30 IST (00:00 UTC), if deployed by then — otherwise the first
   Monday after the deploy. First settlement: 10 days later (Thursday 15 October).
4. Earliest possible go-live: after 6 settled weeks — **mid-November 2026**; Beijing questions later.
5. Phase 2, separately designed: an independent outcome cross-check (GDELT) and, if wanted, an AI forecaster
   as a fourth named entry on the record.

## Risks

- **Small samples.** Six weeks of 36 incident questions is enough to tell a useful model from a useless one,
  not to tune a subtle one. The small, penalised model and the go-live thresholds are chosen for that.
- **Correlated questions.** One incident can involve several pairs (China–USA and China–Philippines). Scores
  treat them as separate; the calibration bands and the 150-forecast floor absorb some of this.
- **Kautilya settles its own questions.** A change in coverage can look like a change in the world. The
  two-outlet rule and the recorded evidence limit this; phase 2's external cross-check addresses it.
- **Rules can change between issue and settlement** (a lexicon fix, a new feed). Each outcome records the
  engine version that settled it, so a shift can be traced.
- **Beijing questions are rare events.** With about 8 past examples the model starts at the usual rate, and
  its go-live will take months.
- **A probability read as a promise.** Reader surfaces say "chance", show the usual rate beside it, and link to
  the record with its misses.
