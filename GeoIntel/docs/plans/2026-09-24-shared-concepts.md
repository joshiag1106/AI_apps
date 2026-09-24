# Shared Concept List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide every report's kind of pressure (`Domain`) from one concept table with a word for each concept in every compared language, and re-score stored reports when that table changes.

**Architecture:** `data/concepts.ts` holds the concepts; `lib/analyze/concepts.ts` compiles them into a matcher (whole-word Latin with inflections, substring otherwise, longest match first with spans masked, each concept counted once); `lib/analyze/score.ts` asks it for the domain instead of `DOMAIN_HINTS` + `LEXICON` domains; `lib/analyze/rescore.ts` re-scores stored rows when a fingerprint of the table changes, called by the ingest pipeline just before it re-clusters.

**Tech Stack:** TypeScript, Next.js 15, `node:sqlite` (`DatabaseSync`), vitest, tsx.

**Spec:** `docs/specs/2026-09-24-shared-concepts-design.md`

## Global Constraints

- Required languages for every concept: `en`, `zh`, `hi`, `ja`, `ar`, `ru`; a missing one needs a `gaps` reason.
- Latin-script concept terms match whole words, optionally followed by one of `s`, `es`, `d`, `ed`, `ing`.
- Non-Latin terms match as substrings of the lower-cased text.
- `LEXICON` escalation matching and weights are NOT changed; only its `domain` field is removed.
- The `'Diplomatic'` fallback for "no evidence" is unchanged; `evidencedDomain` and the stored domain share one tally.
- Domain ties break by `DOMAIN_ORDER`: Military, Maritime, Cyber, Economic, Energy, Space, Nuclear, Diplomatic, Internal, Technology.
- A word shared by Chinese and Japanese is listed once, under `zh`, and read in both; `ja` holds Japanese-only forms.
- Nothing is merged or deployed until Josh has seen the before/after numbers (Task 6 checkpoint).
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Files

- Create `scripts/concepts-report.ts` — measurement: coverage, Lens verdicts, domain mix, clustering, samples.
- Create `lib/analyze/concepts.ts` — the matcher (`compileMatcher`, `matchConcepts`, `topDomain`, `MATCHER_VERSION`).
- Create `data/concepts.ts` — `CONCEPTS`, `NEUTRAL`, `DOMAIN_ORDER`, `REQUIRED_LANGS`, types.
- Create `lib/analyze/rescore.ts` — `vocabVersion`, `rescoreDomainsIfStale`.
- Modify `lib/analyze/score.ts` — domain from concepts; export `domainOf`.
- Modify `data/lexicon.ts` — delete `DOMAIN_HINTS`; drop `domain` from `LexEntry` and every entry.
- Modify `lib/ingest/pipeline.ts` — call `rescoreDomainsIfStale()` before clustering.
- Modify `package.json` — `concepts:report` script.
- Tests: create `tests/concepts-matcher.test.ts`, `tests/concepts.test.ts`, `tests/rescore.test.ts`; modify `tests/lens.test.ts`, `tests/lexicon-ja-ar.test.ts`.
- Docs: `STATE.md`, the spec, `app/methodology/page.tsx` (one sentence), `docs/runbooks/vps-deploy.md` (cron path).

---

### Task 1: Measurement script and baseline

**Files:** Create `scripts/concepts-report.ts`; modify `package.json`.

**Interfaces:** Consumes `allArticles`, `beatArticles` (`@/lib/db`), `evidencedDomain` (`@/lib/analyze/score`), `lens`, `describeSharpest` (`@/lib/lens/compare`), `clusterArticles` (`@/lib/verify/cluster`), `BEATS` (`@/data/feeds`). Runs on the current code, so it can take the baseline.

- [ ] **Step 1: Write the script**

```ts
/**
 * How the "which kind of pressure" vocabulary reads the real corpus. Run it before and after any change
 * to data/concepts.ts: coverage per language, every Language Lens verdict, the domain mix, and what
 * clustering does with the recomputed domains (domain agreement gates clustering, lib/verify/cluster).
 *
 *   npm run concepts:report
 *   npm run concepts:report -- --sample ja 30     thirty classified Japanese headlines, to read by hand
 */
import { allArticles, beatArticles } from '@/lib/db';
import { evidencedDomain } from '@/lib/analyze/score';
import { describeSharpest, lens } from '@/lib/lens/compare';
import { clusterArticles } from '@/lib/verify/cluster';
import { BEATS } from '@/data/feeds';
import type { Article } from '@/lib/types';

const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))}%`;
const kind = (a: Article) => evidencedDomain(a.title, a.snippet ?? '');
const args = process.argv.slice(2);

if (args[0] === '--sample') {
  const lang = args[1];
  const n = Number(args[2] ?? 30);
  const rows = beatArticles().filter((a) => a.language === lang).map((a) => ({ a, d: kind(a) })).filter((r) => r.d);
  // Every k-th classified report, not the first n: a spread across the corpus.
  const step = Math.max(1, Math.floor(rows.length / n));
  const seen = new Set<string>();
  for (let i = 0; i < rows.length && seen.size < n; i += step) {
    const t = rows[i].a.title.slice(0, 100);
    if (seen.has(t)) continue;
    seen.add(t);
    console.log(`${rows[i].d!.padEnd(10)} ${t}`);
  }
  process.exit(0);
}

const beat = beatArticles();
const all = allArticles(20000);

console.log('== readable share, topic searches');
const by = new Map<string, { n: number; hit: number }>();
for (const a of beat) {
  const b = by.get(a.language) ?? { n: 0, hit: 0 };
  b.n += 1;
  if (kind(a)) b.hit += 1;
  by.set(a.language, b);
}
for (const [l, b] of [...by].filter(([, b]) => b.n >= 20).sort((x, y) => y[1].n - x[1].n)) {
  console.log(`  ${l.padEnd(4)} ${String(b.hit).padStart(5)}/${String(b.n).padEnd(5)} ${pct(b.hit, b.n)}`);
}

console.log('== Lens verdicts');
for (const t of lens(beat.map((a) => ({ ...a, framed: kind(a) })), BEATS)) {
  const cols = t.columns.map((c) => `${c.language}${c.framing.length ? '' : '(unread)'} ${c.classified}/${c.articles}`).join(', ');
  console.log(`  ${t.label}: ${cols}\n    ${t.sharpest ? describeSharpest(t.sharpest) : 'no call-out'}`);
}

console.log('== domain mix, all articles (recomputed)');
const recomputed = all.map((a) => ({ ...a, domain: kind(a) ?? 'Diplomatic' }));
const mix = new Map<string, number>();
for (const a of recomputed) mix.set(a.domain, (mix.get(a.domain) ?? 0) + 1);
for (const [d, n] of [...mix].sort((x, y) => y[1] - x[1])) console.log(`  ${d.padEnd(11)} ${String(n).padStart(5)} ${pct(n, all.length)}`);

console.log('== clustering on the recomputed domains');
const t0 = Date.now();
const ev = clusterArticles(recomputed);
const sizes = ev.map((e) => e.articleIds.length).sort((x, y) => y - x);
const multi = ev.filter((e) => e.articleIds.length > 1).length;
const cross = ev.filter((e) => e.languages.length > 1).length;
console.log(`  articles ${all.length} | events ${ev.length} | multi ${multi} (${pct(multi, ev.length)}) | mean ${(all.length / ev.length).toFixed(2)} | ${Date.now() - t0}ms`);
console.log(`  largest: ${sizes.slice(0, 10).join(', ')} | cross-language events: ${cross}`);
const byId = new Map(all.map((a) => [a.id, a]));
const top = [...ev].sort((x, y) => y.articleIds.length - x.articleIds.length)[0];
if (top) {
  console.log(`  largest event (${top.articleIds.length} articles, ${top.languages.join('/')}):`);
  for (const id of top.articleIds.slice(0, 12)) console.log(`    ${byId.get(id)!.title.slice(0, 90)}`);
}
```

- [ ] **Step 2: Add the npm script** — in `package.json` `scripts`, after `"backfill:people"`:

```json
    "concepts:report": "tsx --tsconfig tsconfig.scripts.json scripts/concepts-report.ts",
```

- [ ] **Step 3: Take the baseline** — `npm run concepts:report > "$TMPDIR/kv/concepts-before.txt"` and `npx tsx --tsconfig tsconfig.scripts.json scripts/cluster-gates.ts > "$TMPDIR/kv/gates-before.txt"`. Expected: readable shares near en 46%, zh 48%, hi 53%, ja 47%, ar 18%, ru 74%; 9 Lens topics; ~5,179 events.

- [ ] **Step 4: Commit**

```bash
git add scripts/concepts-report.ts package.json
git commit -m "concepts:report — measure how the domain vocabulary reads the corpus"
```

---

### Task 2: The matcher

**Files:** Create `lib/analyze/concepts.ts`, `data/concepts.ts` (types only here); test `tests/concepts-matcher.test.ts`.

**Interfaces:** Produces `compileMatcher(concepts, neutral?) → { match(text): Concept[] }`, `topDomain(concepts: readonly Concept[]): Domain | null`, `MATCHER_VERSION: number`. Types from `data/concepts.ts`: `Concept`, `RequiredLang`, `TermLang`, `DOMAIN_ORDER`, `REQUIRED_LANGS`.

- [ ] **Step 1: Types in `data/concepts.ts`**

```ts
import type { Domain } from './lexicon';

export const REQUIRED_LANGS = ['en', 'zh', 'hi', 'ja', 'ar', 'ru'] as const;
export type RequiredLang = (typeof REQUIRED_LANGS)[number];
export type TermLang = RequiredLang | 'ur' | 'fa' | 'ko';

export interface Concept {
  id: string;
  domain: Domain;
  terms: Partial<Record<TermLang, string[]>>;
  /** A required language with no safe word, and why. */
  gaps?: Partial<Record<RequiredLang, string>>;
}

/** Ties between domains go to the earlier one — the order DOMAIN_HINTS had. */
export const DOMAIN_ORDER: readonly Domain[] = [
  'Military', 'Maritime', 'Cyber', 'Economic', 'Energy', 'Space', 'Nuclear', 'Diplomatic', 'Internal', 'Technology',
];

export const CONCEPTS: readonly Concept[] = [];
export const NEUTRAL: readonly string[] = [];
```

- [ ] **Step 2: Write the failing tests** — `tests/concepts-matcher.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { compileMatcher, topDomain } from '@/lib/analyze/concepts';
import type { Concept } from '@/data/concepts';

const c = (id: string, domain: Concept['domain'], en: string[], zh: string[] = []): Concept =>
  ({ id, domain, terms: { en, zh } });
const WAR = c('war', 'Military', ['war', 'clash'], ['战争']);
const TRADE_WAR = c('trade-war', 'Economic', ['trade war']);
const ATTACK = c('attack', 'Military', ['attack', 'strike']);
const CYBER = c('cyber-attack', 'Cyber', ['cyber attack'], ['网络攻击']);
const HIT = c('hit', 'Military', [], ['攻击']);
const TALKS = c('talks', 'Diplomatic', ['talks']);
const m = compileMatcher([WAR, TRADE_WAR, ATTACK, CYBER, HIT, TALKS], ['heart attack']);
const ids = (t: string) => m.match(t).map((x) => x.id).sort();

describe('the concept matcher', () => {
  it('matches Latin terms as whole words, with an inflection', () => {
    expect(ids('Wars and clashes')).toEqual(['war']);
    expect(ids('An award for software')).toEqual([]);
    expect(ids('Officials warn of risks')).toEqual([]);
    expect(ids('Troops attacked; strikes continue')).toEqual(['attack']);
  });

  it('matches non-Latin terms as substrings', () => {
    expect(ids('两国爆发战争')).toEqual(['war']);
  });

  it('lets the longest match win, so a phrase does not also count its words', () => {
    expect(ids('A trade war looms')).toEqual(['trade-war']);
    expect(ids('A cyber attack hit the grid')).toEqual(['cyber-attack']);
    expect(ids('遭到网络攻击')).toEqual(['cyber-attack']);
  });

  it('counts a concept once however many of its words appear', () => {
    expect(m.match('war, war and more clashes')).toHaveLength(1);
  });

  it('masks a neutral phrase without counting it', () => {
    expect(ids('He died of a heart attack')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(ids('TALKS RESUME')).toEqual(['talks']);
  });
});

describe('topDomain', () => {
  it('picks the domain with the most distinct concepts', () => {
    expect(topDomain([TALKS, WAR, ATTACK])).toBe('Military');
  });

  it('breaks a tie by the domain order, and is null with no evidence', () => {
    expect(topDomain([TALKS, WAR])).toBe('Military');
    expect(topDomain([TALKS, TRADE_WAR])).toBe('Economic');
    expect(topDomain([])).toBeNull();
  });
});
```

- [ ] **Step 3: Run to see it fail** — `npx vitest run tests/concepts-matcher.test.ts` → FAIL, cannot find `@/lib/analyze/concepts`.

- [ ] **Step 4: Implement `lib/analyze/concepts.ts`**

```ts
import type { Domain } from '@/data/lexicon';
import { DOMAIN_ORDER, type Concept } from '@/data/concepts';

/**
 * Reads which concepts a text mentions. Bump MATCHER_VERSION whenever the matching rules change: it is
 * part of the vocabulary fingerprint (lib/analyze/rescore), so stored reports are re-scored.
 *
 * - Latin-script terms match whole words, optionally with one inflection (s, es, d, ed, ing): "war" finds
 *   "wars" but not "award", "software" or "warn".
 * - Other scripts match as substrings: Chinese and Japanese have no spaces, and Arabic, Hindi and Russian
 *   stems carry affixes. Everything is lower-cased first, which matters for Cyrillic.
 * - Longest match first, and a hit overlapping an accepted one is dropped, so "trade war" does not also
 *   count "war". NEUTRAL phrases take part in that masking but count for nothing.
 * - A concept counts once, however many of its words appear.
 */
export const MATCHER_VERSION = 1;

const LATIN = /^[\x20-\x7F]+$/;
const ASCII_TEXT = /^[\x00-\x7F]*$/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Term { text: string; concept: Concept | null; re: RegExp | null }
interface Hit { start: number; end: number; concept: Concept | null }

export interface ConceptMatcher { match(text: string): Concept[] }

export function compileMatcher(concepts: readonly Concept[], neutral: readonly string[] = []): ConceptMatcher {
  const terms: Term[] = [];
  const seen = new Set<string>();
  const add = (raw: string, concept: Concept | null) => {
    const text = raw.toLowerCase();
    const key = `${concept?.id ?? '·neutral'}|${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    const re = LATIN.test(text)
      ? new RegExp(`(?<![\\p{L}\\p{N}])${escape(text)}(?:s|es|d|ed|ing)?(?![\\p{L}\\p{N}])`, 'gu')
      : null;
    terms.push({ text, concept, re });
  };
  for (const c of concepts) for (const list of Object.values(c.terms)) for (const t of list ?? []) add(t, c);
  for (const t of neutral) add(t, null);

  return {
    match(input: string): Concept[] {
      const text = input.toLowerCase();
      const asciiOnly = ASCII_TEXT.test(text);
      const hits: Hit[] = [];
      for (const t of terms) {
        if (t.re) {
          t.re.lastIndex = 0;
          for (let m = t.re.exec(text); m; m = t.re.exec(text)) hits.push({ start: m.index, end: m.index + m[0].length, concept: t.concept });
        } else if (!asciiOnly) {
          for (let i = text.indexOf(t.text); i !== -1; i = text.indexOf(t.text, i + 1)) {
            hits.push({ start: i, end: i + t.text.length, concept: t.concept });
          }
        }
      }
      hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
      const taken: Hit[] = [];
      const found = new Set<Concept>();
      for (const h of hits) {
        if (taken.some((t) => h.start < t.end && t.start < h.end)) continue;
        taken.push(h);
        if (h.concept) found.add(h.concept);
      }
      return [...found];
    },
  };
}

/** The domain with the most distinct concepts; ties go to the earlier domain in DOMAIN_ORDER. */
export function topDomain(concepts: readonly Concept[]): Domain | null {
  const counts = new Map<Domain, number>();
  for (const c of concepts) counts.set(c.domain, (counts.get(c.domain) ?? 0) + 1);
  let best: Domain | null = null;
  let bestN = 0;
  for (const d of DOMAIN_ORDER) {
    const n = counts.get(d) ?? 0;
    if (n > bestN) { best = d; bestN = n; }
  }
  return best;
}
```

- [ ] **Step 5: Run** — `npx vitest run tests/concepts-matcher.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/analyze/concepts.ts data/concepts.ts tests/concepts-matcher.test.ts
git commit -m "Concept matcher: whole words, longest match first, each concept once"
```

---

### Task 3: The concept table

**Files:** Modify `data/concepts.ts` (fill `CONCEPTS`, `NEUTRAL`); modify `lib/analyze/concepts.ts` (add `matchConcepts`); test `tests/concepts.test.ts`.

**Interfaces:** Produces `matchConcepts(text: string): Concept[]` over `CONCEPTS` + `NEUTRAL`, and the data.

- [ ] **Step 1: Write the failing tests** — `tests/concepts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONCEPTS, NEUTRAL, REQUIRED_LANGS } from '@/data/concepts';
import { matchConcepts, topDomain } from '@/lib/analyze/concepts';
import type { Domain } from '@/data/lexicon';

const kind = (t: string) => topDomain(matchConcepts(t));

describe('the concept table', () => {
  it('gives every concept a word in every required language, or a stated reason why not', () => {
    const missing = CONCEPTS.flatMap((c) => REQUIRED_LANGS
      .filter((l) => !(c.terms[l]?.length) && !c.gaps?.[l])
      .map((l) => `${c.id}: ${l}`));
    expect(missing).toEqual([]);
  });

  it('never gives a stated gap AND words for the same language', () => {
    const both = CONCEPTS.flatMap((c) => Object.keys(c.gaps ?? {}).filter((l) => c.terms[l as never]?.length).map((l) => `${c.id}: ${l}`));
    expect(both).toEqual([]);
  });

  it('never puts one word in two concepts', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const c of CONCEPTS) for (const list of Object.values(c.terms)) for (const t of list ?? []) {
      const k = t.toLowerCase();
      const prev = owner.get(k);
      if (prev && prev !== c.id) clashes.push(`${k}: ${prev} / ${c.id}`);
      owner.set(k, c.id);
    }
    expect(clashes).toEqual([]);
  });

  it('has unique ids', () => {
    expect(new Set(CONCEPTS.map((c) => c.id)).size).toBe(CONCEPTS.length);
  });

  // A neutral phrase exists to mask a concept word inside it; one that contains none does nothing.
  it('keeps only neutral phrases that contain a concept word', () => {
    const words = CONCEPTS.flatMap((c) => Object.values(c.terms).flat()).map((t) => t!.toLowerCase());
    expect(NEUTRAL.filter((n) => !words.some((w) => n.toLowerCase().includes(w)))).toEqual([]);
  });
});

/**
 * Every word that counted before 2026-09-24 (DOMAIN_HINTS, and LEXICON entries that carried a domain) still
 * counts for the same kind — unless retired below with the reason.
 */
const LEGACY: Record<Domain, string[]> = {
  Military: ['army', 'troops', 'soldier', 'border', 'brigade', 'artillery', 'drone strike', 'battalion', '军', '边境', '部队', 'सेना', 'सैनिक',
    '軍', '国境', '部隊', 'جيش', 'قوات', 'جنود', 'حدودي', 'اجتياح', 'توغل', 'اشتباك', 'غارات', 'تعبئة', 'مناورات',
    'invasion', 'airstrike', 'missile strike', 'incursion', 'troops killed', 'casualties', 'clash', 'skirmish', 'standoff', 'mobilisation',
    'mobilization', 'troop buildup', 'ceasefire violation', 'infiltration', 'airspace violation', 'live-fire', 'military exercise', 'war game',
    'scrambled jets', 'disengagement', 'troop withdrawal', 'घुसपैठ', 'हमला', 'झड़प', 'सीमा विवाद', 'наступление', 'обстрел', 'удар', 'мобилизация',
    'حملہ', 'غارة'],
  Maritime: ['navy', 'naval', 'warship', 'submarine', 'shoal', 'strait', 'vessel', '海军', '军舰', '航母', 'नौसेना', '海軍', '軍艦', '空母',
    'مضيق', 'بحري', 'سفينة', 'سفن', 'غواصة', 'حاملة طائرات', 'خفر السواحل', 'حصار', 'blockade', 'freedom of navigation', 'water cannon', 'coast guard'],
  Cyber: ['cyber', 'hacker', 'malware', 'phishing', 'apt group', 'network intrusion', '网络攻击', '黑客', 'साइबर', 'サイバー攻撃', 'ハッカー',
    'سيبراني', 'قراصنة', 'تجسس', 'cyberattack', 'data breach', 'ransomware', 'espionage', 'spyware', 'critical infrastructure', 'disinformation'],
  Economic: ['trade', 'tariff', 'export', 'import', 'investment', 'currency', 'gdp', '贸易', '关税', 'व्यापार', '貿易', '関税',
    'تجارة', 'تجاري', 'جمارك', 'جمركية', 'صادرات', 'واردات', 'استثمار', 'sanctions', 'trade war', 'embargo', 'rare earth', 'trade deal',
    'sanctions lifted', 'санкции', 'عقوبات', 'تحریم'],
  Energy: ['oil', 'gas', 'lng', 'refinery', 'pipeline', 'crude', 'nuclear plant', '石油', '天然气', 'तेल', '天然ガス', 'نفط', 'الغاز', 'أنابيب',
    'مصفاة', 'oil supply', 'strait closure'],
  Space: ['satellite', 'orbit', 'launch vehicle', 'space station', 'isro', '卫星', 'उपग्रह', '衛星', 'قمر صناعي', 'أقمار صناعية', 'anti-satellite',
    'satellite jamming'],
  Nuclear: ['nuclear', 'warhead', 'icbm', 'uranium', 'iaea', 'परमाणु', 'نووي', 'نووى', 'يورانيوم', 'تخصيب', 'nuclear test', 'ballistic missile',
    'hypersonic', 'enrichment'],
  Diplomatic: ['summit', 'ambassador', 'foreign minister', 'treaty', 'communique', 'visit', '外交', '会晤', 'राजनयिक', '会談', 'هدنة', 'قمة', 'سفير',
    'وزير الخارجية', 'معاهدة', 'زيارة', 'expelled diplomat', 'recalled ambassador', 'summoned envoy', 'ceasefire', 'peace talks', 'de-escalation',
    'agreement signed', 'resumed flights', 'normalisation', 'normalization', 'bilateral talks', 'prisoner exchange', 'युद्धविराम', 'वार्ता', 'समझौता',
    'перемирие', 'переговоры', 'جنگ بندی', 'مذاکرات', 'وقف إطلاق النار'],
  Internal: ['riot', 'election', 'militant', 'separatist', 'crackdown', 'curfew', '骚乱', 'विद्रोह', '暴動', 'انتخابات', 'احتجاجات', 'انقلاب',
    'هجوم إرهابي', 'شغب', 'قمع', 'حظر تجول', 'terror attack', 'insurgency', 'coup', 'unrest', 'आतंकी'],
  Technology: ['semiconductor', 'chip', 'ai model', '5g', 'huawei', 'telecom', '半导体', '芯片', '半導体', 'أشباه الموصلات', 'رقائق', 'هواوي',
    'export controls', 'entity list', 'chip ban'],
};
const RETIRED: Record<string, string> = {
  carrier: 'mobile and airline carriers; aircraft carrier and carrier group carry the meaning',
  '核': 'inside 核心 ("core"), in every "core interests"; the nuclear compounds (核武, 核试验…) carry it',
  protest: 'also a diplomatic protest; protester and mass protest carry the street meaning',
  'तनाव': '"tension" names no kind of pressure (like تصعيد), and it is the Hindi India–Pakistan search word',
  'کشیدگی': '"tension" names no kind of pressure, and it is the Urdu India–Pakistan search word',
  'تنش': '"tension" names no kind of pressure',
};

describe('the words that counted before', () => {
  for (const [domain, words] of Object.entries(LEGACY) as [Domain, string[]][]) {
    it(`still count for ${domain}`, () => {
      const wrong = words.filter((w) => kind(`report: ${w}`) !== domain).map((w) => `${w} → ${kind(`report: ${w}`)}`);
      expect(wrong).toEqual([]);
    });
  }

  it('are retired only with a reason, and then no longer count', () => {
    for (const w of Object.keys(RETIRED)) expect(kind(`report: ${w}`), w).toBeNull();
  });
});

describe('real headlines, every required language', () => {
  const cases: [string, Domain | null][] = [
    ['Israeli airstrikes hit southern Lebanon', 'Military'],
    ['US, China trade war deepens as new tariffs bite', 'Economic'],
    ['Taiwan used as a bargaining chip in US–China talks', 'Diplomatic'],
    ['Seoul hosts summit; foreign ministers sign pact', 'Diplomatic'],
    ['中国海警船在仁爱礁使用水炮', 'Maritime'],
    ['中方坚定维护核心利益', null],
    ['中国女排夺得世界冠军', null],
    ['भारत-चीन सीमा पर सैनिकों की तैनाती घटी', 'Military'],
    ['तेलंगाना में चुनाव की तैयारी', 'Internal'],
    ['ウランバートルで日モンゴル首脳会談', 'Diplomatic'],
    ['中国軍、台湾海峡で実弾演習', 'Military'],
    ['قطر تحذر من انفجار إقليمي بسبب مضيق هرمز', 'Maritime'],
    ['ضربات أمريكية على إيران', 'Military'],
    ['Россия и Украина провели переговоры о перемирии', 'Diplomatic'],
    ['ВСУ нанесли удар по позициям армии', 'Military'],
  ];
  it.each(cases)('%s → %s', (headline, domain) => {
    expect(kind(headline)).toBe(domain);
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/concepts.test.ts` → FAIL (`matchConcepts` missing; table empty).

- [ ] **Step 3: Add `matchConcepts`** — in `lib/analyze/concepts.ts` change the import to `import { CONCEPTS, DOMAIN_ORDER, NEUTRAL, type Concept } from '@/data/concepts';` and append:

```ts
const DEFAULT = compileMatcher(CONCEPTS, NEUTRAL);
/** The concepts a text mentions, read with the project's own table. */
export function matchConcepts(text: string): Concept[] {
  return DEFAULT.match(text);
}
```

- [ ] **Step 4: Fill the table** — replace the empty `CONCEPTS` and `NEUTRAL` in `data/concepts.ts` with:

```ts
/**
 * Which kind of pressure a report is about — the single source of that evidence (the escalation
 * LEXICON measures how intense, not which kind). One concept, one word or phrase per language, so a
 * Language Lens comparison measures framing rather than which language has the richer vocabulary. See
 * docs/specs/2026-09-24-shared-concepts-design.md; tests/concepts.test.ts fails if a concept lacks a
 * required language without a stated reason.
 *
 * Words come from the corpus's own recurring vocabulary. Chinese lists Simplified and Traditional forms
 * (Taiwan outlets are filed as zh). A word Chinese and Japanese share is listed once, under zh, and read
 * in both; ja holds Japanese-only forms. Russian and Arabic entries are stems where inflection varies.
 */
export const CONCEPTS: readonly Concept[] = [
  // ── Military ──
  { id: 'armed-forces', domain: 'Military', terms: {
    en: ['military', 'army', 'armed forces', 'troop', 'soldier', 'brigade', 'battalion', 'pla'],
    zh: ['军', '軍', '部队', '部隊', '士兵', '兵力'],
    hi: ['सेना', 'सैनिक', 'सैन्य', 'फौज'],
    ja: ['兵士', '自衛隊'],
    ar: ['جيش', 'قوات', 'جنود', 'عسكري', 'عسكرى'],
    ru: ['арми', 'военн', 'войск', 'солдат', 'вооруженн', 'вооружённ', 'всу'],
  } },
  { id: 'border', domain: 'Military', terms: {
    en: ['border', 'frontier', 'line of control', 'line of actual control', 'lac', 'loc'],
    zh: ['边境', '邊境', '边界', '邊界', '实控线', '實控線'],
    hi: ['सीमा', 'एलएसी', 'एलओसी', 'नियंत्रण रेखा'],
    ja: ['国境'],
    ar: ['حدودي', 'الحدود البرية'],
    ru: ['граница', 'границе', 'границы', 'границу', 'пограничн'],
  } },
  { id: 'invasion', domain: 'Military', terms: {
    en: ['invasion', 'invade', 'invading', 'incursion', 'infiltration', 'airspace violation'],
    zh: ['入侵', '侵入', '越境', '侵略'],
    hi: ['घुसपैठ', 'आक्रमण'],
    ja: ['侵攻'],
    ar: ['اجتياح', 'توغل', 'تسلل'],
    ru: ['вторжени', 'наступлени'],
  } },
  { id: 'armed-attack', domain: 'Military', terms: {
    en: ['attack', 'strike', 'airstrike', 'air strike', 'missile strike', 'drone strike', 'bombing', 'bombardment', 'shelling', 'artillery'],
    zh: ['袭击', '襲擊', '攻击', '攻擊', '空袭', '空襲', '轰炸', '轟炸', '炮击', '砲擊'],
    hi: ['हमला', 'हमले', 'हवाई हमला', 'एयरस्ट्राइक', 'बमबारी', 'गोलाबारी'],
    ja: ['攻撃', '襲撃', '空爆', '爆撃', '砲撃'],
    ar: ['هجوم', 'هجمات', 'غارة', 'غارات', 'قصف', 'ضربة', 'ضربات'],
    ru: ['атак', 'удар', 'авиаудар', 'обстрел', 'бомбардиров', 'нападени'],
    ur: ['حملہ'],
  } },
  { id: 'missiles', domain: 'Military', terms: {
    en: ['missile', 'rocket fire', 'rocket attack'],
    zh: ['导弹', '導彈', '飞弹', '飛彈', '火箭弹', '火箭彈'],
    hi: ['मिसाइल', 'रॉकेट'],
    ja: ['ミサイル', 'ロケット弾'],
    ar: ['صاروخ', 'صواريخ'],
    ru: ['ракет'],
  } },
  { id: 'war-and-clashes', domain: 'Military', terms: {
    en: ['war', 'warfare', 'clash', 'skirmish', 'firefight', 'conflict', 'hostilities', 'standoff', 'combat', 'ceasefire violation'],
    zh: ['冲突', '衝突', '交火', '战争', '戰爭', '开战', '開戰', '战事', '戰事'],
    hi: ['युद्ध', 'जंग', 'झड़प', 'संघर्ष'],
    ja: ['戦争', '交戦', '紛争', '戦闘'],
    ar: ['حرب', 'معارك', 'اشتباك', 'نزاع'],
    ru: ['войн', 'конфликт', 'столкновени', 'боевые действия'],
  } },
  { id: 'exercises', domain: 'Military', terms: {
    en: ['military exercise', 'military drill', 'joint exercise', 'war game', 'wargame', 'live-fire', 'live fire'],
    zh: ['军演', '軍演', '演习', '演習', '实弹', '實彈', '操演'],
    hi: ['युद्धाभ्यास', 'सैन्य अभ्यास'],
    ja: ['実弾'],
    ar: ['مناورات', 'تدريبات عسكرية'],
    ru: ['учения', 'учений', 'учениях'],
  } },
  { id: 'mobilisation', domain: 'Military', terms: {
    en: ['mobilisation', 'mobilization', 'troop buildup', 'military buildup', 'troop deployment'],
    zh: ['动员', '動員', '增兵'],
    hi: ['तैनाती', 'लामबंदी'],
    ja: ['増派'],
    ar: ['تعبئة', 'حشود عسكرية'],
    ru: ['мобилизаци'],
  } },
  { id: 'casualties', domain: 'Military', terms: {
    en: ['casualties', 'casualty', 'troops killed', 'soldiers killed', 'killed in action'],
    zh: ['伤亡', '傷亡'],
    hi: ['हताहत', 'शहीद'],
    ja: ['死傷'],
    ar: ['خسائر بشرية', 'قتلى وجرحى', 'شهداء'],
  }, gaps: { ru: 'потери also means financial losses and погибшие covers accidents: no word that means casualties of fighting' } },
  { id: 'weapons', domain: 'Military', terms: {
    en: ['weapon', 'arms sale', 'arms deal', 'arms race', 'arms supplies', 'ammunition', 'munitions', 'arsenal'],
    zh: ['武器', '军售', '軍售', '弹药', '彈藥', '军火', '軍火'],
    hi: ['हथियार', 'गोला-बारूद', 'गोला बारूद', 'शस्त्र'],
    ja: ['弾薬', '兵器'],
    ar: ['أسلحة', 'سلاح', 'ذخيرة', 'ذخائر'],
    ru: ['оружи', 'вооружени', 'боеприпас'],
  } },
  { id: 'defence', domain: 'Military', terms: {
    en: ['defence', 'defense', 'pentagon'],
    zh: ['国防', '國防', '防务', '防務', '防空'],
    hi: ['रक्षा मंत्री', 'रक्षा मंत्रालय', 'रक्षा बजट', 'वायु रक्षा', 'डिफेंस'],
    ja: ['防衛'],
    ar: ['وزير الدفاع', 'وزارة الدفاع', 'الدفاع الجوي', 'دفاعات'],
    ru: ['оборон'],
  } },
  { id: 'drones', domain: 'Military', terms: {
    en: ['drone'],
    zh: ['无人机', '無人機'],
    hi: ['ड्रोन'],
    ja: ['ドローン'],
    ar: ['طائرة مسيرة', 'طائرات مسيرة', 'مسيّرة', 'مسيّرات'],
    ru: ['беспилотник', 'дрон'],
  } },
  { id: 'military-aircraft', domain: 'Military', terms: {
    en: ['fighter jet', 'warplane', 'military aircraft', 'scrambled jets', 'bomber', 'fighter aircraft'],
    zh: ['战机', '戰機', '军机', '軍機', '共机', '共機', '战斗机', '戰鬥機', '轰炸机', '轟炸機'],
    hi: ['लड़ाकू विमान', 'फाइटर जेट', 'बमवर्षक'],
    ja: ['戦闘機', '軍用機', '哨戒機', '爆撃機'],
    ar: ['مقاتلات', 'طائرات حربية', 'طائرة حربية'],
    ru: ['истребител', 'бомбардировщик'],
  } },
  { id: 'withdrawal', domain: 'Military', terms: {
    en: ['disengagement', 'troop withdrawal', 'pullback', 'withdraw troops'],
    zh: ['撤军', '撤軍', '脱离接触', '脫離接觸'],
    hi: ['सेना की वापसी', 'डिसएंगेजमेंट'],
    ja: ['撤兵', '撤収'],
    ar: ['انسحاب القوات', 'سحب القوات'],
    ru: ['отвод войск', 'вывод войск'],
  } },

  // ── Maritime ──
  { id: 'navy', domain: 'Maritime', terms: {
    en: ['navy', 'naval', 'warship', 'destroyer', 'frigate'],
    zh: ['海军', '海軍', '军舰', '軍艦', '舰艇', '艦艇', '驱逐舰', '驅逐艦', '护卫舰', '護衛艦', '舰队', '艦隊'],
    hi: ['नौसेना', 'युद्धपोत', 'विध्वंसक'],
    ja: ['駆逐艦'],
    ar: ['البحرية', 'سفينة حربية', 'سفن حربية', 'مدمرة', 'فرقاطة'],
    ru: ['флот', 'военно-морск', 'корабл'],
  } },
  { id: 'aircraft-carrier', domain: 'Maritime', terms: {
    en: ['aircraft carrier', 'carrier strike group', 'carrier group'],
    zh: ['航母', '航舰', '航艦', '航空母舰', '航空母艦'],
    hi: ['विमानवाहक'],
    ja: ['空母'],
    ar: ['حاملة طائرات', 'حاملة الطائرات'],
    ru: ['авианос'],
  } },
  { id: 'submarine', domain: 'Maritime', terms: {
    en: ['submarine'],
    zh: ['潜艇', '潛艇', '潜舰', '潛艦'],
    hi: ['पनडुब्बी'],
    ja: ['潜水艦'],
    ar: ['غواصة', 'غواصات'],
    ru: ['подводная лодка', 'подводной лодки', 'подводные лодки', 'подводных лодок', 'субмарин'],
  } },
  { id: 'sea-areas', domain: 'Maritime', terms: {
    en: ['strait', 'shoal', 'reef', 'territorial waters', 'sea lane', 'maritime'],
    zh: ['海峡', '海峽', '台海', '领海', '領海', '海域', '礁'],
    hi: ['जलडमरूमध्य', 'समुद्री', 'जलक्षेत्र'],
    ja: ['接続水域'],
    ar: ['مضيق', 'المياه الإقليمية', 'بحري'],
    ru: ['пролив', 'акватори', 'морск'],
  } },
  { id: 'coastguard', domain: 'Maritime', terms: {
    en: ['coast guard', 'coastguard', 'water cannon', 'maritime militia'],
    zh: ['海警', '水炮', '海上民兵'],
    hi: ['तटरक्षक'],
    ja: ['海上保安', '放水'],
    ar: ['خفر السواحل'],
    ru: ['береговой охран', 'береговая охран'],
  } },
  { id: 'blockade', domain: 'Maritime', terms: {
    en: ['blockade', 'freedom of navigation'],
    zh: ['封锁', '封鎖', '航行自由'],
    hi: ['नाकाबंदी'],
    ja: ['航行の自由'],
    ar: ['حصار', 'حرية الملاحة'],
    ru: ['блокад'],
  } },
  { id: 'vessels', domain: 'Maritime', terms: {
    en: ['vessel', 'ship', 'tanker', 'shipping lane'],
    zh: ['船', '油轮', '油輪'],
    hi: ['जहाज', 'टैंकर'],
    ja: ['タンカー'],
    ar: ['سفينة', 'سفن', 'ناقلة'],
    ru: ['судн', 'танкер', 'сухогруз'],
  } },

  // ── Cyber ──
  { id: 'cyber-attack', domain: 'Cyber', terms: {
    en: ['cyberattack', 'cyber attack', 'cyber-attack', 'hack', 'hacker', 'hacking', 'malware', 'ransomware', 'spyware', 'phishing', 'data breach', 'network intrusion', 'apt group'],
    zh: ['网络攻击', '網路攻擊', '網絡攻擊', '黑客', '駭客', '恶意软件', '惡意軟體', '勒索软件', '勒索軟體', '数据泄露', '資料外洩'],
    hi: ['साइबर हमला', 'साइबर हमले', 'हैकर', 'हैकिंग', 'मालवेयर'],
    ja: ['サイバー攻撃', 'ハッカー', 'マルウェア', 'ランサムウェア', '不正アクセス'],
    ar: ['هجوم سيبراني', 'هجمات سيبرانية', 'قراصنة', 'برمجيات خبيثة'],
    ru: ['кибератак', 'хакер'],
  } },
  { id: 'cyber', domain: 'Cyber', terms: {
    en: ['cyber', 'cybersecurity', 'cyberspace', 'critical infrastructure'],
    zh: ['网络安全', '網路安全', '網絡安全', '网络空间', '網路空間'],
    hi: ['साइबर'],
    ja: ['サイバー'],
    ar: ['سيبراني', 'الأمن السيبراني', 'الفضاء الإلكتروني', 'الفضاء السيبراني'],
    ru: ['кибер'],
  } },
  { id: 'espionage', domain: 'Cyber', terms: {
    en: ['espionage', 'spy', 'spies', 'disinformation', 'influence operation', 'information warfare'],
    zh: ['间谍', '間諜', '虚假信息', '假訊息', '认知战', '認知戰', '情报战', '情報戰'],
    hi: ['जासूसी', 'जासूस', 'दुष्प्रचार'],
    ja: ['スパイ', '諜報', '偽情報', '認知戦', '情報戦'],
    ar: ['تجسس', 'جاسوس', 'تضليل'],
    ru: ['шпион', 'дезинформаци'],
  } },

  // ── Economic ──
  { id: 'trade', domain: 'Economic', terms: {
    en: ['trade', 'export', 'import', 'trade deal'],
    zh: ['贸易', '貿易', '出口', '进口', '進口'],
    hi: ['व्यापार', 'निर्यात', 'आयात'],
    ja: ['輸出', '輸入'],
    ar: ['تجارة', 'تجاري', 'صادرات', 'واردات'],
    ru: ['торгов', 'экспорт', 'импорт'],
  } },
  { id: 'tariffs', domain: 'Economic', terms: {
    en: ['tariff', 'trade war', 'customs duty'],
    zh: ['关税', '關稅', '贸易战', '貿易戰'],
    hi: ['टैरिफ', 'व्यापार युद्ध', 'आयात शुल्क'],
    ja: ['関税', '貿易戦争'],
    ar: ['رسوم جمركية', 'جمارك', 'جمركية', 'حرب تجارية', 'حرب الجمارك'],
    ru: ['пошлин', 'торговая война', 'торговой войны', 'торговую войну'],
  } },
  { id: 'sanctions', domain: 'Economic', terms: {
    en: ['sanction', 'embargo'],
    zh: ['制裁', '禁运', '禁運'],
    hi: ['प्रतिबंध'],
    ja: ['禁輸'],
    ar: ['عقوبات', 'حظر تصدير'],
    ru: ['санкци', 'эмбарго'],
    fa: ['تحریم'],
  } },
  { id: 'economy', domain: 'Economic', terms: {
    en: ['economy', 'economic', 'investment', 'currency', 'gdp', 'rare earth'],
    zh: ['经济', '經濟', '投资', '投資', '汇率', '匯率', '稀土'],
    hi: ['अर्थव्यवस्था', 'आर्थिक', 'निवेश'],
    ja: ['経済', '通貨', '為替', 'レアアース'],
    ar: ['اقتصاد', 'استثمار', 'عملة', 'عملات'],
    ru: ['экономик', 'экономическ', 'инвестици', 'валют'],
  } },

  // ── Energy ──
  { id: 'oil-and-gas', domain: 'Energy', terms: {
    en: ['oil', 'gas', 'lng', 'crude', 'refinery', 'pipeline', 'oil supply', 'strait closure', 'energy'],
    zh: ['石油', '原油', '天然气', '天然氣', '油气', '油氣', '能源', '炼油', '煉油', '输油管', '輸油管'],
    hi: ['तेल', 'कच्चा तेल', 'गैस', 'ऊर्जा', 'पाइपलाइन', 'रिफाइनरी'],
    ja: ['天然ガス', 'ガス', 'エネルギー', 'パイプライン', '製油'],
    ar: ['نفط', 'الغاز', 'الطاقة', 'أنابيب', 'مصفاة'],
    ru: ['нефт', 'газопровод', 'природный газ', 'природного газа', 'спг', 'энерг'],
  } },
  { id: 'power-plants', domain: 'Energy', terms: {
    en: ['nuclear plant', 'nuclear power plant', 'power plant', 'power grid', 'electricity'],
    zh: ['核电', '核電', '电网', '電網', '发电厂', '發電廠', '电力', '電力'],
    hi: ['बिजली संयंत्र', 'परमाणु संयंत्र', 'बिजली'],
    ja: ['原発', '原子力発電', '送電'],
    ar: ['محطة نووية', 'محطة الطاقة', 'محطة كهرباء', 'الكهرباء'],
    ru: ['аэс', 'электростанц', 'электроэнерг'],
  } },

  // ── Space ──
  { id: 'space', domain: 'Space', terms: {
    en: ['satellite', 'orbit', 'launch vehicle', 'space station', 'isro', 'anti-satellite', 'satellite jamming', 'spacecraft', 'space agency'],
    zh: ['卫星', '衛星', '太空', '航天', '空间站', '太空站'],
    hi: ['उपग्रह', 'अंतरिक्ष', 'इसरो', 'सैटेलाइट'],
    ja: ['宇宙'],
    ar: ['قمر صناعي', 'أقمار صناعية', 'الفضاء'],
    ru: ['спутниковой', 'спутниковых', 'запуск спутник', 'космос', 'космическ', 'орбит', 'роскосмос', 'космический корабль'],
  } },

  // ── Nuclear ──
  { id: 'nuclear', domain: 'Nuclear', terms: {
    en: ['nuclear', 'warhead', 'uranium', 'enrichment', 'iaea', 'nuclear test', 'denuclearisation', 'denuclearization'],
    zh: ['核武', '核武器', '核弹', '核彈', '核试验', '核試驗', '核设施', '核設施', '核计划', '核計畫', '核问题', '核問題', '核协议', '核協議',
      '核谈判', '核談判', '无核化', '無核化', '非核化', '核威慑', '核威懾', '铀', '鈾', '浓缩', '濃縮', '国际原子能机构', '國際原子能總署'],
    hi: ['परमाणु', 'न्यूक्लियर', 'यूरेनियम'],
    ja: ['核兵器', '核実験', '核開発', '核施設', '核合意', '核弾頭', '核ミサイル', 'ウラン濃縮', '濃縮ウラン'],
    ar: ['نووي', 'نووى', 'يورانيوم', 'تخصيب', 'الطاقة الذرية'],
    ru: ['ядерн', 'урана', 'обогащени', 'магатэ'],
  } },
  { id: 'strategic-missiles', domain: 'Nuclear', terms: {
    en: ['ballistic missile', 'icbm', 'hypersonic'],
    zh: ['弹道导弹', '彈道導彈', '彈道飛彈', '洲际导弹', '洲際飛彈', '高超音速', '高超声速'],
    hi: ['बैलिस्टिक मिसाइल', 'हाइपरसोनिक', 'अंतरमहाद्वीपीय'],
    ja: ['弾道ミサイル', '大陸間弾道', '極超音速'],
    ar: ['صاروخ باليستي', 'صواريخ باليستية', 'فرط صوتي', 'فرط صوتية'],
    ru: ['баллистическ', 'гиперзвук', 'мбр'],
  } },

  // ── Diplomatic ──
  { id: 'talks', domain: 'Diplomatic', terms: {
    en: ['talks', 'negotiation', 'negotiate', 'negotiating', 'dialogue', 'bilateral talks', 'peace talks'],
    zh: ['会谈', '會談', '谈判', '談判', '对话', '對話', '磋商', '会晤', '會晤'],
    hi: ['वार्ता', 'बातचीत', 'संवाद'],
    ja: ['会談', '対話', '交渉'],
    ar: ['مفاوضات', 'تفاوض', 'محادثات', 'حوار'],
    ru: ['переговор', 'диалог'],
    ur: ['مذاکرات'],
  } },
  { id: 'summits-and-visits', domain: 'Diplomatic', terms: {
    en: ['summit', 'visit', 'state visit'],
    zh: ['峰会', '峰會', '首脑', '首腦', '访问', '訪問', '出访', '出訪'],
    hi: ['शिखर सम्मेलन', 'शिखर वार्ता', 'दौरे', 'राजकीय यात्रा'],
    ja: ['首脳会談', '首脳会議', 'サミット', '訪米', '訪中', '訪日'],
    ar: ['قمة', 'زيارة'],
    ru: ['саммит', 'визит'],
  } },
  { id: 'envoys', domain: 'Diplomatic', terms: {
    en: ['ambassador', 'envoy', 'foreign minister', 'foreign ministry', 'diplomat', 'diplomatic', 'diplomacy', 'embassy', 'summoned envoy', 'recalled ambassador', 'expelled diplomat'],
    zh: ['大使', '外长', '外長', '外交', '外交部', '外交官', '使馆', '使館', '领事', '領事'],
    hi: ['राजदूत', 'विदेश मंत्री', 'विदेश मंत्रालय', 'राजनयिक', 'कूटनीति', 'कूटनीतिक', 'दूतावास'],
    ja: ['外相', '外務大臣', '外務省'],
    ar: ['سفير', 'سفارة', 'وزير الخارجية', 'وزارة الخارجية', 'دبلوماسي'],
    ru: ['посол', 'посольств', 'дипломат', 'министр иностранных дел', 'мид рф', 'мид россии'],
  } },
  { id: 'agreements', domain: 'Diplomatic', terms: {
    en: ['treaty', 'agreement', 'pact', 'communique', 'agreement signed', 'normalisation', 'normalization', 'resumed flights', 'prisoner exchange'],
    zh: ['条约', '條約', '协议', '協議', '协定', '協定', '公报', '公報', '共识', '共識'],
    hi: ['समझौता', 'समझौते', 'संधि'],
    ja: ['条約', '合意', '共同声明'],
    ar: ['معاهدة', 'اتفاق', 'اتفاقية', 'بيان مشترك'],
    ru: ['договор', 'соглашени', 'меморандум'],
  } },
  { id: 'ceasefire', domain: 'Diplomatic', terms: {
    en: ['ceasefire', 'cease-fire', 'truce', 'de-escalation', 'deescalation'],
    zh: ['停火', '停战', '停戰', '休战', '休戰'],
    hi: ['युद्धविराम', 'संघर्ष विराम', 'सीजफायर'],
    ja: ['停戦', '休戦'],
    ar: ['وقف إطلاق النار', 'هدنة', 'تهدئة'],
    ru: ['перемири', 'прекращение огня', 'прекращения огня', 'прекращении огня', 'деэскалаци'],
    ur: ['جنگ بندی'],
  } },

  // ── Internal ──
  { id: 'unrest', domain: 'Internal', terms: {
    en: ['riot', 'unrest', 'curfew', 'crackdown', 'protester', 'demonstrators', 'mass protest', 'anti-government', 'general strike', 'labour strike', 'labor strike', 'hunger strike', 'tear gas'],
    zh: ['骚乱', '騷亂', '示威', '游行', '遊行', '暴乱', '暴亂', '戒严', '戒嚴', '镇压', '鎮壓'],
    hi: ['दंगा', 'दंगे', 'कर्फ्यू', 'विरोध प्रदर्शन', 'प्रदर्शनकारी', 'आंसू गैस'],
    ja: ['暴動', 'デモ隊', '弾圧', '戒厳'],
    ar: ['احتجاجات', 'مظاهرات', 'تظاهرات', 'شغب', 'قمع', 'حظر تجول'],
    ru: ['беспорядк', 'протестующ', 'акции протеста', 'митинг', 'комендантск', 'репресси'],
  } },
  { id: 'politics', domain: 'Internal', terms: {
    en: ['election', 'coup', 'impeachment', 'purge'],
    zh: ['选举', '選舉', '大选', '大選', '政变', '政變', '罢免', '罷免', '肃清'],
    hi: ['चुनाव', 'तख्तापलट', 'महाभियोग'],
    ja: ['選挙', '知事選', '総裁選', 'クーデター', '粛清'],
    ar: ['انتخابات', 'انقلاب'],
    ru: ['выборы', 'выборах', 'выборов', 'переворот'],
  } },
  { id: 'militancy', domain: 'Internal', terms: {
    en: ['terror', 'terrorist', 'terrorism', 'terror attack', 'militant', 'insurgency', 'insurgent', 'separatist', 'suicide bomber'],
    zh: ['恐怖袭击', '恐怖襲擊', '恐袭', '恐襲', '恐怖分子', '武装分子', '武裝分子', '叛乱', '叛亂', '分裂分子'],
    hi: ['आतंकी', 'आतंकवाद', 'आतंकी हमला', 'आतंकी हमले', 'उग्रवादी', 'अलगाववादी', 'विद्रोही', 'विद्रोह'],
    ja: ['テロ', '過激派', '武装勢力', '分離主義'],
    ar: ['إرهاب', 'هجوم إرهابي', 'مسلحين', 'مسلحون', 'متمردين', 'انفصالي'],
    ru: ['террор', 'теракт', 'боевик', 'сепаратист', 'повстан'],
  } },

  // ── Technology ──
  { id: 'chips', domain: 'Technology', terms: {
    en: ['semiconductor', 'chip', 'chipmaker', 'export controls', 'export control', 'entity list', 'chip ban'],
    zh: ['半导体', '半導體', '芯片', '晶片', '光刻机', '光刻機', '出口管制', '实体清单', '實體清單'],
    hi: ['सेमीकंडक्टर', 'चिप', 'निर्यात नियंत्रण'],
    ja: ['半導体', '輸出規制', '輸出管理'],
    ar: ['أشباه الموصلات', 'رقائق', 'قيود التصدير'],
    ru: ['полупроводник', 'микросхем', 'чип', 'экспортный контроль', 'экспортного контроля'],
  } },
  { id: 'tech-and-telecom', domain: 'Technology', terms: {
    en: ['5g', 'huawei', 'ai model', 'artificial intelligence', 'telecom'],
    zh: ['华为', '華為', '人工智能', '电信', '電信'],
    hi: ['हुआवेई', 'कृत्रिम बुद्धिमत्ता', 'दूरसंचार'],
    ja: ['ファーウェイ', '人工知能'],
    ar: ['هواوي', 'الذكاء الاصطناعي', 'الجيل الخامس'],
    ru: ['хуавэй', 'искусственный интеллект', 'искусственного интеллекта', 'телеком'],
  } },
];

/** Phrases that contain a concept word but mean something else: they mask it and count for nothing. */
export const NEUTRAL: readonly string[] = [
  'heart attack', 'bargaining chip', 'blue-chip', 'blue chip',
  '冠军', '冠軍', '亚军', '亞軍', '季军', '季軍',   // champion, runner-up: 军 is not an army here
  '外交評論家',                                   // "diplomacy commentator": describes the writer, not the story
  'हवाई जहाज',                                    // aeroplane: जहाज is not a ship here
  'तेलंगाना', 'तेलुगु',                             // Telangana, Telugu: तेल is not oil here
  'सीमा हैदर',                                    // Seema Haider, a person: सीमा is not a border here
  'चिपक',                                         // "stick": चिप is not a chip here
  'за границей', 'за границу', 'из-за границы',   // "abroad": граница is not a front line here
  'маэстро',                                      // аэс inside maestro
];
```

- [ ] **Step 5: Run** — `npx vitest run tests/concepts.test.ts tests/concepts-matcher.test.ts` → PASS. A failing LEGACY word or headline is fixed in the table (a missing form, a masking phrase), never by editing the expectation — unless the expectation itself was wrong, which the commit message then says.

- [ ] **Step 6: Commit**

```bash
git add data/concepts.ts lib/analyze/concepts.ts tests/concepts.test.ts
git commit -m "Shared concept table: one word per language for each kind of pressure"
```

---

### Task 4: Classify from the concepts

**Files:** Modify `lib/analyze/score.ts`, `data/lexicon.ts`; tests `tests/lens.test.ts`, `tests/lexicon-ja-ar.test.ts` (`tests/analyze.test.ts` must pass unchanged).

**Interfaces:** Consumes `matchConcepts`, `topDomain`. Produces `domainOf(title: string, snippet?: string): Domain` beside the existing `evidencedDomain(title, snippet?): Domain | null`.

- [ ] **Step 1: Update the tests first**

`tests/lens.test.ts`: replace the `DOMAIN_HINTS` import with `import { CONCEPTS } from '@/data/concepts';` and the "agrees with the stored domain" test with:

```ts
  it('agrees with the stored domain wherever there is evidence, for every concept', () => {
    for (const c of CONCEPTS) {
      const [lang, words] = Object.entries(c.terms).find(([, w]) => w?.length)!;
      const text = `report: ${words![0]}`;
      expect(evidencedDomain(text), `${c.id} (${lang}): ${words![0]}`).toBe(c.domain);
      expect(scoreText(text).domain).toBe(c.domain);
    }
  });
```

`tests/lexicon-ja-ar.test.ts`: change the constructed Cyber case to `['ja', '台湾の政府機関にサイバー攻撃', 'Cyber']` (the old one also names 防空, "air defence", which now counts); replace the "does not count, in Arabic, what the English line counts only in a phrase" test with:

```ts
  // With one shared concept list the pairwise rule is no longer needed: English now counts strikes,
  // missiles and negotiations too, so Arabic can.
  it('reads strikes, missiles and negotiations the same way in Arabic and English', () => {
    expect(evidencedDomain('ضربات أمريكية على إيران')).toBe(evidencedDomain('US strikes on Iran'));
    expect(evidencedDomain('صواريخ إيران وحزب الله')).toBe(evidencedDomain('Missiles from Iran and Hezbollah'));
    expect(evidencedDomain('إيران تضع 7 شروط لبدء المفاوضات')).toBe(evidencedDomain('Iran sets seven conditions for negotiations'));
  });
```

and end its header comment with: `Since the shared concept list (data/concepts.ts) these are ordinary concepts; the guards below still hold.`

- [ ] **Step 2: Run to see them fail** — `npx vitest run tests/lens.test.ts tests/lexicon-ja-ar.test.ts` → FAIL.

- [ ] **Step 3: Rewrite the domain part of `lib/analyze/score.ts`** — imports:

```ts
import { LEXICON, type Domain } from '@/data/lexicon';
import { matchConcepts, topDomain } from '@/lib/analyze/concepts';
```

Delete `evidencedFrom` and `classifyDomain`; replace `evidencedDomain` with:

```ts
/**
 * An article's domain ONLY when its own words show one; null otherwise. Read from the shared concept
 * list (data/concepts.ts), the same in every language — see lib/analyze/concepts for the matching rules.
 * Language Lens counts framing from this, never from the stored fallback.
 */
export function evidencedDomain(title: string, snippet = ''): Domain | null {
  return topDomain(matchConcepts(`${title} ${snippet}`));
}

/** The stored domain: the evidenced one, or 'Diplomatic' when the words show none. */
export function domainOf(title: string, snippet = ''): Domain {
  return evidencedDomain(title, snippet) ?? 'Diplomatic';
}
```

In `scoreText`, delete `const lexDomains: Domain[] = [];` and `if (e.domain) lexDomains.push(e.domain);`, and set `domain: domainOf(title, snippet),`.

- [ ] **Step 4: Retire the old lists in `data/lexicon.ts`** — delete `DOMAIN_HINTS` and its comments; change `LexEntry` to `{ term: string; lang: string; weight: number }`; strip the entries' domains:

```bash
sed -i '' -E "s/, domain: '[A-Za-z]+' \}/ }/" data/lexicon.ts
```

Keep `export type Domain` (imported widely).

- [ ] **Step 5: Run everything** — `npx tsc --noEmit && npm test` → all PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/analyze/score.ts data/lexicon.ts tests/lens.test.ts tests/lexicon-ja-ar.test.ts
git commit -m "Classify domains from the shared concepts; LEXICON keeps only intensity"
```

---

### Task 5: Re-score stored reports when the vocabulary changes

**Files:** Create `lib/analyze/rescore.ts`; modify `lib/ingest/pipeline.ts`; test `tests/rescore.test.ts`.

**Interfaces:** Consumes `domainOf`, `CONCEPTS`, `NEUTRAL`, `MATCHER_VERSION`, `getDb`, `getMeta`, `setMeta`. Produces `VOCAB_KEY`, `vocabVersion(): string`, `rescoreDomainsIfStale(): { rescored: boolean; changed: number }`.

- [ ] **Step 1: Write the failing test** — `tests/rescore.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { art } from './fixtures/demo-fixtures';

describe('rescoreDomainsIfStale', () => {
  let db: typeof import('@/lib/db');
  let rescore: typeof import('@/lib/analyze/rescore');
  const strike = art({ language: 'en', title: 'Israeli airstrikes hit southern Lebanon', domain: 'Diplomatic', ladderRung: null });
  const plain = art({ language: 'en', title: 'Leaders exchange greetings', domain: 'Diplomatic', ladderRung: null });

  beforeAll(async () => {
    process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-rescore-')), 'test.db');
    db = await import('@/lib/db');
    rescore = await import('@/lib/analyze/rescore');
    db.upsertArticles([strike, plain]);
    db.setMeta(rescore.VOCAB_KEY, 'an older vocabulary');
  });

  it('re-scores stored domains when the vocabulary has changed, and records the new version', () => {
    expect(rescore.rescoreDomainsIfStale()).toEqual({ rescored: true, changed: 1 });
    const byId = new Map(db.allArticles(10).map((a) => [a.id, a.domain]));
    expect(byId.get(strike.id)).toBe('Military');
    expect(byId.get(plain.id)).toBe('Diplomatic');
    expect(db.getMeta(rescore.VOCAB_KEY)).toBe(rescore.vocabVersion());
  });

  it('does nothing while the vocabulary is unchanged', () => {
    expect(rescore.rescoreDomainsIfStale()).toEqual({ rescored: false, changed: 0 });
  });

  it('fingerprints the table and the matching rules', () => {
    expect(rescore.vocabVersion()).toMatch(/^[0-9a-f]{16}$/);
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/rescore.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement `lib/analyze/rescore.ts`**

```ts
import { createHash } from 'node:crypto';
import { CONCEPTS, NEUTRAL } from '@/data/concepts';
import { MATCHER_VERSION } from '@/lib/analyze/concepts';
import { domainOf } from '@/lib/analyze/score';
import { getDb, getMeta, setMeta } from '@/lib/db';

/**
 * Keeps stored domains in step with the vocabulary. A report's domain is computed once, when it is
 * enriched, and most stored reports are never fetched again — so without this, a change to
 * data/concepts.ts would reach only new reports, and the Board would mix two vocabularies for 90 days.
 *
 * The version is a fingerprint of the table and the matching rules, so no one has to remember to bump
 * it. The ingest pipeline calls this just before it re-clusters, which is also when domains matter
 * most: clustering never joins reports across domains.
 */
export const VOCAB_KEY = 'domain_vocab';

export function vocabVersion(): string {
  return createHash('sha256').update(JSON.stringify({ CONCEPTS, NEUTRAL, MATCHER_VERSION })).digest('hex').slice(0, 16);
}

export function rescoreDomainsIfStale(): { rescored: boolean; changed: number } {
  const version = vocabVersion();
  if (getMeta(VOCAB_KEY) === version) return { rescored: false, changed: 0 };
  const db = getDb();
  const rows = db.prepare('SELECT id, title, snippet, domain FROM articles').all() as
    { id: string; title: string; snippet: string | null; domain: string }[];
  const update = db.prepare('UPDATE articles SET domain = ? WHERE id = ?');
  let changed = 0;
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const next = domainOf(r.title, r.snippet ?? '');
      if (next !== r.domain) { update.run(next, r.id); changed += 1; }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  setMeta(VOCAB_KEY, version);
  return { rescored: true, changed };
}
```

- [ ] **Step 4: Call it from the pipeline** — in `lib/ingest/pipeline.ts` add `import { rescoreDomainsIfStale } from '@/lib/analyze/rescore';` and, immediately before `// Cluster over the whole stored corpus…`:

```ts
  // A vocabulary change re-scores every stored report's domain before clustering, which never joins
  // reports across domains. A no-op unless data/concepts.ts or the matching rules changed.
  const rescored = rescoreDomainsIfStale();
  if (rescored.rescored) log(`re-scored stored domains for a new vocabulary: ${rescored.changed} changed`);
```

- [ ] **Step 5: Run** — `npx vitest run tests/rescore.test.ts && npx tsc --noEmit && npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/analyze/rescore.ts lib/ingest/pipeline.ts tests/rescore.test.ts
git commit -m "Re-score stored domains whenever the concept vocabulary changes"
```

---

### Task 6: Measure, read, tune — and show Josh

**Files:** `data/concepts.ts` and `tests/concepts.test.ts` for any fix; `STATE.md`; the spec; `app/methodology/page.tsx`.

- [ ] **Step 1: After-numbers** — `npm run concepts:report > "$TMPDIR/kv/concepts-after.txt"`; `npx tsx --tsconfig tsconfig.scripts.json scripts/cluster-gates.ts > "$TMPDIR/kv/gates-after.txt"`; `diff` each against its `-before` file.
- [ ] **Step 2: Read the largest event's members** (printed by the report): one story, or several? Check a known large story (the India–China border talks, the Houthi / Red Sea advance) is still one or a few events, not shattered.
- [ ] **Step 3: Precision by hand** — `npm run concepts:report -- --sample <lang> 30` for en, zh, hi, ja, ar, ru; count right / debatable / wrong per language.
- [ ] **Step 4: Fix systematic errors only** — per pattern, not per headline: add the failing headline to `tests/concepts.test.ts`'s real-headline cases, fix `data/concepts.ts` (a masking NEUTRAL phrase, a narrower term), rerun, commit `Concepts: <what> — <why>`.
- [ ] **Step 5: Methodology** — near the clustering paragraph (~line 162 of `app/methodology/page.tsx`) add: *"A report's kind of pressure — military, maritime, diplomatic and so on — is read from one list of concepts with a word for each concept in every language compared, so no language is read more closely than another."* Check `/methodology` renders it.
- [ ] **Step 6: Record** — STATE.md section: before/after coverage, Lens verdicts, domain mix, clustering, precision table, retired words. Update the spec: the re-score runs at ingest behind a vocabulary fingerprint (replacing the manual backfill script), and the table has a few dozen concepts (not 60–90). Commit.
- [ ] **Step 7: CHECKPOINT — show Josh** the before/after; wait for his go before Task 7.

---

### Task 7: Ship

- [ ] **Step 1:** fast-forward `main` to `shared-concepts`; `git push origin main`.
- [ ] **Step 2:** `rm -rf .next && npm test && npm run build && cp -r .next/static .next/standalone/.next/static`; run locally against a copy of the corpus (preview config `kautilya-prod`); `/kautilya/lens`, `/kautilya/board`, `/kautilya/demo` return 200 with no console errors and every `_next/static` request 200.
- [ ] **Step 3: Back up the live database BEFORE deploying** — the hourly cron would re-score right after the restart:

```bash
IP=$(dig +short ramanujtech.com A | tail -1)
ssh root@$IP 'sqlite3 /var/lib/kautilya/kautilya.db ".backup /var/lib/kautilya/pre-concepts-$(date +%F-%H%M).db" && ls -la /var/lib/kautilya/pre-concepts-*'
```

- [ ] **Step 4:** dry-run rsync (the runbook's exclusion flags), confirm 0 `.db`/`darwin`/duplicate lines, deploy, restart, server `find` check.
- [ ] **Step 5: Trigger the re-score now** rather than waiting for the hour:

```bash
ssh root@$IP '. /etc/kautilya.env && curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/kautilya/api/cron && journalctl -u kautilya --since "-5 min" | grep -E "re-scored|clustered"'
```

Expected: `200` and a `re-scored stored domains … changed` line.
- [ ] **Step 6: Live checks** — the runbook probes; `/kautilya/lens` verdicts consistent with the local after-report (allowing for corpus drift); every `_next/static` asset 200.
- [ ] **Step 7:** fix `docs/runbooks/vps-deploy.md`'s cron line to `/kautilya/api/cron`; STATE.md "deployed" note; commit, push; mirror to AI_apps (tracked files only, domain/IP scan), open the PR.
