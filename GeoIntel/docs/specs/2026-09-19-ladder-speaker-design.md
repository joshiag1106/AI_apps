# Whose formula is it? — speaker attribution for the escalation ladder

**Status:** approach approved by Josh 2026-09-19 ("A approved"): two stages, attribution first.
This spec is **Stage 1 only**. Stage 2 — an evidence-trail timeline of Beijing's formulae — gets
its own spec once Stage 1 has shipped, because it can only be built on attributed marks.

## Problem

The ladder detector matches formula text wherever it appears. It has no notion of who is speaking:
`scoreText` calls `highestRung` on the headline and snippet and stores the result. Yet the site
labels every hit an "official PRC formula" — on the board and dashboard stats, China Watch, dyad
pages, event badges and gauge, the account page, the alert emails, the LLM prompt and
`/methodology` (about fifteen places), and `/methodology` says nothing about the limit.

Measured on the 90-day corpus of 2026-09-19: **47** of 1,994 Chinese-language articles carry a
rung (2.4%). Reading all 47 headlines, about **28 are Beijing speaking** and about **19 are not** —
other governments using the same language: India and Pakistan protesting each other, Vietnam,
Russia to Japan, France to Iran, Pakistan to the US, an Iranian warning, a Taiwanese vice
president. The single India–China hit is *India* lodging representations *with* China. The test
alert email of 2026-09-19, "IND — PAK moved to rung 8", was an India–Pakistan event with nothing
to do with Beijing. No real subscriber has yet received a server alert, so nobody was misled by
mail; the dashboard, China Watch and the methodology have been overstating since the ladder
shipped. The reading is by hand and a few headlines are ambiguous.

This blocks Stage 2 directly: an arrow reading "Beijing → X" is only honest if it is known that
Beijing spoke, and co-occurrence of two countries in a headline says nothing about who did.

## Decisions

1. **An article keeps the raw match and gains a speaker.** `ladderRung`, `ladderZh`, `ladderEn`
   stay as detected; a new `ladderSpeaker` is `'prc' | 'other' | 'unclear' | null` (`null` = no
   formula).
2. **An event's ladder means Beijing's.** `buildEvent` takes `ladderRung/Zh/En` from the highest rung
   among the event's PRC-speaker articles only. Every event-level surface — both stats, China Watch,
   dyad pages, alerts, the event badge and gauge, the Ask answers — then means what it says with no
   change to its own code. The numbers on those surfaces fall; that is the correction.
3. **Escalation scoring is unchanged.** An article's rung still adds `severity × 0.5` to its
   escalation, so India and Pakistan protesting each other still registers as tension. That is about
   tension, not about Beijing. (The severity scale is PRC-calibrated, so whether another government's
   formula deserves the same weight is a separate question, recorded and not answered here.)
4. **`unclear` is excluded from the PRC surfaces, never hidden.** The claim on those surfaces is
   "PRC", so the safe direction is to leave out what cannot be shown to be Beijing. The audit script
   lists every `unclear` and `other` hit for a human to read.
5. **Other-speaker hits are labelled, not hidden.** On an event page an article row carrying a
   formula it did not get from Beijing reads "rung 8 · not Beijing" instead of a bare rung.

## How the speaker is decided

Chinese headlines put the speaker before the formula: `<subject>向<target>提出严正交涉`,
`<country><office>：…强烈抗议`, `<subject>方…`. The rule reads that structure, and is conservative
by construction.

- **The formula's clause.** The headline is split on the punctuation and separators headlines use
  (`：，；！？｜` and whitespace). The clause containing the formula is examined first.
- **Subject markers.** *Beijing's:* 中方, 中国, 我驻…使馆, 中国驻…使馆, 我使馆, 北京, 中国大陆, and the
  bare ministries 外交部, 国防部, 商务部, 国台办, 外交部发言人 — *unless* a bare ministry is directly
  preceded by another state's name or abbreviation (俄外交部, 伊朗外交部, 越南外交部). *Others':* every
  country's Chinese name and `-方` form from the gazetteer (印度, 印方, 巴基斯坦, 俄方, 美方…) plus the
  one-character abbreviations headlines actually use (俄 印 巴 日 韩 美 英 法 德 伊 菲 越 澳 泰 朝),
  each optionally followed by an office or actor word (方, 政府, 军方, 外交部, 总统府, 议员, 官员…).
- **Which marker wins.** The nearest subject marker *before* the formula in its clause; else any
  marker in the clause; else the headline as a whole. `X向Y提出…` gives the speaker as X. A response
  such as `美方声称…，中方驳斥：坚决反对` gives Beijing, because the nearest marker before the formula
  is 中方. Mutual formulae (`中国菲律宾互相传召对方大使“严正交涉”`) count as Beijing speaking, since it
  is one of the parties.
- **Otherwise:** a Beijing marker only → `prc`; another state's marker only → `other`; both present
  with no ordering that settles it, or neither → `unclear`.

**Measured, not reasoned.** The 47 hand-labelled headlines are committed as a fixture, with the
live server's rung-bearing headlines (public text, read-only) as a second sample the rules were not
written against. The rules are written from grammar and checked against the fixture; they are not
fitted to it. **The fixture is the entire hit set, so evaluating on it is evaluating on the
training set** — which is why the live sample matters and why the audit script keeps running on new
data. The acceptance bar is the direction that matters: **no false `prc` on the fixture**. A false
`prc` is precisely the defect this change exists to remove; an `unclear` costs recall, and recall is
reported, not hidden. Recall of the detector itself — how many real Beijing formulae headlines never
show — cannot be measured without ground truth and is said so.

## Storage and rollout

- `articles` gains `ladder_speaker TEXT` by the existing additive-migration pattern. Events gain
  nothing: their ladder is derived when they are built.
- Stored articles are re-analysed on every ingest before clustering, so the first ingest after a
  deploy fills every speaker and rebuilds every event's ladder in one pass. Until then a `null`
  speaker is treated as `unclear`, so nothing is over-claimed in the gap.
- `upsertArticles`, the row mapper and the `Article` type carry the new field.

## Surfaces

| Surface | Change |
|---|---|
| `buildEvent` | ladder from PRC-speaker articles only |
| Event page, article rows | non-Beijing formula reads "rung N · not Beijing" |
| Board and dashboard stat, China Watch, dyad pages, Ask, alerts | none — they read event ladders, so they become truthful and their numbers fall |
| Alerts | none in code; a test pins that an India–Pakistan formula produces no jump |
| LLM prompt (`lib/llm/analyse.ts`) | "PRC ladder formula detected" only for `prc`; otherwise "formula used by another party" |
| `/methodology` | says the speaker is attributed, how, that headlines are all it sees, and that recall is unknown |
| Glossary | "Escalation ladder" and "Rung" say "Beijing's"; a new "Speaker" entry |
| Export | the article's speaker is a column beside the rung |

## The shift report

`npm run ladder:shift` (read-only, also the audit): re-attributes every stored rung-bearing article
and prints counts by speaker; events carrying a ladder before and after; what the two stats would
read; which alert candidates disappear; and **every `other` and `unclear` headline in full**, so a
wrong call is read, not inferred from a total. Josh sees it before anything deploys — the same
discipline as the reprint change, and for the same reason: some numbers he already looks at will fall.

## Testing

Test-first, each watched failing for the right reason.

- **Attribution:** one test per grammar case above; the whole fixture, asserting zero false `prc`
  and printing the `unclear` count; determinism.
- **`buildEvent`:** mixed articles take the ladder from the PRC ones; an event whose only rungs are
  `other` or `unclear` has none.
- **Alerts:** an India–Pakistan formula produces no jump; a Beijing one still does.
- **Storage:** the migration is idempotent; an article round-trips its speaker; a legacy row reads
  as `unclear`.
- **Page and text:** the "not Beijing" label renders; `/methodology`, the glossary and the LLM prompt
  say the new thing. Existing tests whose fixtures set a rung with no speaker gain `'prc'`.
- **Verified against a real production build** before any deploy.

## Non-goals

Attributing the *target* of a formula; other governments' ladders; article body text (still behind
the redistribution review); changing escalation scoring; the timeline itself (Stage 2).

## Risks

- **Overfitting and an unmeasurable recall.** Mitigated by writing from grammar, the held-out live
  sample, the "no false `prc`" bar, and an audit that lists what was excluded.
- **A wrong `other` hides a real Beijing formula** — silent, and the failure a detector like this must
  not have. Mitigated by making both-markers-present `unclear` rather than a guess, by the audit
  listing every exclusion, and by re-reading that list weekly alongside the roster audit.
- **Numbers Josh already watches fall.** The board and dashboard stats count events carrying a
  ladder, and about two in five of the underlying hits are not Beijing's by my reading, so they
  should fall by roughly that share. The shift report prints the exact figure; the lower number is
  the accurate one.

## Open decisions for Josh (defaults given)

1. **`unclear` excluded from the PRC surfaces** (default), or included with a caveat.
2. **The label on another party's formula:** "not Beijing" (default — needs no identification), or the
   named country, which needs the marker table to be right about *which* country and is more
   likely to be wrong in public.
