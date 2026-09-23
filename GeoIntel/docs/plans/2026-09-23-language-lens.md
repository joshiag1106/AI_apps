# Language Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/lens` page that compares, within each search topic run in several languages, how each language's reporting frames it — with the exact searches shown and only statistically real differences called out.

**Architecture:** A pure comparison function (`lib/lens/compare.ts`) over topic-query articles; a one-line DB read and a `cache`d query wrapper; a presentational `LensBeat` component; a thin page. No schema, clustering, scoring or quota change.

**Tech Stack:** Next.js 15 App Router (server components), TypeScript, node:sqlite, vitest, react-dom/server for markup tests.

**Spec:** `docs/specs/2026-09-23-language-lens-design.md` — every rule below comes from it.

## Global Constraints

- `MIN_ARTICLES = 25` per language column; a beat needs ≥ 2 qualifying columns.
- Notable difference: gap ≥ `MIN_GAP = 0.10` **and** |z| ≥ `Z_CRIT = 2.58`; framing (domain) only.
- Who else: exclude the beat's `dyad`; each ≥ `MIN_OTHER = 3` articles; at most 3.
- Latest: 3 newest per column. Only topic-query articles (`beat_id IS NOT NULL`).
- Never put the real production domain in any tracked file (it is mirrored to a public repo).
- Every link into the app goes through `next/link` (so `basePath` applies); no raw root-relative hrefs.
- Deploy per `docs/runbooks/vps-deploy.md` "Deploying an update", including `cp -r .next/static .next/standalone/.next/static`.

---

### Task 1: The comparison — `lib/lens/compare.ts`, and a gloss on every non-English query

**Files:** Create `lib/lens/compare.ts`; modify `data/feeds.ts` (query item gains `en?: string`); test `tests/lens.test.ts`.

**Produces:**
```ts
export const MIN_ARTICLES = 25, MIN_GAP = 0.1, Z_CRIT = 2.58, MIN_OTHER = 3;
export type LensArticle = Pick<Article, 'id'|'language'|'beatId'|'domain'|'actors'|'outlet'|'publishedAt'|'title'|'titleEn'>;
export interface Share<K> { key: K; count: number; share: number }
export interface LensHeadline { id: string; title: string; titleEn: string | null; outlet: string; publishedAt: string; eventId: string | null }
export interface LensColumn { language: string; articles: number; outlets: number; asked: { q: string; en: string | null }[]; framing: Share<Domain>[]; others: Share<string>[]; latest: LensHeadline[] }
export interface Difference { domain: Domain; high: { language: string; share: number }; low: { language: string; share: number }; z: number }
export interface BeatLens { id: string; label: string; dyad: [string, string] | null; since: string; until: string; columns: LensColumn[]; sharpest: Difference | null }
export function queryLanguage(locale: string): string;
export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): number;
export function lens(articles: LensArticle[], beats: Beat[], eventOf?: Map<string, string>): BeatLens[];
```

- [ ] **Step 1: Write the failing tests** — `tests/lens.test.ts`, one `describe` per rule:
  - *two-proportion test:* `twoProportionZ(293, 895, 62, 350)` is between 5 and 5.5; antisymmetric; `0` for `(0,10,0,20)`, `(10,10,20,20)` and `n = 0`.
  - *columns:* `queryLanguage('zh-TW') === 'zh'`, `'ur-PK' → 'ur'`; en 30 / zh 30 / hi 10 → columns `['en','zh']`; en 30 / zh 24 → `[]`; en 30 / zh 40 → `['zh','en']`; `beatId` null or unknown → `[]`.
  - *a column:* `asked` is that language's queries with `en` gloss (`null` for English); `articles` and distinct `outlets`; framing `[['Military',20],['Diplomatic',10]]` with share 2/3; `others` excludes the dyad, counts a state once per report, keeps ≥ 3 reports and at most 3 (`LSK 8, BTN 7, NPL 6` from 5/6/7/8 and a 2-report state); a beat with no dyad excludes nothing; `latest` is the 3 newest with `eventId` from the map (`null` otherwise) and `titleEn` carried; `since`/`until` span only the shown columns' reports.
  - *sharpest difference:* en `{Military 100, Diplomatic 180, Economic 20}` vs zh `{54, 216, 30}` → `Military`, high en 1/3, low zh 0.18, z > 2.58; en `{10,15}` vs zh `{5,20}` (25 each, z ≈ 1.5) → `null`; en `{1333,2667}` vs zh `{1213,2787}` (3 points, z ≈ 2.9) → `null`.
  - *searches:* every `BEATS` query whose locale is not `en-*` has an `en` gloss.
- [ ] **Step 2:** `npx vitest run tests/lens.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `lib/lens/compare.ts`:

```ts
import type { Article, Domain } from '@/lib/types';
import type { Beat } from '@/data/feeds';

export const MIN_ARTICLES = 25;
export const MIN_GAP = 0.1;
export const Z_CRIT = 2.58;
export const MIN_OTHER = 3;
const LATEST = 3;
const OTHERS = 3;

// ...types exactly as in "Produces" above...

export function queryLanguage(locale: string): string {
  return locale.split('-')[0];
}

export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return 0;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se === 0 ? 0 : (x1 / n1 - x2 / n2) / se;
}

function shares<K extends string>(keys: K[], n: number): Share<K>[] {
  const m = new Map<K, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, count, share: count / n }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function column(language: string, arts: LensArticle[], beat: Beat, eventOf: Map<string, string>): LensColumn {
  const own = new Set(beat.dyad ?? []);
  return {
    language, articles: arts.length, outlets: new Set(arts.map((a) => a.outlet)).size,
    asked: beat.queries.filter((q) => queryLanguage(q.locale) === language).map((q) => ({ q: q.q, en: q.en ?? null })),
    framing: shares(arts.map((a) => a.domain), arts.length),
    others: shares(arts.flatMap((a) => [...new Set(a.actors)].filter((iso) => !own.has(iso))), arts.length)
      .filter((s) => s.count >= MIN_OTHER).slice(0, OTHERS),
    latest: [...arts].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, LATEST)
      .map((a) => ({ id: a.id, title: a.title, titleEn: a.titleEn, outlet: a.outlet, publishedAt: a.publishedAt, eventId: eventOf.get(a.id) ?? null })),
  };
}

function sharpest(cols: LensColumn[]): Difference | null {
  let best: Difference | null = null;
  let bestGap = 0;
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
    const a = cols[i], b = cols[j];
    for (const d of new Set([...a.framing, ...b.framing].map((s) => s.key))) {
      const xa = a.framing.find((s) => s.key === d)?.count ?? 0;
      const xb = b.framing.find((s) => s.key === d)?.count ?? 0;
      const pa = xa / a.articles, pb = xb / b.articles;
      const gap = Math.abs(pa - pb);
      const z = Math.abs(twoProportionZ(xa, a.articles, xb, b.articles));
      if (gap < MIN_GAP - 1e-9 || z < Z_CRIT) continue;
      if (best && (gap < bestGap || (gap === bestGap && z <= best.z))) continue;
      const [hi, lo] = pa >= pb ? [{ c: a, p: pa }, { c: b, p: pb }] : [{ c: b, p: pb }, { c: a, p: pa }];
      best = { domain: d, high: { language: hi.c.language, share: hi.p }, low: { language: lo.c.language, share: lo.p }, z };
      bestGap = gap;
    }
  }
  return best;
}

export function lens(articles: LensArticle[], beats: Beat[], eventOf: Map<string, string> = new Map()): BeatLens[] {
  // group by beatId, then by language; keep languages with >= MIN_ARTICLES, sorted by size desc;
  // skip beats with < 2 columns; since/until = min/max publishedAt of the shown columns' reports.
}
```

  and in `data/feeds.ts` the query type becomes `{ locale: LocaleKey; q: string; en?: string }`, with these glosses:
  中印边境 China–India border · 中印关系 China–India relations · 印度 边界 谈判 India border negotiations · भारत चीन सीमा India China border · بھارت پاکستان کشیدگی India Pakistan tension · भारत पाकिस्तान तनाव India Pakistan tension · 印巴 冲突 India–Pakistan conflict · 台海 军演 Taiwan Strait military drills · 共機 台海 中線 Chinese military aircraft, Taiwan Strait, median line · 台湾海峡 中国軍 Taiwan Strait, Chinese military · 中美关系 出口管制 China–US relations, export controls · 美国 制裁 中国 反制 US sanctions China, countermeasures · 南海 仁爱礁 菲律宾 South China Sea, Second Thomas Shoal, Philippines · 印度洋 海军 补给 Indian Ocean, navy, resupply · 中国 尼泊尔 斯里兰卡 马尔代夫 合作 China, Nepal, Sri Lanka, Maldives cooperation · भारतीय सेना सुरक्षा Indian Army security · 解放军 演习 战备 PLA exercises, combat readiness · 西部战区 Western Theatre Command · 外交部 发言人 表示 Foreign Ministry spokesperson says · 严正交涉 抗议 solemn representations, protest · 国防部 回应 Defence Ministry responds · Украина фронт переговоры Ukraine front, negotiations · إسرائيل إيران تصعيد Israel Iran escalation · 북한 미사일 도발 North Korea missile provocation · 网络攻击 黑客 国家 cyberattack, hackers, state · 芯片 出口管制 稀土 chips, export controls, rare earths.
- [ ] **Step 4:** `npx vitest run tests/lens.test.ts` → PASS. **Step 5:** commit.

### Task 2: The page — DB read, cached query, `LensBeat`, `/lens`, nav and footer

**Files:** Modify `lib/db/index.ts` (`beatArticles`), `lib/queries.ts` (`lensData`), `components/Nav.tsx`, `app/layout.tsx`; create `components/LensBeat.tsx`, `app/lens/page.tsx`; test `tests/lens-page.test.ts`.

**Consumes:** Task 1's `lens`, `BeatLens`, `LensColumn`, `MIN_ARTICLES`; existing `rowToArticle`, `eventIdsByArticle`, `countryName`, `LANGUAGE_LABEL`, `Empty`.
**Produces:** `beatArticles(): Article[]`; `lensData(): BeatLens[]` (`cache`d); `LensBeat({ beat, names }: { beat: BeatLens; names: Record<string, string> })`.

- [ ] **Step 1: Write the failing test** — render `LensBeat` with a two-column India–China fixture (en; zh asked `中印关系 — China–India relations`, zh headline `中印边境` glossed, no event; en headline linked to `evt-1`; `others` PAK; sharpest Military en 1/3 vs zh 0.18) and assert: topic, "English", "Chinese"; the query and its gloss; "military framing", "33%", "18%"; with `sharpest: null` → "No framing difference large enough to call out"; "Pakistan" (a name, not a code); `href="/events/evt-1"`; `lang="zh"` on the Chinese headline plus its gloss; a column with `asked: []` says its reports came from "another language".
- [ ] **Step 2:** `npx vitest run tests/lens-page.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement.**
  - `beatArticles()`: `getDb().prepare('SELECT * FROM articles WHERE beat_id IS NOT NULL').all().map(rowToArticle)`.
  - `lensData = cache(() => { const a = beatArticles(); return lens(a, BEATS, eventIdsByArticle(a.map((x) => x.id))); })`.
  - `LensBeat`: a `<section aria-labelledby>` with `panel` styling: `h2` label and the `since – until` dates; the sharpest-difference sentence — `Sharpest difference: <domain> framing — <hi%> of <Language> reports, <lo%> of <Language>.` or the no-difference sentence; a `grid md:grid-cols-2 xl:grid-cols-3` of columns. Each column (`min-w-0`): `h3` language label with `N reports · M outlets`; **Asked** (query in `lang={language}` plus ` — gloss`, or the "another language's search" note); **Framing** (top 4 domains as a bar and a percentage); **Also named** (names with percentages, or "No other state named in three or more reports."); **Latest** (headline via `next/link` to `/events/<id>` when it has an event, else plain text; `lang={language}`; gloss beneath; `outlet · date`). Dates via `toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric', timeZone:'UTC'})`. Type sizes 12px and up, whole pixels.
  - `app/lens/page.tsx`: `dynamic = 'force-dynamic'`, `metadata = { title: 'Language Lens' }`; kicker "Language Lens", `h1` "One topic, asked in several languages", an intro, and the method note (sample not the whole press; searches worded differently and shown; 10 points and p < 0.01); one `LensBeat` per beat with a country-name map built by `countryName`; `Empty` when there are none.
  - Nav: `{ href: '/lens', label: 'Language Lens' }` after China Watch. Footer "Focus": a Language Lens link after China watch.
- [ ] **Step 4:** the page test passes; `npm test` all green; `npx tsc --noEmit` clean. **Step 5:** commit.

### Task 3: Verify against a real build, then ship

- [ ] `rm -rf .next && npm test && npm run build && cp -r .next/static .next/standalone/.next/static`.
- [ ] Run the standalone server on port 4321 against a scratch copy of `kautilya.db` (`NODE_ENV=production`, `KAUTILYA_ORIGIN=http://localhost:4321/kautilya`); `/kautilya/lens` → 200 with sections; open it in a browser at desktop and 375px; console and network clean (every `_next/static` → 200); a headline link lands on its event. Delete the copy.
- [ ] STATE.md entry; fast-forward `language-lens` into `main`; push the private repo.
- [ ] Deploy per the runbook (dry run first, 0 red flags), restart, verify `/kautilya/lens` live in a browser at desktop and mobile.
- [ ] Mirror to AI_apps on a branch, open a PR; update memory.
