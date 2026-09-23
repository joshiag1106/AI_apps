# Language Lens — design

2026-09-23. Approved by Josh ("build, verify, and deploy") after the design below was shown in chat.

## What it is

A page at `/lens` (live: `/kautilya/lens`) that takes each search topic ("beat") Kautilya runs in
more than one language and puts the languages side by side: what each was asked, how its reporting
frames the topic, which other states it brings in, and its newest headlines to read. One sentence per
topic names the sharpest difference — only when the difference is large and unlikely to be chance.

`data/feeds.ts` has said since the beats were written that *"querying the same event in Chinese and
in English is what surfaces divergent framing — and divergence is the signal."* Nothing on the site
has ever shown that divergence. This page does.

## What was measured before choosing it, and what was dropped

Measured on the local corpus (7,381 articles, 4,376 events, 2026-06-20 → 2026-09-20):

- **"What English readers are missing" (events covered in other languages but not English) — dropped.**
  Only 50 of 4,376 events span two languages and none span three. `lib/verify/cluster.ts` links two
  reports across languages only through a shared named hotspot or two shared glossed Chinese terms;
  a Hindi, Arabic, Japanese or Russian headline has no other cross-language path (`titleEn` is not
  used as a token). An English-absence view would mostly display the clustering's blind spot as if it
  were editorial silence.
- **"What each language's press attends to" across the whole corpus — dropped.** Language shares are
  dominated by which beats are queried in which language: Japanese is 100% the China–Taiwan query
  (91.5% of it names Taiwan), Arabic is 100% the Middle East query, Hindi is three India beats. The
  view would measure Kautilya's feed design, not anyone's press.
- **Within one beat, across languages — kept.** The same question is put to each language, so the
  comparison is like for like. In India–China, military framing is 32.7% of English reports (n=895),
  32.0% of Hindi (n=361) and 17.7% of Chinese (n=350); English vs Chinese gives z ≈ 5.3.
- **Escalation score — not compared.** Its per-language means within a beat are flat (0.0, 1.6, 0.9
  in India–China), so it says nothing here.

**The confound this page must show, not hide:** queries are worded differently per language. Hindi
India–China is asked only about the *border* (भारत चीन सीमा); Chinese is also asked about *relations*
and *negotiations* (中印关系, 印度 边界 谈判). Part of any framing difference can come from the question.
So every column shows exactly what it was asked, with an English gloss, and the page says so.

## Rules

- **Scope:** articles with a `beat_id` (topic-query results). Direct feeds are excluded — they were not
  asked the same question.
- **Column language:** the article's detected `language`. A query's language is its locale's prefix
  (`zh-TW` → `zh`, `ur-PK` → `ur`).
- **A column is shown** when that language has ≥ 25 articles in the beat (`MIN_ARTICLES`).
  **A beat is shown** when ≥ 2 columns qualify. Today that is ~9 beats; `prc-mofa` (Chinese only),
  `korea` (Korean n=5), `tech`, `pla` fall out, and China–Taiwan compares Chinese with Japanese.
- **Framing:** share of the column's articles in each `domain`, highest first.
- **Who else is named:** states in `actors` other than the beat's own `dyad`, by share of the column's
  articles; at most 3, each named in ≥ 3 articles. Beats without a dyad exclude nothing.
- **Latest:** the column's 3 newest articles, with `titleEn` gloss when present, linked to their
  event when the article belongs to one.
- **Sharpest difference:** across every pair of shown columns and every domain, a two-proportion z-test.
  A difference is notable when the gap is ≥ 10 percentage points (`MIN_GAP`) **and** |z| ≥ 2.58
  (`Z_CRIT`, ≈ p < 0.01, two-sided). Report the largest notable gap (ties → larger |z|). None notable →
  say so plainly. Framing only; "who else" is not tested (too many small counts to test honestly).
- **Window:** everything stored; the section shows the first and last date of the reporting it used.

## Architecture

| Unit | Does | Depends on |
|---|---|---|
| `lib/lens/compare.ts` | Pure: `lens(articles, beats, eventOf) → BeatLens[]`, plus `twoProportionZ`. No DB, no `server-only`. | `Beat`, `Article` types |
| `lib/db/index.ts` `beatArticles()` | `SELECT * FROM articles WHERE beat_id IS NOT NULL` | existing `rowToArticle` |
| `lib/queries.ts` `lensData()` | `cache`d: reads beat articles, maps article → event with the existing `eventIdsByArticle`, calls `lens` | the two above |
| `data/feeds.ts` | Each non-English query gains an `en` gloss | — |
| `components/LensBeat.tsx` | Presentational: one beat's section from a `BeatLens` + a country-name map | `Panel`, `LANGUAGE_LABEL` |
| `app/lens/page.tsx` | Heading, method note, one `LensBeat` per beat, empty state | `lensData`, `countryName` |
| `components/Nav.tsx`, `app/layout.tsx` | "Language Lens" in the nav (after China Watch) and footer (Focus) | — |

No schema change, no change to clustering, scoring, quota or any existing page's data. Unmetered, like
`/events`. Headline links use `next/link`, so `basePath` applies.

## Testing

- `tests/lens.test.ts` — the rules above, each a named case: thresholds (column and beat), locale →
  language, glosses carried, framing shares, who-else excluding the dyad and the ≥ 3 floor, latest
  three newest-first with event ids (null when absent), since/until, unknown or missing `beatId`
  ignored, `twoProportionZ` (symmetry, zero on no variance), and the sharpest-difference gate in both
  directions: a 33% vs 18% gap on hundreds of articles is reported; a 40% vs 20% gap on 25 vs 25 is
  not (z ≈ 1.5); a 3-point gap on thousands is not.
- A feeds check — every non-English beat query has an `en` gloss.
- `tests/lens-page.test.ts` — `LensBeat` rendered to static markup: labels, glosses, the difference
  sentence present/absent, headline links to `/events/<id>`, `lang` on non-English headlines.
- The footer route check in `tests/layout.test.ts` covers the new link.
- Then the real thing: a clean production build run as the standalone server against a copy of the
  local corpus, `.next/static` copied in, checked in a browser at desktop and mobile widths with the
  console and network tab clean — the check that caught the 2026-09-23 static-asset bug.

## Revision — framing is counted only where it is evidenced (same day, after the first real-data run)

The first build, run on the real corpus, said China–Taiwan was framed diplomatically by "100% of
Japanese reports" and the Middle East by "96% of Arabic". Both were the classifier, not the press:
`classifyDomain` falls back to 'Diplomatic' when a report's words match nothing, and only 3% of
Japanese and 4% of Arabic topic-search reports match anything (English 45%, Chinese 45%, Hindi 52%,
Russian 74%). So:

- Framing comes from `evidencedDomain(title, snippet)` (new in `lib/analyze/score.ts`, sharing
  `classifyDomain`'s tally, which is otherwise unchanged) — null when the words show nothing.
- Each column reports `classified` (reports with evidence); framing shares are of those.
- A column with fewer than `MIN_ARTICLES` classified reports shows no framing bars — it says framing
  cannot be read yet and gives the count — and takes no part in the sharpest-difference test, which
  uses classified counts as its sample sizes.
- Cost: ~135 ms over all ~5,800 topic-search reports per request, inside the page's `cache`.
