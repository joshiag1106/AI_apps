# Reprint Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count a wire story printed by several outlets once, in every confidence signal, and show the reprints folded under the report they repeat.

**Architecture:** A new pure module groups a cluster's articles into "families" of near-identical headlines. `scoreConfidence` computes every signal from one representative per family (the contradiction check still reads the whole cluster). The event page groups its evidence list with the same function, so page and score cannot disagree. A fourth opt-in surface on `RevealOnView` folds each family's reprints closed as it scrolls into view.

**Tech Stack:** TypeScript, Next.js 15 / React 19 server components, Vitest (node environment, `react-dom/server` for markup), SQLite via `lib/db`.

**Spec:** `docs/specs/2026-09-19-reprint-collapse-design.md` — read it first; this plan argues from it.

## Global Constraints

- Headline similarity threshold is **0.8** Jaccard; minimum **4 words** or **6 Han characters**; Han text compared as character bigrams. Every threshold errs toward NOT collapsing.
- The six signals and their maxima stay **25, 20, 20, 10, 15, 10**; confidence stays clamped to **0..100**; contradiction penalty stays **−10**.
- **No new `GeoEvent` field and no schema change.** Events are rebuilt from articles on every ingest.
- The contradiction check reads the **whole** cluster, never only representatives.
- Test-first: watch every new test fail for the right reason before writing the code. Existing tests must pass **unchanged** (their fixtures use the 3-word title "Border talks held", which the minimum-length rule protects — do not rely on that in new tests; give new fixtures explicit titles of 4+ words).
- The interface says "also printed by", never "copied from".
- Motion must be inert under `prefers-reduced-motion`, and the resting state must be the closed `<details>`.
- **Never put the production domain, server address or mailbox in any tracked file.** Run `git grep -n -i -E -f ~/.claude/kautilya-leak-patterns.txt -- . ':!.env.local'` before every commit; it must print nothing. The pattern list lives outside the repo on purpose: written here, the pattern would itself name the domain.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Do not deploy.** Josh sees the shift report (Task 3) first, and deploys only on his say-so.

## File Structure

| File | Responsibility |
|---|---|
| `lib/verify/reprints.ts` (create) | `headlineKey`, `reprintFamilies`, `ReprintFamily`, `REPRINT_SIMILARITY` — pure, deterministic |
| `lib/verify/confidence.ts` (modify) | Compute signals from family representatives |
| `scripts/reprint-shift.ts` (create) | Report how stored scores change under the new scorer |
| `components/EvidenceFamily.tsx` (create) | One report plus its folded reprints |
| `components/RevealOnView.tsx` (modify) | Fold surface: `details[data-reveal-fold]` |
| `app/events/[id]/page.tsx` (modify) | Group the evidence list by family |
| `lib/format.ts`, `data/glossary.ts`, `app/methodology/page.tsx`, `README.md` (modify) | Say what the change does and does not catch |
| `tests/reprints.test.ts`, `tests/confidence-reprints.test.ts`, `tests/evidence-family.test.ts`, `tests/reveal-fold.test.ts`, `tests/reprint-docs.test.ts` (create) | One file per unit |

---

### Task 1: The reprint module

**Files:**
- Create: `lib/verify/reprints.ts`
- Test: `tests/reprints.test.ts`

**Interfaces:**
- Produces: `headlineKey(title: string): Set<string> | null`; `reprintFamilies(articles: Article[]): ReprintFamily[]`; `interface ReprintFamily { representative: Article; members: Article[] }` (`members` in publication order, includes the representative); `const REPRINT_SIMILARITY = 0.8`.

- [ ] **Step 1: Write the failing tests** — create `tests/reprints.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { headlineKey, reprintFamilies, REPRINT_SIMILARITY } from '@/lib/verify/reprints';
import type { Article } from '@/lib/types';

let n = 0;
function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `r${String(n).padStart(4, '0')}`, url: `https://x/${n}`,
    title: 'North Korea fires multiple ballistic missiles', outlet: 'Reuters',
    publishedAt: `2026-09-19T10:${String(n % 60).padStart(2, '0')}:00.000Z`, snippet: '',
    imageUrl: null, language: 'en', beatId: null, localeKey: null, sourceCountry: 'GBR',
    ownership: 'independent', tier: 1, isPrimary: false, actors: ['PRK'], people: [],
    hotspots: [], domain: 'Military', escalation: 0, framing: 0, ladderRung: null,
    ladderZh: null, ladderEn: null, glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}
const ids = (fams: ReturnType<typeof reprintFamilies>) => fams.map((f) => f.members.map((m) => m.id));

/**
 * A wire story printed by five outlets is one report, not five. These tests pin what counts
 * as a reprint — and, as importantly, what does not: a headline two editors wrote
 * separately about the same event is independent evidence, and collapsing it would
 * silently penalise genuine corroboration.
 */
describe('what a headline reduces to', () => {
  it('returns null for a headline too short to trust', () => {
    // "Iran attacks Israel" could be written independently by two editors.
    expect(headlineKey('Iran attacks Israel')).toBeNull();
    expect(headlineKey('伊朗袭击以色列')).not.toBeNull(); // 7 Han characters
    expect(headlineKey('伊朗袭击')).toBeNull();
  });

  it('accepts four words', () => {
    expect(headlineKey('Iran attacks Israel again')).not.toBeNull();
  });

  it('ignores a trailing outlet suffix, with or without spaces around the pipe', () => {
    const bare = headlineKey('North Korea fires multiple ballistic missiles');
    expect(headlineKey('North Korea fires multiple ballistic missiles - Reuters')).toEqual(bare);
    expect(headlineKey('North Korea fires multiple ballistic missiles | ABC News')).toEqual(bare);
    expect(headlineKey('North Korea fires multiple ballistic missiles| ABC News')).toEqual(bare);
  });

  it('ignores a leading section label', () => {
    const bare = headlineKey('North Korea fires multiple ballistic missiles');
    expect(headlineKey('Video | North Korea fires multiple ballistic missiles')).toEqual(bare);
    expect(headlineKey('WATCH: North Korea fires multiple ballistic missiles')).toEqual(bare);
  });

  it('ignores case, punctuation and curly quotes', () => {
    expect(headlineKey('Saudi prince seeks Egypt’s backing, as Houthi attacks rattle Red Sea'))
      .toEqual(headlineKey("saudi prince seeks egypt's backing as houthi attacks rattle red sea"));
  });

  it('keeps a hyphen inside a word, so it is not mistaken for an outlet suffix', () => {
    expect(headlineKey('North Korea live-fire drills show huge power')?.has('live')).toBe(true);
  });
});

describe('families of reprints', () => {
  it('puts an identical headline from two outlets in one family', () => {
    const a = art({ outlet: 'Dawn', sourceCountry: 'PAK' });
    const b = art({ outlet: 'Vanguard News', sourceCountry: 'NGA' });
    const fams = reprintFamilies([a, b]);
    expect(fams).toHaveLength(1);
    expect(fams[0].members.map((m) => m.id)).toEqual([a.id, b.id]);
  });

  it('matches a Chinese headline that differs only by an appended outlet name', () => {
    // Measured in the real corpus: scored 0.78 before the suffix was stripped, though it is
    // the same headline.
    const a = art({ title: '忧遭北京处罚 部分中国稀土企业据报拒向美国供货', outlet: 'Sohu', language: 'zh' });
    const b = art({ title: '忧遭北京处罚部分中国稀土企业据报拒向美国供货| 加拿大新闻网', outlet: 'CNews', language: 'zh' });
    expect(reprintFamilies([a, b])).toHaveLength(1);
  });

  it('does NOT collapse two headlines written separately about one event', () => {
    // 0.5-0.8 similarity: independent editorial decisions, kept independent on purpose.
    const a = art({ title: '4 sailors killed in Houthi missile attack on Red Sea cargo ship', outlet: 'Reuters' });
    const b = art({ title: 'Four killed in Houthi attack on Red Sea cargo ship, sources say', outlet: 'ABC' });
    expect(reprintFamilies([a, b])).toHaveLength(2);
  });

  it('never collapses a headline below the minimum length', () => {
    const a = art({ title: 'Iran attacks Israel', outlet: 'Reuters' });
    const b = art({ title: 'Iran attacks Israel', outlet: 'Dawn' });
    expect(reprintFamilies([a, b])).toHaveLength(2);
  });

  it('does not chain: A~B and B~C must not merge A with C', () => {
    // Words w1..w12. A = w1..w10, B = w2..w11, C = w3..w12. A~B and B~C are 9/11 = 0.82, but
    // A~C is 8/12 = 0.67. Matching against a family's ANCHOR (its earliest article), not any
    // member, keeps C out; single-link grouping would merge all three.
    const w = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima'.split(' ');
    const title = (from: number, to: number) => w.slice(from - 1, to).join(' ');
    const a = art({ title: title(1, 10), outlet: 'One', publishedAt: '2026-09-19T10:00:00.000Z' });
    const b = art({ title: title(2, 11), outlet: 'Two', publishedAt: '2026-09-19T10:01:00.000Z' });
    const c = art({ title: title(3, 12), outlet: 'Three', publishedAt: '2026-09-19T10:02:00.000Z' });
    const fams = reprintFamilies([a, b, c]);
    expect(ids(fams)).toEqual([[a.id, b.id], [c.id]]);
  });

  it('is deterministic whatever order the articles arrive in', () => {
    const list = [
      art({ outlet: 'Dawn', publishedAt: '2026-09-19T10:02:00.000Z' }),
      art({ outlet: 'ABC', publishedAt: '2026-09-19T10:00:00.000Z' }),
      art({ title: 'Saudi prince seeks backing as Houthi attacks rattle Red Sea', outlet: 'FT', publishedAt: '2026-09-19T10:01:00.000Z' }),
      art({ outlet: 'BBC', publishedAt: '2026-09-19T10:03:00.000Z' }),
    ];
    const forward = ids(reprintFamilies(list));
    expect(ids(reprintFamilies([...list].reverse()))).toEqual(forward);
    expect(ids(reprintFamilies([list[2], list[0], list[3], list[1]]))).toEqual(forward);
  });

  it('exposes the threshold it uses', () => {
    expect(REPRINT_SIMILARITY).toBe(0.8);
  });
});

describe('which report stands for the family', () => {
  it('prefers an official statement over an earlier report', () => {
    const early = art({ outlet: 'Reuters', publishedAt: '2026-09-19T10:00:00.000Z' });
    const official = art({ outlet: 'PIB', ownership: 'state', tier: 2, isPrimary: true, publishedAt: '2026-09-19T10:05:00.000Z' });
    expect(reprintFamilies([early, official])[0].representative.id).toBe(official.id);
  });

  it('then prefers the stronger outlet track record', () => {
    const weak = art({ outlet: 'Blog', tier: 3, publishedAt: '2026-09-19T10:00:00.000Z' });
    const strong = art({ outlet: 'Reuters', tier: 1, publishedAt: '2026-09-19T10:05:00.000Z' });
    expect(reprintFamilies([weak, strong])[0].representative.id).toBe(strong.id);
  });

  it('then the earliest', () => {
    const first = art({ outlet: 'ABC', publishedAt: '2026-09-19T10:00:00.000Z' });
    const second = art({ outlet: 'BBC', publishedAt: '2026-09-19T10:05:00.000Z' });
    expect(reprintFamilies([second, first])[0].representative.id).toBe(first.id);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/reprints.test.ts`
Expected: FAIL — `Cannot find module '@/lib/verify/reprints'`.

- [ ] **Step 3: Write the module** — create `lib/verify/reprints.ts`:

```ts
import type { Article } from '@/lib/types';

/**
 * Reprints: one report, printed by several outlets.
 *
 * Corroboration is the product's central claim and it counts outlets — but a wire story
 * printed by five of them is one report, not five. Measured on the corpus of 2026-09-19,
 * 147 of 670 events scored as having two or more independent outlets carried near-identical
 * headlines from different outlets, so the distinct originals were fewer than the outlets
 * counted. Two Chinese outlets running an identical headline turned "two independent
 * outlets" into one.
 *
 * WHAT COUNTS. Near-identical headlines after normalisation, nothing else: not the body, not
 * the outlet's reputation. The line is 0.8 Jaccard overlap. The 0.5–0.8 bands (about 630
 * pairs) are mostly headlines two editors wrote separately about one event — "4 sailors
 * killed in Houthi missile attack" beside "Four killed in Houthi attack…, sources say" —
 * which are independent editorial decisions and stay independent. Rewritten wire copy and
 * translated copy therefore escape, so the measured inflation is a FLOOR.
 *
 * THE SAFE DIRECTION. Under-collapsing is the status quo; over-collapsing silently penalises
 * real corroboration. Every threshold here errs toward not collapsing — the opposite of the
 * roster detector's, where a missed exclusion costs a false flag.
 *
 * WHY NOT cluster.ts's jaccard/tokens. Those add glossed terms and hotspot ids so that a
 * Chinese and an English report of one event can match. That is exactly what makes
 * paraphrases look identical here, so this module reads the headline alone.
 */
export const REPRINT_SIMILARITY = 0.8;
/** A headline shorter than this could be written independently by two editors. */
const MIN_WORDS = 4;
const MIN_HAN = 6;

const LEADING_LABEL = /^\s*(?:video|watch|live|urgent|breaking)\s*[|:：–—-]\s*/;
// A pipe is a separator whatever surrounds it — Chinese feeds append "| outlet" with no
// space before the bar. A dash is one only with spaces on both sides, so "live-fire" and
// "India-China" keep their hyphens.
const TRAILING_PIPE = /\s*[|｜]\s*[^|｜]{2,40}$/;
const TRAILING_DASH = /\s+[-–—]\s+[^-–—]{2,40}$/;

/**
 * What a headline reduces to for comparison, or null when it is too short to trust.
 * Han text becomes character bigrams; every other script becomes a set of words.
 */
export function headlineKey(title: string): Set<string> | null {
  let t = title.normalize('NFKC').toLowerCase();
  t = t.replace(LEADING_LABEL, '').replace(TRAILING_PIPE, '').replace(TRAILING_DASH, '');
  t = t.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ');

  const han = t.match(/\p{Script=Han}/gu) ?? [];
  if (han.length >= 4) {
    if (han.length < MIN_HAN) return null;
    const out = new Set<string>();
    for (let i = 0; i < han.length - 1; i++) out.add(han[i] + han[i + 1]);
    return out;
  }
  const words = t.split(/\s+/).filter((w) => w.length >= 2);
  return words.length >= MIN_WORDS ? new Set(words) : null;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export interface ReprintFamily {
  /** The report the score reads for this family. */
  representative: Article;
  /** Every report in the family, in publication order, the representative included. */
  members: Article[];
}

/** An official statement first, then the stronger track record. Ties keep the earlier one. */
function beats(a: Article, b: Article): boolean {
  if (a.isPrimary !== b.isPrimary) return a.isPrimary;
  return a.tier < b.tier;
}

/**
 * Group articles into families of reprints.
 *
 * Articles are taken in publication order (ties by id) and each joins the first family whose
 * ANCHOR — its earliest article — it matches, else starts one. Matching the anchor rather
 * than any member prevents chaining: A~B and B~C at 0.8 must not merge A and C at 0.5.
 * Deterministic whatever order the input arrives in.
 *
 * The representative is the member the score reads: an official statement, then the best
 * outlet tier, then the earliest. The interface says "also printed by", never "copied from",
 * because which outlet copied which cannot be known from a headline.
 */
export function reprintFamilies(articles: Article[]): ReprintFamily[] {
  const ordered = [...articles].sort(
    (a, b) => (Date.parse(a.publishedAt) || 0) - (Date.parse(b.publishedAt) || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const groups: { anchor: Set<string> | null; members: Article[] }[] = [];
  for (const a of ordered) {
    const key = headlineKey(a.title);
    const home = key ? groups.find((g) => g.anchor && overlap(key, g.anchor) >= REPRINT_SIMILARITY) : undefined;
    if (home) home.members.push(a);
    else groups.push({ anchor: key, members: [a] });
  }
  return groups.map((g) => ({
    members: g.members,
    representative: g.members.reduce((best, m) => (beats(m, best) ? m : best), g.members[0]),
  }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/reprints.test.ts`
Expected: PASS, 17 tests. If the "matches a Chinese headline" test fails, print `headlineKey` for both titles and fix the suffix regex — do NOT lower the threshold.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/verify/reprints.ts tests/reprints.test.ts
git commit -m "Group near-identical headlines into families of reprints" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Score from originals, not outlets

**Files:**
- Modify: `lib/verify/confidence.ts` (the head of `scoreConfidence`, the outlets-signal `detail`, the `single_source` and `stateish` lines)
- Test: `tests/confidence-reprints.test.ts`

**Interfaces:**
- Consumes: `reprintFamilies(articles): ReprintFamily[]` from Task 1.
- Produces: unchanged `scoreConfidence(cluster: Article[]): Verdict`. Behaviour change only.

- [ ] **Step 1: Write the failing tests** — create `tests/confidence-reprints.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scoreConfidence } from '@/lib/verify/confidence';
import type { Article } from '@/lib/types';

let n = 0;
function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `c${String(n).padStart(4, '0')}`, url: `https://x/${n}`,
    title: 'North Korea fires multiple ballistic missiles', outlet: 'Reuters',
    publishedAt: `2026-09-19T10:${String(n % 60).padStart(2, '0')}:00.000Z`, snippet: '',
    imageUrl: null, language: 'en', beatId: null, localeKey: null, sourceCountry: 'GBR',
    ownership: 'independent', tier: 1, isPrimary: false, actors: ['PRK'], people: [],
    hotspots: [], domain: 'Military', escalation: 0, framing: 0, ladderRung: null,
    ladderZh: null, ladderEn: null, glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}
const points = (r: ReturnType<typeof scoreConfidence>, key: string) => r.signals.find((s) => s.key === key)!.points;

/**
 * A wire story printed by three outlets in three countries is one report. Every signal
 * that rewards diversity — outlets, ownership, countries — must see one, or the score
 * rewards syndication as though it were confirmation.
 */
describe('reprints count once', () => {
  const T = 'North Korea fires multiple ballistic missiles';
  const three = () => [
    art({ title: T, outlet: 'Reuters', sourceCountry: 'GBR' }),
    art({ title: T, outlet: 'Dawn', sourceCountry: 'PAK' }),
    art({ title: T, outlet: 'The Hindu', sourceCountry: 'IND' }),
  ];
  const separate = () => [
    art({ title: 'North Korea fires multiple ballistic missiles', outlet: 'Reuters', sourceCountry: 'GBR' }),
    art({ title: 'Pyongyang launches missiles toward the sea, Seoul says', outlet: 'Dawn', sourceCountry: 'PAK' }),
    art({ title: 'Missile launches by the North rattle the peninsula again', outlet: 'The Hindu', sourceCountry: 'IND' }),
  ];

  it('scores three reprints as one outlet', () => {
    const r = scoreConfidence(three());
    expect(points(r, 'outlets')).toBe(8); // one independent outlet
    expect(r.flags).toContain('single_source');
  });

  it('scores the same three as separate reports when the headlines differ', () => {
    const r = scoreConfidence(separate());
    expect(points(r, 'outlets')).toBe(20); // three independent outlets
    expect(r.flags).not.toContain('single_source');
  });

  it('does not let a reprint add country spread', () => {
    expect(points(scoreConfidence(three()), 'countries')).toBe(0);
    expect(points(scoreConfidence(separate()), 'countries')).toBe(15);
  });

  it('lowers the score, never raises it', () => {
    expect(scoreConfidence(three()).confidence).toBeLessThan(scoreConfidence(separate()).confidence);
  });

  it('says what was and was not counted', () => {
    const detail = scoreConfidence(three()).signals.find((s) => s.key === 'outlets')!.detail;
    expect(detail).toMatch(/2 outlets reprinted a report already counted/);
  });

  it('does not mention reprints when there are none', () => {
    const detail = scoreConfidence(separate()).signals.find((s) => s.key === 'outlets')!.detail;
    expect(detail).not.toMatch(/reprint/);
  });
});

describe('what reprints must not change', () => {
  it('still flags a denial that appears only in a reprint', () => {
    // The primary report is the representative; the denial is in the reprint's snippet. The
    // contradiction check reads the WHOLE cluster, so this change can never make it quieter.
    const T = 'China says border talks were held in Delhi today';
    const official = art({ title: T, outlet: 'MFA', ownership: 'state', tier: 2, isPrimary: true });
    const reprint = art({ title: T, outlet: 'Global Times', snippet: 'Beijing denies any incursion across the LAC' });
    expect(scoreConfidence([official, reprint]).flags).toContain('disputed');
  });

  it('keeps an official statement in a family visible to the primary-source signal', () => {
    const T = 'India and China agree border patrol arrangement at talks';
    const r = scoreConfidence([
      art({ title: T, outlet: 'Reuters' }),
      art({ title: T, outlet: 'PIB', ownership: 'state', tier: 2, isPrimary: true }),
    ]);
    expect(points(r, 'primary')).toBe(15);
    expect(r.flags).toContain('primary_sourced');
  });

  it('still flags one outlet publishing twice under different headlines as a single source', () => {
    const r = scoreConfidence([
      art({ title: 'Border talks resume between India and China today', outlet: 'Reuters' }),
      art({ title: 'Corps commanders meet in Arunachal after months of stalemate', outlet: 'Reuters' }),
    ]);
    expect(r.flags).toContain('single_source');
  });

  it('stays inside 0..100 with the same six signal maxima', () => {
    const r = scoreConfidence([art(), art({ outlet: 'Dawn', sourceCountry: 'PAK' })]);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(100);
    expect(r.signals.filter((s) => s.max > 0).map((s) => s.max)).toEqual([25, 20, 20, 10, 15, 10]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/confidence-reprints.test.ts`
Expected: FAIL — "scores three reprints as one outlet" gets `20` not `8`; "does not let a reprint add country spread" gets `15`; "says what was and was not counted" does not match. The "must not change" tests already pass.

- [ ] **Step 3: Implement** — in `lib/verify/confidence.ts`:

(a) Add the import below the existing one:

```ts
import { reprintFamilies } from '@/lib/verify/reprints';
```

(b) Replace everything from `export function scoreConfidence(cluster: Article[]): Verdict {` through the line `const bestTier = Math.min(...cluster.map((a) => a.tier));` with:

```ts
export function scoreConfidence(cluster: Article[]): Verdict {
  // Every signal below reads ONE report per original. A wire story printed by five outlets in
  // five countries is one report, and would otherwise earn outlet-count, ownership and
  // country-spread points five times over. The contradiction check further down deliberately
  // still reads the whole `cluster`: a denial inside a reprint is still a denial.
  const evidence = reprintFamilies(cluster).map((f) => f.representative);

  // Every outlet reporting, for the detail line only.
  const outlets = new Set(cluster.map((a) => a.outlet.toLowerCase()));
  // Outlets among the reports that are counted. An outlet that only ever reprinted drops out.
  const evidenceOutlets = new Set(evidence.map((a) => a.outlet.toLowerCase()));
  // 'ZZZ' marks an outlet we could not place. Unknown provenance must not be counted
  // as a distinct country — that would let unrecognised sources manufacture the very
  // geographic diversity the signal exists to measure.
  const countries = new Set(evidence.map((a) => a.sourceCountry).filter((c) => c !== 'ZZZ'));
  const unplaced = evidence.filter((a) => a.sourceCountry === 'ZZZ').length;
  const languages = new Set(evidence.map((a) => a.language));
  const ownerships = new Set(evidence.map((a) => a.ownership));
  // Think-tank and research output is commentary on events, not independent reporting
  // of them, so it is excluded from corroboration while still being displayed.
  const independents = evidence.filter(
    (a) => a.ownership === 'independent' || a.ownership === 'public',
  );
  const analyses = evidence.filter((a) => a.ownership === 'analysis');
  const independentOutlets = new Set(independents.map((a) => a.outlet.toLowerCase()));
  const primaries = evidence.filter((a) => a.isPrimary);
  const bestTier = Math.min(...evidence.map((a) => a.tier));
  const reprinted = outlets.size - evidenceOutlets.size;
```

(c) In the outlets signal, replace the `detail:` expression so it reads:

```ts
    detail: (nInd === 0
      ? `No independent outlet among ${outlets.size} reporting.`
      : `${nInd} independent outlet${nInd > 1 ? 's' : ''} of ${outlets.size} reporting.`)
      + (reprinted > 0 ? ` ${reprinted} outlet${reprinted > 1 ? 's' : ''} reprinted a report already counted.` : '')
      + (analyses.length ? ` ${analyses.length} think-tank item(s) present but not counted as corroboration.` : ''),
```

(d) Replace `if (outlets.size <= 1) flags.push('single_source');` with:

```ts
  // One original, however many outlets printed it. Counted by outlet among the reports that
  // stand for a family, so one outlet publishing twice under different headlines is still a
  // single source.
  if (evidenceOutlets.size <= 1) flags.push('single_source');
```

(e) Replace `const stateish = cluster.filter(` with `const stateish = evidence.filter(`.

- [ ] **Step 4: Run the new file, then the whole suite**

Run: `npm test -- tests/confidence-reprints.test.ts` → PASS (10).
Run: `npm test` → all pass, including the untouched `tests/verify.test.ts`. If a `verify.test.ts` case fails, its fixture reuses a 4+-word headline: give the fixture distinct headlines — do not weaken the rule.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/verify/confidence.ts tests/confidence-reprints.test.ts
git commit -m "Score from one report per original, so a reprinted story counts once" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: The shift report — Josh sees it before anything deploys

**Files:**
- Create: `scripts/reprint-shift.ts`
- Modify: `package.json` (one script)

**Interfaces:**
- Consumes: `scoreConfidence`, `reprintFamilies`, `allEvents`, `articlesByIds`, `confidenceBand`.
- Produces: a printed report only. No writes.

- [ ] **Step 1: Write the script** — create `scripts/reprint-shift.ts`:

```ts
/**
 * How much do stored confidence scores move under reprint collapse?
 *
 * Stored events were scored by the OLD scorer at the last ingest, so re-scoring each one's
 * articles with the current scorer and comparing shows the real shift without keeping a
 * second copy of the old code. Read-only.
 *
 *   npm run reprints:shift
 *
 * The check that matters most is the last line: an event with no reprints in it must score
 * EXACTLY as before. A non-zero count there means the scorer changed something it was not
 * meant to.
 */
import { allEvents, articlesByIds } from '@/lib/db';
import { scoreConfidence } from '@/lib/verify/confidence';
import { reprintFamilies } from '@/lib/verify/reprints';
import { confidenceBand } from '@/lib/format';

const events = allEvents(20000);
type Row = { title: string; before: number; after: number; articles: number; families: number; outlets: number; flagBefore: boolean; flagAfter: boolean };
const rows: Row[] = [];
let stale = 0;
let unexplained = 0;

for (const e of events) {
  const arts = articlesByIds(e.articleIds);
  if (arts.length !== e.articleIds.length) { stale += 1; continue; }
  const fams = reprintFamilies(arts);
  const now = scoreConfidence(arts);
  const hasReprints = fams.length < arts.length;
  if (!hasReprints && now.confidence !== e.confidence) unexplained += 1;
  rows.push({
    title: e.title, before: e.confidence, after: now.confidence, articles: arts.length,
    families: fams.length, outlets: new Set(arts.map((a) => a.outlet.toLowerCase())).size,
    flagBefore: e.flags.includes('single_source'), flagAfter: now.flags.includes('single_source'),
  });
}

const changed = rows.filter((r) => r.after !== r.before);
const drops = changed.map((r) => r.before - r.after).sort((a, b) => a - b);
const pct = (p: number) => drops[Math.min(drops.length - 1, Math.floor(drops.length * p))];
const band = (c: number) => confidenceBand(c).label;
const crossings = new Map<string, number>();
for (const r of changed) if (band(r.before) !== band(r.after)) {
  const k = `${band(r.before)}  →  ${band(r.after)}`;
  crossings.set(k, (crossings.get(k) ?? 0) + 1);
}
const corroboratedBefore = rows.filter((r) => r.before >= 50).length;
const corroboratedAfter = rows.filter((r) => r.after >= 50).length;

console.log(`\nevents scored: ${rows.length}${stale ? `  (${stale} skipped: articles since pruned)` : ''}`);
console.log(`events containing reprints: ${rows.filter((r) => r.families < r.articles).length}`);
console.log(`events whose score changes: ${changed.length}  (${(100 * changed.length / Math.max(rows.length, 1)).toFixed(1)}%)`);
if (changed.length) {
  console.log(`drop in points — median ${pct(0.5)}, p90 ${pct(0.9)}, max ${drops[drops.length - 1]}; any rise: ${drops[0] < 0 ? 'YES (a bug)' : 'none'}`);
  console.log(`\nevents that change confidence band: ${[...crossings.values()].reduce((a, b) => a + b, 0)}`);
  for (const [k, v] of [...crossings.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
}
console.log(`\n"corroborated" (score >= 50): ${corroboratedBefore} → ${corroboratedAfter}`);
console.log(`"single source" flag: ${rows.filter((r) => r.flagBefore).length} → ${rows.filter((r) => r.flagAfter).length}`);
console.log('\nlargest drops:');
for (const r of [...changed].sort((a, b) => (b.before - b.after) - (a.before - a.after)).slice(0, 10)) {
  console.log(`  ${r.before} → ${r.after}  (${r.articles} reports, ${r.families} originals, ${r.outlets} outlets)  ${r.title.slice(0, 68)}`);
}
console.log(`\nunexplained changes among events with NO reprints (must be 0): ${unexplained}\n`);
```

- [ ] **Step 2: Add the npm script** — in `package.json`, beside `"roster:audit"`:

```json
    "reprints:shift": "tsx --tsconfig tsconfig.scripts.json scripts/reprint-shift.ts",
```

- [ ] **Step 3: Run it against the local corpus and read the output**

Run: `npm run reprints:shift`
Expected: `unexplained changes … must be 0: 0` and `any rise: none`. If either fails, STOP and debug `scoreConfidence` — the scorer changed behaviour it was not meant to. Save the full output for Josh.

- [ ] **Step 4: Type-check and commit**

```bash
npx tsc --noEmit
git add scripts/reprint-shift.ts package.json
git commit -m "Add a shift report: how stored scores move under reprint collapse" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Group the evidence list by family

**Files:**
- Create: `components/EvidenceFamily.tsx`
- Modify: `app/events/[id]/page.tsx` (imports; a `families` constant, `report` and `reprintRow` helpers above `return (`; the `articles.map(...)` block)
- Test: `tests/evidence-family.test.ts`

**Interfaces:**
- Consumes: `reprintFamilies`, `ReprintFamily`; `RevealOnView`.
- Produces: `EvidenceFamily({ lead: ReactNode; outlets: string[]; children: ReactNode })`. Renders `<details data-reveal-fold>` (closed) whose body has `data-fold-body`. Task 5 depends on those two attributes.

- [ ] **Step 1: Write the failing tests** — create `tests/evidence-family.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvidenceFamily } from '@/components/EvidenceFamily';

const render = (outlets: string[]) => renderToStaticMarkup(
  createElement(EvidenceFamily, { lead: createElement('article', null, 'the lead report'), outlets },
    createElement('div', null, 'a reprint row')),
);

/**
 * The reprints are folded under the report they repeat, but never hidden from anyone who
 * cannot run the animation: they sit in a native <details>, closed at rest, so they work with
 * no JavaScript and no pointer.
 */
describe('a family with reprints', () => {
  it('shows the report, then who else printed it, closed', () => {
    const html = render(['Dawn', 'chinaglobalsouth.com']);
    expect(html).toContain('the lead report');
    expect(html).toContain('Also printed by Dawn, chinaglobalsouth.com');
    expect(html).toContain('2 reprints, counted once');
    expect(html).toContain('<details');
    expect(html).toContain('data-reveal-fold');
    expect(html).toContain('data-fold-body');
    expect(html, 'must rest closed').not.toMatch(/<details[^>]*\sopen/);
  });

  it('keeps the reprint rows in the document, where a reader can open them', () => {
    expect(render(['Dawn'])).toContain('a reprint row');
  });

  it('says "reprint" for one', () => {
    expect(render(['Dawn'])).toContain('1 reprint, counted once');
  });
});

describe('the page and the score share one definition of a family', () => {
  it('both read reprintFamilies from the same module', () => {
    const page = readFileSync('app/events/[id]/page.tsx', 'utf8');
    const scorer = readFileSync('lib/verify/confidence.ts', 'utf8');
    expect(page).toContain("from '@/lib/verify/reprints'");
    expect(scorer).toContain("from '@/lib/verify/reprints'");
    expect(page).toContain('reprintFamilies(articles)');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/evidence-family.test.ts`
Expected: FAIL — `Cannot find module '@/components/EvidenceFamily'`.

- [ ] **Step 3: Create the component** — `components/EvidenceFamily.tsx`:

```tsx
import type { ReactNode } from 'react';
import { RevealOnView } from '@/components/RevealOnView';

/**
 * One report, and the outlets that printed the same headline.
 *
 * The reprints sit in a native <details>, closed at rest. That is the resting state on
 * purpose: with JavaScript off, or with reduced motion requested, this is exactly what
 * renders, and nothing is hidden that cannot be opened by keyboard or screen reader.
 * RevealOnView's fold surface only ever starts from OPEN and closes it — see there.
 *
 * "Also printed by", never "copied from": which outlet copied which cannot be known from a
 * headline, and the interface must not claim it.
 */
export function EvidenceFamily({ lead, outlets, children }: {
  lead: ReactNode;
  /** Outlet names of the reprints, already de-duplicated. */
  outlets: string[];
  /** The compact reprint rows. */
  children: ReactNode;
}) {
  const n = outlets.length;
  return (
    // className="" rather than the default `contents`: the parent divides its children with
    // borders, and a display:contents wrapper has no box to draw one on.
    <RevealOnView className="">
      <div>
        {lead}
        <details data-reveal-fold className="mb-3 ml-3 border-l border-[color:var(--color-line)] pl-3">
          <summary className="cursor-pointer text-[13px] text-muted hover:text-text">
            Also printed by {outlets.join(', ')}
            <span className="ml-1.5 text-faint">· {n} {n === 1 ? 'reprint' : 'reprints'}, counted once</span>
          </summary>
          <div data-fold-body className="divide-y divide-[color:var(--color-line-soft)]">{children}</div>
        </details>
      </div>
    </RevealOnView>
  );
}
```

- [ ] **Step 4: Wire the page.** In `app/events/[id]/page.tsx`:

(a) Add imports: `import type { Article } from '@/lib/types';`, `import { EvidenceFamily } from '@/components/EvidenceFamily';`, `import { reprintFamilies } from '@/lib/verify/reprints';`

(b) Immediately above the component's `return (`, after `translationFor` and `glossHits` are defined, add:

```tsx
  // The same grouping the score uses, so what the page shows and what was counted cannot
  // disagree. Articles arrive oldest first, and families keep their anchor's order.
  const families = reprintFamilies(articles);

  const report = (a: Article) => (
    <article key={a.id} className="py-3">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <Badge tone={OWNERSHIP_TONE[a.ownership]} title={`Ownership class: ${OWNERSHIP_LABEL[a.ownership]}`}>
          {OWNERSHIP_LABEL[a.ownership] ?? a.ownership}
        </Badge>
        <span className="text-[14px] font-medium text-text">{a.outlet}</span>
        <span className="text-[13px] text-faint">{a.sourceCountry}</span>
        <span className="text-[13px] text-faint">{LANGUAGE_LABEL[a.language] ?? a.language}</span>
        {a.isPrimary && <Badge tone="var(--color-verified)">Primary</Badge>}
        {a.ladderRung && <Badge tone="var(--color-zh)">rung {a.ladderRung}</Badge>}
        <span className="mono-num ml-auto text-[13px] text-faint">{fmtDate(a.publishedAt)}</span>
      </div>
      <a href={a.url} target="_blank" rel="noopener noreferrer"
        className={`block text-[15px] leading-snug hover:underline ${a.language === 'zh' ? '' : 'text-text'}`}>
        <ChineseText text={a.title} clamp={false} accent={a.language === 'zh'}
          english={translationFor(a.title) ?? titleGloss(a.title) ?? a.titleEn}
          englishIsGloss={!translationFor(a.title)} />
      </a>
    </article>
  );

  const reprintRow = (a: Article) => (
    <div key={a.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2 text-[13px]">
      <span className="font-medium text-text">{a.outlet}</span>
      <span className="text-faint">{a.sourceCountry}</span>
      <a href={a.url} target="_blank" rel="noopener noreferrer" lang={a.language === 'zh' ? 'zh' : undefined}
        className="min-w-0 flex-1 basis-64 text-muted hover:underline">{a.title}</a>
      <span className="mono-num text-faint">{fmtDate(a.publishedAt)}</span>
    </div>
  );
```

(c) Replace the whole `{articles.map((a) => ( <article … </article> ))}` block inside the `divide-y` div with:

```tsx
                  {families.map((f) => {
                    const reprints = f.members.filter((m) => m.id !== f.representative.id);
                    if (!reprints.length) return report(f.representative);
                    return (
                      <EvidenceFamily key={f.representative.id} lead={report(f.representative)}
                        outlets={[...new Set(reprints.map((m) => m.outlet))]}>
                        {reprints.map(reprintRow)}
                      </EvidenceFamily>
                    );
                  })}
```

- [ ] **Step 5: Run tests, type-check, commit**

Run: `npm test -- tests/evidence-family.test.ts` → PASS (4). `npm test` → all pass. `npx tsc --noEmit` → clean.

```bash
git add components/EvidenceFamily.tsx "app/events/[id]/page.tsx" tests/evidence-family.test.ts
git commit -m "Show reprints folded under the report they repeat" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: The fold animation

**Files:**
- Modify: `components/RevealOnView.tsx`
- Test: `tests/reveal-fold.test.ts`

**Interfaces:**
- Consumes: `details[data-reveal-fold]` containing `[data-fold-body]` (Task 4).
- Produces: a fourth opt-in surface. No API change.

- [ ] **Step 1: Write the failing tests** — create `tests/reveal-fold.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The fold cannot be exercised without a DOM, and this project's tests run in node, so these
 * pin the properties that keep it safe; tests/evidence-family.test.ts pins the resting
 * markup, and the behaviour itself is checked in a real browser.
 */
const src = readFileSync('components/RevealOnView.tsx', 'utf8');

describe('the fold surface of RevealOnView', () => {
  it('exists, with a named duration', () => {
    expect(src).toContain('details[data-reveal-fold]');
    expect(src).toMatch(/const FOLD_MS = \d+/);
  });

  it('is only reached after the reduced-motion early return', () => {
    // Under prefers-reduced-motion nothing may animate, and the details must simply rest closed.
    expect(src.indexOf('prefers-reduced-motion')).toBeGreaterThan(-1);
    expect(src.indexOf('prefers-reduced-motion')).toBeLessThan(src.indexOf('details[data-reveal-fold]'));
  });

  it('starts from open and ends closed, never the other way round', () => {
    // Starting open can only ever reveal content; starting closed and opening would hide it
    // from anyone whose script did not run.
    expect(src).toMatch(/d\.open = true/);
    expect(src).toMatch(/d\.open = false/);
  });

  it('counts folds when deciding whether there is anything to observe', () => {
    expect(src).toMatch(/!folds\.length/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/reveal-fold.test.ts`
Expected: FAIL — the source contains none of the fold code.

- [ ] **Step 3: Implement** — in `components/RevealOnView.tsx`:

(a) Below `const REVEAL_MS = 900;` add:

```ts
/** How long a family's reprints take to fold into their summary line. */
const FOLD_MS = 450;
```

(b) Extend the doc comment's list of opt-in surfaces with:

```
 * - `details[data-reveal-fold]` starts OPEN and folds shut, so the reader watches a story's
 *   reprints merge into the report they repeat. Its resting state is closed — what renders
 *   without JavaScript or under reduced motion — so the animation can only ever start from
 *   content that is visible, never hide content that cannot be recovered.
```

(c) After `const bars = [...]` add `const folds = [...el.querySelectorAll<HTMLDetailsElement>('details[data-reveal-fold]')];` and change the guard line to:

```ts
    if (!strokes.length && !scales.length && !bars.length && !folds.length) return;
```

(d) After `bars.forEach((b) => { b.style.width = '0%'; });` add:

```ts
    // Each fold starts open, its body pinned at its natural height so it has a number to
    // animate from. This lands before paint, for the same reason as the bars above.
    const foldBodies = folds.map((d) => d.querySelector<HTMLElement>('[data-fold-body]'));
    folds.forEach((d, i) => {
      const body = foldBodies[i];
      if (!body) return;
      d.open = true;
      body.style.overflow = 'hidden';
      body.style.height = `${body.scrollHeight}px`;
    });
```

(e) Inside the observer callback, after the `bars.forEach(...)` block and before `io.disconnect();`, add:

```ts
      folds.forEach((d, i) => {
        const body = foldBodies[i];
        if (!body) return;
        body.style.transition = `height ${FOLD_MS}ms ease-in-out, opacity ${FOLD_MS}ms ease-in-out`;
        body.style.height = '0px';
        body.style.opacity = '0';
        // Back to the resting state: closed, with every inline style removed so opening it
        // later by hand shows the natural height.
        window.setTimeout(() => {
          d.open = false;
          body.removeAttribute('style');
        }, FOLD_MS + 40);
      });
```

- [ ] **Step 4: Run tests, type-check, commit**

Run: `npm test -- tests/reveal-fold.test.ts` → PASS (4). `npm test` → all pass. `npx tsc --noEmit` → clean.

```bash
git add components/RevealOnView.tsx tests/reveal-fold.test.ts
git commit -m "Fold a family's reprints shut as it scrolls into view" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Say what it does and does not catch

**Files:**
- Modify: `lib/format.ts` (`FLAG_LABEL.single_source.help`), `data/glossary.ts` (`confidence`, `flag-single-source`, new `reprint` entry), `app/methodology/page.tsx` (the outlets row of the scoring table, plus a paragraph after it), `README.md` (the scoring bullet near line 25), `docs/specs/2026-09-19-reprint-collapse-design.md` (correct the fold bullet)
- Test: `tests/reprint-docs.test.ts`

- [ ] **Step 1: Write the failing tests** — create `tests/reprint-docs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { allEntries } from '@/data/glossary';
import { FLAG_LABEL } from '@/lib/format';

/**
 * A score that quietly drops needs the pages that describe it to change with it — and to be
 * honest about the limit: collapsing catches reprints, and misses rewritten or translated copy.
 */
describe('the words around reprint collapse', () => {
  it('reads "single source" as one original, not one outlet', () => {
    expect(FLAG_LABEL.single_source.help).toMatch(/original/i);
    expect(FLAG_LABEL.single_source.help).not.toMatch(/only one outlet/i);
  });

  it('defines a reprint in the glossary', () => {
    const e = allEntries().find((x) => x.id === 'reprint');
    expect(e, 'the glossary needs a reprint entry').toBeDefined();
    expect(e!.meaning).toMatch(/counted once|counts it once/i);
    expect(e!.meaning).toMatch(/rewritten|translated/i);
  });

  it('has the methodology page say what is caught and what is not', () => {
    const page = readFileSync('app/methodology/page.tsx', 'utf8');
    expect(page).toMatch(/reprint/i);
    expect(page).toMatch(/rewritten/i);
    expect(page).toMatch(/0\.8/);
  });

  it('mentions it in the README', () => {
    expect(readFileSync('README.md', 'utf8')).toMatch(/reprint/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/reprint-docs.test.ts`
Expected: FAIL on all four.

- [ ] **Step 3: Make the edits.**

(a) `lib/format.ts` — replace the `single_source` help with:
`help: 'Every report traces back to one original — one outlet, or several printing the same headline. Treat as a lead, not an established fact.'`

(b) `data/glossary.ts` — in `confidence`, change "independent outlets (up to 25)" to "independent originals — a reprinted report counts once (up to 25)". Replace the `flag-single-source` meaning with `'Every report traces back to one original — one outlet, or several printing the same headline. Treat it as a claim, not yet a fact.'`. Insert after the `corroboration` entry:

```ts
      { id: 'reprint', term: 'Reprint',
        meaning: 'A report that repeats another’s headline almost word for word, typically wire copy printed by several outlets. Kautilya counts it once: five outlets running one wire story are one original, not five. Only near-identical headlines are caught; rewritten or translated copy is not, so the true inflation is somewhat larger than the score removes.' },
```

(c) `app/methodology/page.tsx` — read the scoring table (around line 148–160) and its surrounding paragraphs, then: change the "Independent outlets" row's text to begin "Distinct commercial or public-broadcaster outlets, each original report counted once — several outlets printing the same headline are one report. …" (keep the rest of the sentence), and add after the table a paragraph in the page's existing `<P>` style:

> **Reprints.** Two articles are treated as one report when their headlines match at 0.8 or better after removing a trailing outlet name, a leading section label, case and punctuation — a wire story printed by five outlets counts once, in the outlet count, the ownership mix and the country spread alike. This is deliberately conservative. Headlines two editors wrote separately about one event are independent evidence and stay separate, so **rewritten wire copy and translated copy are not caught**, and the correction is a floor. A headline shorter than four words (six Chinese characters) is never treated as a reprint, since two editors could write it independently. A denial inside a reprint still counts against the event.

(d) `README.md` — in the "Scores corroboration, never truth" bullet (around line 25), append: "A wire story reprinted by several outlets under near-identical headlines counts once."

(e) Spec — in `docs/specs/2026-09-19-reprint-collapse-design.md`, replace the bullet beginning "The class it uses is named in `globals.css`'s reduced-motion block…" with: "It animates through inline styles set by the hook, not a CSS class, so the guard is the hook's own early return under `prefers-reduced-motion`, pinned by `tests/reveal-fold.test.ts`."

- [ ] **Step 4: Run tests, type-check, commit**

Run: `npm test` → all pass (including `tests/glossary.test.ts`). `npx tsc --noEmit` → clean. Leak scan (Global Constraints) → nothing.

```bash
git add lib/format.ts data/glossary.ts app/methodology/page.tsx README.md docs/specs/2026-09-19-reprint-collapse-design.md tests/reprint-docs.test.ts
git commit -m "Say what reprint collapse catches and what it misses" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Verify against a real build, then stop

**Files:** none modified except this checklist. Uses the temporary-launch-entry method recorded in memory: add a `kautilya-prod-check` entry to the WORKSPACE `.claude/launch.json` (`node Output/GeoIntel/.next/standalone/server.js`, `PORT=3222`, `HOSTNAME=127.0.0.1`, `KAUTILYA_DB` pointing at a COPY of the database in the scratchpad, `KAUTILYA_ORIGIN=http://localhost:3222`), then remove it afterwards.

- [ ] **Step 1: Full suite and types.** `npm test` and `npx tsc --noEmit` — both clean. Note the new test count.
- [ ] **Step 2: Build.** `npm run build && cp -r .next/static .next/standalone/.next/static`. Copy the database to the scratchpad. Start the preview.
- [ ] **Step 3: Find an event with reprints** in the copied database and open `/events/<id>`. Confirm from the DOM: the family shows its report plus a `<details data-reveal-fold>`; the summary names the reprinting outlets; a family of one renders exactly as before.
- [ ] **Step 4: Prove the fold.** Before scrolling, `details.open` is `true` and `[data-fold-body]` has a non-zero height. Scroll the family into view, wait ~700 ms, and read again: `details.open` is `false` and the body's inline style is gone. Open it by clicking the summary: the rows show at natural height. (The Browser pane cannot screenshot a scrolled page — measure with `getBoundingClientRect()` and property reads.)
- [ ] **Step 5: Prove the confidence panel.** The outlets signal's detail line reads "… reprinted a report already counted" on that event, and its score matches `npm run reprints:shift`'s figure for the same event.
- [ ] **Step 6: Check mobile.** At 375 px there is no horizontal overflow on the event page.
- [ ] **Step 7: Clean up.** Stop the preview, remove the temporary launch entry, delete the database copy, reset the viewport.
- [ ] **Step 8: Leak scan, then commit any remaining change, push to the private repo.** Do **not** open the AI_apps PR and do **not** deploy.
- [ ] **Step 9: Report to Josh** the full `npm run reprints:shift` output and what it means — how many events change, by how much, how many cross a band, and the "corroborated" count before and after. **Deployment waits for his say-so.**

---

## Deviations, as built

Recorded so the plan stays an honest account of what shipped. None weakens a constraint.

- **Task 1 gained a figures rule** (`figuresOf`, and two tests) after the shift report's sample of
  collapsed families showed a daily broadcast titled by its date merging with the next day's.
  Reprints must carry identical numbers. It only ever prevents a merge.
- **Task 1's test count is 18, not 17** (a miscount in this plan, then two figures tests).
- **Task 3's script also prints an evenly spaced sample of collapsed families** — the sample is
  how the figures defect was found.
- **Task 4's `EvidenceFamily` takes `sameOutlet` and `count`,** and the page passes only the
  OTHER outlets in `outlets`: a family whose other versions all come from the lead's own outlet
  reads "More from <outlet> under the same headline", never "Also printed by" that outlet.
- **Task 5's ordering test compares against the `querySelectorAll` call,** not the first mention of
  the selector, which is in the doc comment above the function.
- **Task 7 needed the copy of the database re-clustered** to show new scores, since stored events
  keep the score from their last ingest.

## Self-review

**Spec coverage:** detection (normalisation, 0.8, min length, anchor families, representative) → Task 1; scoring incl. contradiction-on-whole-cluster and `single_source` → Task 2; shift report and "Josh sees it first" → Task 3 + Task 7 step 9; display grouped by the shared function → Task 4; fold animation, resting state closed, reduced-motion → Tasks 4–5; methodology/README/glossary/flag wording → Task 6; testing incl. real-build verification → every task and Task 7; non-goals respected (no schema change, no clustering change). **The spec's fold bullet said the animation class would be named in `globals.css`; the design uses inline styles instead — Task 6(e) corrects the spec.**

**Placeholder scan:** none — every code step carries its code; Task 6(c) gives the exact new paragraph and says which existing sentence to read and keep.

**Type consistency:** `reprintFamilies`, `headlineKey`, `ReprintFamily { representative, members }`, `REPRINT_SIMILARITY`, `EvidenceFamily({ lead, outlets, children })`, `data-reveal-fold`, `data-fold-body`, `FOLD_MS` are spelled identically in every task that uses them.
