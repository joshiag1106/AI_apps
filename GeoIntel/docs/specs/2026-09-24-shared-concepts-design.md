# Shared concept list — design

2026-09-24. Approved in conversation with Josh: reach **everywhere** (Lens and the Board), and **re-score
stored reports on ship**.

## Problem

A report's *kind* of pressure (its `Domain`: Military, Maritime, Cyber, Economic, Energy, Space, Nuclear,
Diplomatic, Internal, Technology) is decided by counting vocabulary from two lists that grew one language at
a time:

- `DOMAIN_HINTS` (`data/lexicon.ts`) — words per domain, +1 each;
- `LEXICON` — escalation terms with weights, most of them English, and each also votes +2 for its domain.

So the languages do not get the same chance of being read. English counts "invasion", "airstrike",
"blockade", "sanctions" twice over; Chinese has three military words; nobody counts "war", "attack",
"missile", "defence" or "energy" as bare words. Language Lens compares languages *within* a topic, so a
language with richer vocabulary looks more "framed". The Japanese/Arabic work earlier today proved it: a
first cut produced a 65%-vs-16% Middle East gap that was mostly vocabulary, and the fix — a pairwise rule —
is a patch that has to be re-applied by hand every time a word is added.

The same `Domain` also decides the Board's risk vectors (`lib/risk`, `DOMAIN_TO_VECTOR`) and gates
clustering (`lib/verify/cluster.ts:128`: two reports never join one event across domains). 64% of stored
reports are "Diplomatic", mostly as the fallback for "nothing matched".

## Goals

1. One table of **concepts**, each with its words in every compared language, as the single source of
   which-kind evidence.
2. A test that makes an incomplete concept a failure, unless the gap is stated with a reason.
3. Each concept counts once per report, whatever the number of synonyms or overlapping phrases matched.
4. English matching on whole words, so the short words English now lacks can be added safely.
5. Stored reports re-scored, and events rebuilt, when this ships.

## Non-goals

- Escalation intensity. `LEXICON` weights are unchanged; its `domain` field stops voting.
- Translating headlines (needs a paid service; Kautilya stays free).
- Changing Lens's statistics (`MIN_ARTICLES`, `MIN_GAP`, `Z_CRIT`) or its query-word caveat.
- Changing the clustering algorithm itself.

## Design

### The concept table — `data/concepts.ts`

```ts
type Lang = 'en' | 'zh' | 'hi' | 'ja' | 'ar' | 'ru';   // every language a Lens column can show today
interface Concept {
  id: string;                    // 'airstrike'
  domain: Domain;
  terms: Partial<Record<Lang | 'ur' | 'ko' | 'fa', string[]>>;
  /** A required language with no safe word, and why. */
  gaps?: Partial<Record<Lang, string>>;
}
```

- Required languages: en, zh, hi, ja, ar, ru. Urdu, Korean and Persian terms may be given (their Lens
  columns rarely reach 25 reports) but are not required.
- Chinese lists both Simplified and Traditional forms where they differ (军/軍, 冲突/衝突), because
  Taiwan outlets are filed as `zh`.
- A few dozen concepts (43 at first build). Every word now in `DOMAIN_HINTS`, and every `LEXICON` term that carries a
  domain, lands in a concept, so no current evidence is silently dropped. New concepts are added only
  where the corpus shows them recurring (the method used for Japanese and Arabic).
- `gaps` is for honest absences: no safe word (通信 sits inside 時事通信, a news agency's name; bare
  ウラン sits inside ウランバートル), or a word that is mostly figurative (حدود, "limits"). The completeness
  test accepts a stated gap and nothing else.
- `DOMAIN_HINTS` is removed; `LEXICON` entries lose their `domain` field.

### Matching and counting — `lib/analyze/score.ts`

- **Whole words for Latin-script terms**: a term matches only as a whole word, optionally followed by one
  inflectional ending (`s`, `es`, `d`, `ed`, `ing`), so "war" finds "wars" but not "award", "software"
  or "warn", and "clash" still finds "clashes". Non-Latin terms keep substring matching (Chinese and
  Japanese have no spaces; Arabic and Hindi stems carry affixes), as today. This applies to concept
  matching only: `LEXICON`'s escalation matching keeps its current rule, so no escalation score moves.
- **Longest match first, spans masked**: all term hits in the text are collected, sorted longest first,
  and a hit overlapping an already-accepted span is dropped. "trade war" is Economic and does not also
  count "war"; サイバー攻撃 is Cyber and does not also count 攻撃.
- **Each concept counts once**: the domain tally is the number of distinct concepts matched per domain.
- **Ties** stay deterministic, broken by the existing domain order (as now).
- `evidencedDomain` (Lens) and `classifyDomain` (stored domain) keep sharing one tally, so the existing
  test that they agree still holds. The 'Diplomatic' fallback for "nothing matched" is unchanged.

### Re-scoring — `lib/analyze/rescore.ts` (changed during planning)

The first draft proposed a manual backfill script. Built instead: `rescoreDomainsIfStale()` compares a
fingerprint of the concept table + `NEUTRAL` + `MATCHER_VERSION` with a `domain_vocab` meta row, and when
they differ recomputes `domain` for every stored article (that column only, one transaction). The ingest
pipeline calls it just before clustering, so the first hourly refresh after a deploy re-scores the live
database and regroups events — and every future vocabulary edit re-scores itself, with nothing to remember.

On production: take `sqlite3 .backup` of `/var/lib/kautilya/kautilya.db` BEFORE the deploy (the next cron
run re-scores), deploy, then trigger `/kautilya/api/cron` once and run the live checks.

## What changes for readers

- Every Lens column's numbers, and possibly its verdicts. Each changed verdict is explained before ship.
- The Board's risk vectors: fewer "Diplomatic" by default, more of the categories reports actually show.
- Events regroup, because clustering requires a shared domain. More cross-language events are expected
  (an English and an Arabic report of one strike should now share a domain); fragmentation or blobbing
  is the risk.
- The demo tour builds from live data, so its examples may change; its chapter rules do not.

## Verification — before any deploy

1. **Tests**: concept completeness; whole-word matching ("award" ≠ war); masking ("trade war" → Economic);
   one-count-per-concept; per-language examples for each domain from real headlines; today's guards
   (تصعيد, 有事, 通信, حدود, ウランバートル) keep passing.
2. **Coverage**: readable share per language, before and after.
3. **Lens**: every verdict before and after, and why each change happened.
4. **Board**: domain mix of stored articles before and after; the largest moves in the top countries'
   vectors.
5. **Clustering**: `scripts/cluster-shape.ts` and `scripts/cluster-gates.ts` before and after; read the
   largest cluster's members; confirm a known large story has not shattered; count cross-language events.
   Baseline (2026-09-24, local, current code): 9,252 articles → 5,179 events, 22% multi-report, mean 1.79,
   largest 66; 50 stored events span two languages.
6. **Precision by hand**: ~30 classified headlines per language (en, zh, hi, ja, ar, ru), counted as
   right / debatable / wrong.
7. A clean production build, run locally against a copy of the real corpus, before the live deploy.

## Rollout

Branch `shared-concepts`; merge to `main` when the checks above pass; deploy per
`docs/runbooks/vps-deploy.md`; back up the live database; run the backfill and one cron call; re-check
live; mirror to AI_apps.

## Risks

- **Clustering regressions**: domain agreement is a hard gate, so re-scoring moves event boundaries.
  Mitigation: the measurements in step 5, read by a person, before ship.
- **Short English words are ambiguous** ("strike" is also a labour strike, "attack" a verbal one).
  Mitigation: whole-word matching, masking of longer phrases (labour strike → Internal), and the hand check.
- **Backfill on the live database**: it writes one column of `articles` only; the backup comes first and
  restoring it is one copy.
