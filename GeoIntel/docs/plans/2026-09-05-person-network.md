# Person Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bipartite person↔country network — a curated roster of officials linked to the states they are named alongside — as a second view over the existing event corpus.

**Architecture:** A hand-curated multilingual gazetteer (`data/people.ts`) mirroring `data/countries.ts`, matched by the alias matcher already in `lib/analyze/entities.ts`. People are stored in their own field on `Article` and `GeoEvent`, never merged into `actors`. `buildGraph` gains a `pairFilter` option so `personGraph()` emits only person↔country edges. A new panel drops the two measures that are meaningless on a bipartite graph and leaves each person's home-state edge out of the friction total.

**Tech Stack:** TypeScript, Next.js 15 App Router, node:sqlite via `lib/db`, vitest.

**Spec:** `docs/specs/2026-09-05-person-network-design.md` — read it before starting. It carries the corpus measurements that justify this shape and the two code constraints below.

## Global Constraints

These apply to every task. They are copied from the spec; do not re-derive them.

1. **People are NEVER merged into `actors`.** `lib/verify/cluster.ts:129` forms events by testing shared actors. Changing `actors` changes event clustering — the subsystem that produced a 393-article blob and carries regression tests for both blobbing and fragmentation. Task 2 pins this with a test.
2. **Person ids MUST NOT contain `|`.** `edgeKey` in `lib/graph/build.ts` joins participants with `|`, so `'a|b' + 'c'` and `'a' + 'b|c'` collide. Validated in Task 1.
3. **No model in the extraction or scoring path.** The roster is hand-curated. `/methodology` states that no score on the site comes from a model guessing; that must stay true.
4. **Entanglement is dropped and conflict cluster is replaced** on person views. A bipartite graph has no triangles, so clustering coefficient is identically 0.
5. **The home-state edge is excluded from the friction total ONLY, never from the ranks.** Friction is a magnitude the home tie dominates; a single edge barely perturbs a centrality, and deleting a real edge would rank people in a graph that does not exist. The row is named *Cross-border friction* so the exclusion is legible.
6. **Every new test must be checked against its mutant before it is trusted.** Break the code the test claims to protect, watch the test fail, revert. Ten review rounds on the network-graph plan were lost to assertions that survived a one-character change. A step saying "verify it fails" means run it and read the output.
7. **Every new test file opens with a header comment** explaining what the file protects and listing the mutation each test catches, matching `tests/cohesion.test.ts`, `tests/graph-panel.test.ts` and `tests/graph-ego.test.ts`.
8. **British spelling in user-facing copy**, matching the existing pages ("neighbourhood", "recognised").

---

## File Structure

| File | Responsibility |
|---|---|
| `data/people.ts` | The roster: ids, display names, roles, home states, multilingual aliases. Data only. |
| `lib/analyze/entities.ts` | Gains `extractPeople()` beside `extractActors()`. Reuses the private `matches()` helper. |
| `lib/types.ts` | `Article.people`, `GeoEvent.people`. |
| `lib/db/index.ts` | Column migration, insert, and row mapping for both new fields. |
| `lib/ingest/pipeline.ts` | Calls `extractPeople` and puts the result on the article. |
| `lib/verify/cluster.ts` | Aggregates `people` onto the event, as a sibling of `actors`. |
| `lib/graph/build.ts` | `pairFilter` option; `personGraph()`. |
| `lib/graph/person-panel.ts` | The person metric rows. Separate file from `panel.ts` — different measure set, different home-edge rule. |
| `app/person/[id]/page.tsx` | The page. Gates, wires the walk, renders. |
| `tests/people.test.ts` | Gazetteer integrity + extraction. |
| `tests/graph-person.test.ts` | `pairFilter`, `personGraph`, `personPanel`. |

---

### Task 1: The roster and extraction

**Files:**
- Create: `data/people.ts`
- Modify: `lib/analyze/entities.ts` (append after `extractHotspots`, around line 40)
- Test: `tests/people.test.ts`

**Interfaces:**
- Consumes: the private `matches(alias, haystackLower, haystackRaw)` helper at `lib/analyze/entities.ts:12`. It is module-private and `extractPeople` lives in the same file, so it needs no export.
- Produces: `interface Person`, `PEOPLE: Person[]`, `BY_PERSON: Map<string, Person>` from `@/data/people`; `extractPeople(text: string): string[]` from `@/lib/analyze/entities`.

- [ ] **Step 1: Write the failing test**

Create `tests/people.test.ts`:

```ts
// tests/people.test.ts
//
// The person roster and its extraction. Two things are protected here.
//
// First, gazetteer integrity: ids feed edgeKey, which joins with '|', so an id containing
// a pipe would silently merge two different people's edges (see the Task 1 ruling in the
// network-graph ledger, which anticipated exactly this). Home states must be real ISO3
// codes or the affiliation rule in Task 4 has nothing to exclude.
//
// Second, alias matching across scripts. Person names are far more dangerous than country
// names here: 'xi' and 'lai' are complete words in English, so a substring match fires
// inside 'taxi' and 'malaise'. The matcher already distinguishes Latin (word-boundary) from
// CJK/Devanagari (substring); these tests pin that it keeps doing so for people.
//
// Mutation notes:
// - "rejects a pipe in any id": deleting the id validation.
// - "resolves the same figure across four scripts": dropping a script's alias handling.
// - "does not fire inside an ordinary word": replacing the Latin branch with a substring test.
// - "home state is a real country": a typo'd or stale ISO3 in the roster.
import { describe, it, expect } from 'vitest';
import { PEOPLE, BY_PERSON } from '@/data/people';
import { extractPeople } from '@/lib/analyze/entities';
import { BY_ISO } from '@/data/countries';

describe('the roster', () => {
  it('rejects a pipe in any id, because edgeKey joins on it', () => {
    for (const p of PEOPLE) expect(p.id).not.toContain('|');
  });

  it('uses ids that are unique and lowercase-hyphen', () => {
    const ids = PEOPLE.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('gives every person a home state that is a real country', () => {
    for (const p of PEOPLE) expect(BY_ISO.has(p.home)).toBe(true);
  });

  it('indexes every person by id', () => {
    expect(BY_PERSON.size).toBe(PEOPLE.length);
    expect(BY_PERSON.get('wang-yi')!.home).toBe('CHN');
  });
});

describe('extractPeople', () => {
  it('resolves the same figure across four scripts', () => {
    expect(extractPeople('Wang Yi met his counterpart')).toContain('wang-yi');
    expect(extractPeople('王毅会见')).toContain('wang-yi');
    expect(extractPeople('मोदी ने कहा')).toContain('modi');
    expect(extractPeople('قال مودي')).toContain('modi');
  });

  it('does not fire inside an ordinary word', () => {
    // The whole reason short Latin aliases are forbidden. If 'xi' were an alias, this
    // headline would name Xi Jinping; if 'lai' were, 'malaise' would name Lai Ching-te.
    expect(extractPeople('The taxi fare rose')).toEqual([]);
    expect(extractPeople('a general malaise')).toEqual([]);
  });

  it('returns each person once however many aliases hit', () => {
    const out = extractPeople('Xi Jinping and 习近平 in one headline');
    expect(out.filter((p) => p === 'xi-jinping')).toHaveLength(1);
  });

  it('returns an empty array when nobody is named', () => {
    expect(extractPeople('Border talks resume')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tests/people.test.ts`
Expected: FAIL — `Cannot find module '@/data/people'`.

- [ ] **Step 3: Create the gazetteer**

Create `data/people.ts`. Start with the twelve figures the corpus measurement already found, then extend toward 80–150 as described in the spec. Every alias must be a form an outlet actually prints.

```ts
// Multilingual roster of senior officials.
//
// Mirrors data/countries.ts, whose shape is already proven against this corpus's scripts.
// `aliases` carries the forms outlets actually print in their own language — that is what
// lets a Xinhua piece and a PIB release resolve to the same person.
//
// NO ALIAS SHORTER THAN FOUR LATIN CHARACTERS. 'xi' and 'lai' are ordinary English words
// and fire inside 'taxi' and 'malaise'. Use a qualified form ('lai ching-te') or a
// script-specific one ('赖清德'). tests/people.test.ts pins this.
//
// `id` must never contain '|': lib/graph/build.ts's edgeKey joins participants with it, so
// a pipe in an id silently merges two different people's edges.
//
// Roster last reviewed: 2026-09-05. This list goes stale as cabinets change; a stale entry
// is invisible rather than wrong, which is why /methodology discloses the review date.

export interface Person {
  id: string;
  name: string;
  role: string;
  /** ISO3 of the state they serve. Drawn as affiliation, excluded from every rank. */
  home: string;
  aliases: string[];
}

export const PEOPLE: Person[] = [
  { id: 'xi-jinping', name: 'Xi Jinping', role: 'President', home: 'CHN',
    aliases: ['xi jinping', '习近平', 'शी जिनपिंग', 'شي جين بينغ'] },
  { id: 'wang-yi', name: 'Wang Yi', role: 'Foreign Minister', home: 'CHN',
    aliases: ['wang yi', '王毅', 'वांग यी', 'وانغ يي'] },
  { id: 'lin-jian', name: 'Lin Jian', role: 'MFA Spokesperson', home: 'CHN',
    aliases: ['lin jian', '林剑'] },
  { id: 'modi', name: 'Narendra Modi', role: 'Prime Minister', home: 'IND',
    aliases: ['narendra modi', 'modi', '莫迪', 'मोदी', 'مودي'] },
  { id: 'jaishankar', name: 'S. Jaishankar', role: 'External Affairs Minister', home: 'IND',
    aliases: ['jaishankar', '苏杰生', 'जयशंकर'] },
  { id: 'rajnath-singh', name: 'Rajnath Singh', role: 'Defence Minister', home: 'IND',
    aliases: ['rajnath', '拉杰纳特', 'राजनाथ'] },
  { id: 'putin', name: 'Vladimir Putin', role: 'President', home: 'RUS',
    aliases: ['putin', 'путин', '普京', 'पुतिन', 'بوتين'] },
  { id: 'trump', name: 'Donald Trump', role: 'President', home: 'USA',
    aliases: ['trump', '特朗普', 'ट्रंप', 'ट्रम्प', 'ترامب'] },
  { id: 'zelensky', name: 'Volodymyr Zelensky', role: 'President', home: 'UKR',
    aliases: ['zelensky', 'zelenskyy', 'зеленский', '泽连斯基'] },
  { id: 'netanyahu', name: 'Benjamin Netanyahu', role: 'Prime Minister', home: 'ISR',
    aliases: ['netanyahu', '内塔尼亚胡', 'नेतन्याहू', 'نتنياهو'] },
  { id: 'lai-ching-te', name: 'Lai Ching-te', role: 'President', home: 'TWN',
    aliases: ['lai ching-te', 'william lai', '赖清德'] },
  { id: 'kim-jong-un', name: 'Kim Jong Un', role: 'Supreme Leader', home: 'PRK',
    aliases: ['kim jong un', 'kim jong-un', '金正恩', '김정은'] },
  { id: 'shehbaz-sharif', name: 'Shehbaz Sharif', role: 'Prime Minister', home: 'PAK',
    aliases: ['shehbaz', 'shahbaz sharif', '夏巴兹', 'शहबाज'] },
];

export const BY_PERSON = new Map(PEOPLE.map((p) => [p.id, p]));
```

Before continuing, confirm every `home` value exists in `data/countries.ts`. `UKR`, `ISR` and `PRK` may not be in the 68-country gazetteer; if one is missing, either add the country or drop that person. The test in Step 1 will tell you.

- [ ] **Step 4: Add the extractor**

In `lib/analyze/entities.ts`, add the import at the top and the function after `extractHotspots`:

```ts
import { PEOPLE } from '@/data/people';

/**
 * Named officials in a headline. Same alias machinery as extractActors — Latin aliases need
 * word boundaries, CJK and Indic scripts are matched as substrings because they have none.
 *
 * People are returned separately from actors and must STAY separate: lib/verify/cluster.ts
 * forms events by testing shared actors, so folding a person id into that array would change
 * which reports cluster together.
 */
export function extractPeople(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const raw = text;
  const hits: string[] = [];
  for (const p of PEOPLE) {
    if (p.aliases.some((a) => matches(a, lower, raw))) hits.push(p.id);
  }
  return [...new Set(hits)];
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run tests/people.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Mutation-check two of them**

Replace the Latin branch of `matches()` (`lib/analyze/entities.ts:14-18`) with a bare
`return haystackLower.includes(a);` and run the file again.
Expected: "does not fire inside an ordinary word" FAILS. Revert.

Then add a person with `id: 'a|b'` to the roster and re-run.
Expected: "rejects a pipe in any id" FAILS. Revert.

If either test still passes, the test is worthless — fix the test, not the code.

- [ ] **Step 7: Commit**

```bash
git add data/people.ts lib/analyze/entities.ts tests/people.test.ts
git commit -m "Add a curated roster of officials and match it across scripts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Storage, and the guard on event clustering

**Files:**
- Modify: `lib/types.ts:28` (Article), `lib/types.ts:59` (GeoEvent)
- Modify: `lib/db/index.ts` — migration block (~line 82), article insert (~line 126-155), `rowToArticle` (~line 167), event insert (~line 190-205), `rowToEvent` (~line 216)
- Modify: `lib/ingest/pipeline.ts:18`
- Modify: `lib/verify/cluster.ts:308`
- Test: `tests/people.test.ts` (append)

**Interfaces:**
- Consumes: `extractPeople` from Task 1.
- Produces: `Article.people: string[]`, `GeoEvent.people: string[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/people.test.ts`:

```ts
import { clusterArticles } from '@/lib/verify/cluster';
import type { Article } from '@/lib/types';

/** A minimal article fixture. Only the fields clustering reads are populated. */
function article(over: Partial<Article> & { id: string; title: string }): Article {
  return {
    url: `https://example.test/${over.id}`, outlet: 'Test', publishedAt: '2026-09-01T00:00:00Z',
    snippet: '', imageUrl: null, language: 'en', beatId: 'b', localeKey: 'en-US',
    sourceCountry: 'USA', ownership: 'independent', tier: 1, isPrimary: false,
    actors: [], hotspots: [], domain: 'Diplomatic', escalation: 0, framing: 0,
    ladderRung: null, ladderZh: null, ladderEn: null, glossed: [], titleEn: null,
    relevant: true, videoId: null, people: [], ...over,
  } as Article;
}

describe('people do not disturb event clustering', () => {
  it('leaves event actors byte-identical whether or not people are extracted', () => {
    // THE test this plan exists to protect. Clustering keys on shared actors
    // (lib/verify/cluster.ts:129). If people were ever folded into `actors`, two reports
    // naming the same official would start clustering together, silently changing which
    // reports become one event — the subsystem that took all of August to stabilise.
    //
    // Same fixture twice: once with people populated, once without. The actors on every
    // resulting event must be identical. Merging people into actors fails this immediately.
    const base = [
      article({ id: 'a1', title: 'Modi meets Wang Yi on border', actors: ['IND', 'CHN'] }),
      article({ id: 'a2', title: 'Border talks continue', actors: ['IND', 'CHN'] }),
      article({ id: 'a3', title: 'Trump comments on Taiwan', actors: ['USA', 'TWN'] }),
    ];
    const withPeople = base.map((a) => ({
      ...a, people: extractPeople(a.title),
    }));

    const shape = (arts: Article[]) =>
      clusterArticles(arts).map((e) => e.actors.slice().sort().join(',')).sort().join(' | ');

    expect(shape(withPeople)).toBe(shape(base));
  });

  it('carries people onto the event as a separate field', () => {
    const arts = [article({ id: 'a1', title: 'Modi meets Wang Yi', actors: ['IND', 'CHN'],
      people: ['modi', 'wang-yi'] })];
    const [event] = clusterArticles(arts);
    expect(event.people.sort()).toEqual(['modi', 'wang-yi']);
    expect(event.actors).not.toContain('modi');
  });
});
```

`clusterArticles(articles: Article[], opts?)` is exported from `lib/verify/cluster.ts:158`; verified, no lookup needed.

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tests/people.test.ts`
Expected: FAIL — `people` is not a property of `Article`/`GeoEvent`.

- [ ] **Step 3: Add the fields**

`lib/types.ts`, in `Article` after line 28:

```ts
  people: string[];       // roster ids; NEVER merged into actors — see cluster.ts:129
```

and in `GeoEvent` after line 59:

```ts
  people: string[];       // roster ids; a sibling of actors, never merged into it
```

- [ ] **Step 4: Migrate and persist**

In `lib/db/index.ts`, inside the additive-migration block (after the `video_id` check at ~line 91):

```ts
  if (!cols.has('people')) {
    db.exec("ALTER TABLE articles ADD COLUMN people TEXT DEFAULT '[]'");
  }
```

and after the events `video_id` check (~line 97):

```ts
  if (!eventCols.has('people')) {
    db.exec("ALTER TABLE events ADD COLUMN people TEXT DEFAULT '[]'");
  }
```

Then, in the article insert: add `people` to the column list at line ~126, `@people` to the
`VALUES` list at line ~129, `people=excluded.people,` to the `ON CONFLICT` update at line
~138, and `people: J(a.people),` to the bound parameters at line ~152. In `rowToArticle`
(~line 169) add `people: P(r.people, []),`. Apply the same four edits to the event insert
(~line 190-205) and `rowToEvent` (~line 216).

- [ ] **Step 5: Populate on ingest and aggregate onto the event**

`lib/ingest/pipeline.ts:18` — add the import and the call:

```ts
import { resolveActors, extractPeople } from '@/lib/analyze/entities';
// ...
  const { actors, hotspots } = resolveActors(text);
  const people = extractPeople(text);
```

and add `people` to the object this function returns.

`lib/verify/cluster.ts:308` — add a sibling line directly after `actors`:

```ts
    actors: [...new Set(cluster.flatMap((a) => a.actors))],
    people: [...new Set(cluster.flatMap((a) => a.people ?? []))],
```

The `?? []` matters: articles stored before this migration have no `people`.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS. The whole suite, not just the new file — this task touches clustering's
neighbourhood and `tests/cohesion.test.ts` is the canary.

- [ ] **Step 7: Mutation-check the guard**

In `lib/verify/cluster.ts:308`, temporarily change the actors line to:

```ts
    actors: [...new Set([...cluster.flatMap((a) => a.actors), ...cluster.flatMap((a) => a.people ?? [])])],
```

Run `npx vitest run tests/people.test.ts`.
Expected: "leaves event actors byte-identical" FAILS. Revert.

This is the single most important mutation check in the plan. If it passes, the guard is not
guarding and the test must be fixed before continuing.

- [ ] **Step 8: Re-ingest and confirm the column populates**

Run: `npm run ingest && npx tsx -e "import {getDb} from '@/lib/db'; const n = getDb().prepare(\"SELECT COUNT(*) n FROM articles WHERE people <> '[]'\").get(); console.log(n)"`
Expected: a non-zero count in the low hundreds — the spec measured 408 articles naming a
roster figure, so a number in that region confirms extraction is wired end to end.

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts lib/db/index.ts lib/ingest/pipeline.ts lib/verify/cluster.ts tests/people.test.ts
git commit -m "Store people beside actors, and prove clustering did not move

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The bipartite graph

**Files:**
- Modify: `lib/graph/build.ts` — `opts` type and the pairing loop (~lines 32-60); append `personGraph`
- Test: `tests/graph-person.test.ts`

**Interfaces:**
- Consumes: `buildGraph`, `Extracted`, `Graph`, `GraphEdge`; `impact`, `decay` from `@/lib/risk`; `GeoEvent.people` from Task 2.
- Produces: `buildGraph`'s `opts.pairFilter?: (a: string, b: string) => boolean`; `personGraph(events: GeoEvent[], now?: number): Graph<GeoEvent>`; `isPersonNode(id: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/graph-person.test.ts`:

```ts
// tests/graph-person.test.ts
//
// The person↔country graph is BIPARTITE by construction, and that is the property every
// consumer depends on. buildGraph pairs every participant with every other, so a naive
// call with [person, IND, CHN] would emit an IND–CHN edge duplicating the state graph with
// different weights. pairFilter is what prevents that, and this file pins it.
//
// Mutation notes:
// - "emits no country-to-country edge": deleting the pairFilter call in the pairing loop.
// - "emits no person-to-person edge": a filter admitting any pair involving a person.
// - "keeps person-country edges": a filter inverted so it drops the pairs it should keep.
import { describe, it, expect } from 'vitest';
import { buildGraph, personGraph, isPersonNode } from '@/lib/graph/build';
import type { GeoEvent } from '@/lib/types';

interface I { who: string[]; f: number }
const g = (items: I[], pairFilter?: (a: string, b: string) => boolean) =>
  buildGraph<I>(items, (i) => ({ participants: i.who, friction: i.f, alignment: 0 }),
    { pairFilter });

describe('pairFilter', () => {
  it('emits every pair when no filter is given, which is the existing behaviour', () => {
    const graph = g([{ who: ['A', 'B', 'C'], f: 50 }]);
    expect(graph.edges).toHaveLength(3);   // AB, AC, BC
  });

  it('emits only the pairs the filter admits', () => {
    // Admit only pairs where exactly one side starts with 'p'. From [p1, IND, CHN] that is
    // p1–IND and p1–CHN, never IND–CHN.
    const one = (a: string, b: string) => a.startsWith('p') !== b.startsWith('p');
    const graph = g([{ who: ['p1', 'IND', 'CHN'], f: 50 }], one);
    const keys = graph.edges.map((e) => `${e.a}-${e.b}`).sort();
    expect(keys).toEqual(['p1-CHN', 'p1-IND'].sort());
  });
});

describe('personGraph', () => {
  const event = (over: Partial<GeoEvent>): GeoEvent => ({
    id: 'e1', title: 't', summary: '', firstSeen: '2026-09-01T00:00:00Z',
    lastSeen: '2026-09-01T00:00:00Z', actors: [], hotspots: [], domain: 'Diplomatic',
    escalation: 60, confidence: 80, signals: [], flags: [], articleIds: ['a'],
    languages: ['en'], countries: ['USA'], imageUrl: null, videoId: null, ladderRung: null,
    people: [], ...over,
  } as GeoEvent);

  it('emits no country-to-country edge, so it cannot duplicate the state graph', () => {
    const graph = personGraph([event({ actors: ['IND', 'CHN'], people: ['modi'] })]);
    for (const e of graph.edges) {
      expect(isPersonNode(e.a) !== isPersonNode(e.b)).toBe(true);
    }
    expect(graph.edges).toHaveLength(2);
  });

  it('emits no person-to-person edge even when two are named', () => {
    const graph = personGraph([event({ actors: ['CHN'], people: ['modi', 'wang-yi'] })]);
    const between = graph.edges.filter((e) => isPersonNode(e.a) && isPersonNode(e.b));
    expect(between).toHaveLength(0);
  });

  it('drops an event with no person, since it has nothing bipartite to contribute', () => {
    const graph = personGraph([event({ actors: ['IND', 'CHN'], people: [] })]);
    expect(graph.edges).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tests/graph-person.test.ts`
Expected: FAIL — `personGraph` and `isPersonNode` are not exported.

- [ ] **Step 3: Add pairFilter to buildGraph**

`lib/graph/build.ts` — extend the options type at line 35:

```ts
  opts: {
    topPerEdge?: number;
    rank?: (item: T) => number;
    /**
     * Which participant pairs may become an edge. Omitted means every pair, the original
     * behaviour. personGraph passes one admitting only person↔country pairs, so the
     * bipartite structure is enforced here at construction rather than trusted downstream.
     */
    pairFilter?: (a: string, b: string) => boolean;
  } = {},
```

and guard the inner loop (currently line ~49):

```ts
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        if (opts.pairFilter && !opts.pairFilter(ps[i], ps[j])) continue;
        const k = edgeKey(ps[i], ps[j]);
```

- [ ] **Step 4: Add personGraph**

Append to `lib/graph/build.ts`:

```ts
import { BY_PERSON } from '@/data/people';

/**
 * A person id is anything the roster knows. Country nodes are ISO3 codes, which the roster
 * never contains, so membership in the roster is a total test for which side of the
 * bipartition a node sits on.
 */
export function isPersonNode(id: string): boolean {
  return BY_PERSON.has(id);
}

/**
 * The bipartite person↔country graph.
 *
 * Participants are the event's people AND its actors together, but pairFilter admits only
 * pairs that straddle the two. Without it buildGraph would also emit country↔country edges
 * — duplicating the state graph with weights derived from a different event subset — and
 * person↔person edges, which the corpus cannot support (60 articles name two figures; see
 * the spec's measurement).
 *
 * Friction is impact(), the same function behind dyad tension and the state graph, so a
 * person edge and a state edge remain the same arithmetic over the same events.
 */
export function personGraph(events: GeoEvent[], now = Date.now()): Graph<GeoEvent> {
  return buildGraph(
    events,
    (e) => ({
      participants: [...e.people, ...e.actors],
      friction: impact(e, now),
      alignment: Math.max(0, -e.escalation) * (e.confidence / 100) * decay(e.lastSeen, now),
    }),
    {
      topPerEdge: 8,
      rank: (e) => impact(e, now),
      pairFilter: (a, b) => isPersonNode(a) !== isPersonNode(b),
    },
  );
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run tests/graph-person.test.ts && npm test`
Expected: PASS. The full suite matters — `pairFilter` touches the loop `stateGraph` uses.

- [ ] **Step 6: Mutation-check**

Delete the `if (opts.pairFilter ...) continue;` line and re-run.
Expected: "emits no country-to-country edge" and "emits no person-to-person edge" both FAIL.
Revert.

- [ ] **Step 7: Commit**

```bash
git add lib/graph/build.ts tests/graph-person.test.ts
git commit -m "Build the person network bipartite, at construction rather than by convention

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The person panel

**Files:**
- Create: `lib/graph/person-panel.ts`
- Test: `tests/graph-person.test.ts` (append)

**Interfaces:**
- Consumes: `personGraph`, `isPersonNode` (Task 3); `egoView`, `EgoView` from `@/lib/graph/ego`; `degree`, `centrality`, `eigenvector`, `kCore` from `@/lib/graph/metrics`; `MetricRow` from `@/lib/graph/panel`; `BY_PERSON` from `@/data/people`; `BY_ISO` from `@/data/countries`.
- Produces: `personPanel(graph, id, topN): PersonPanel` where `PersonPanel = { view: EgoView; rows: MetricRow[]; nodeCount: number; degree: number }`.

Note the deliberate omissions: no `clusteringCoefficient` and no `conflictClusters`. See Global Constraint 4.

- [ ] **Step 1: Write the failing test**

Append to `tests/graph-person.test.ts`:

```ts
import { personPanel } from '@/lib/graph/person-panel';

describe('personPanel', () => {
  // modi's home is IND. Two events: one tying him to IND (home), one to CHN (cross-border).
  const events = [
    event({ id: 'e1', actors: ['IND'], people: ['modi'], escalation: 90, confidence: 90 }),
    event({ id: 'e2', actors: ['CHN'], people: ['modi'], escalation: 30, confidence: 90 }),
  ];

  it('drops Entanglement and Conflict cluster, which are meaningless on a bipartite graph', () => {
    // A bipartite graph has no triangles, so clustering coefficient is identically 0 for
    // every node; shipping it would print "0.00 — separate fronts" on every person page.
    // Label propagation would group people WITH countries, which says nothing.
    const labels = personPanel(personGraph(events), 'modi', 10).rows.map((r) => r.label);
    expect(labels).not.toContain('Entanglement');
    expect(labels).not.toContain('Conflict cluster');
    expect(labels).toEqual([
      'Connections', 'Cross-border friction', 'Brokerage',
      'Contagion exposure', 'Reach', 'Core depth',
    ]);
  });

  it('excludes the home state from cross-border friction', () => {
    // The home edge is by far the heaviest — a leader is named beside their own state in
    // nearly every story about it — so counting it would make this row a ranking of who
    // governs a busy country. Only the CHN edge may contribute.
    const graph = personGraph(events);
    const total = personPanel(graph, 'modi', 10).rows
      .find((r) => r.label === 'Cross-border friction')!.value;
    const homeEdge = graph.adjacency.get('modi')!.get('IND')!;
    const awayEdge = graph.adjacency.get('modi')!.get('CHN')!;
    expect(Number(total)).toBe(Math.round(awayEdge.friction));
    expect(Number(total)).toBeLessThan(Math.round(homeEdge.friction + awayEdge.friction));
  });

  it('still counts the home state as a connection, so affiliation stays visible', () => {
    const row = personPanel(personGraph(events), 'modi', 10).rows
      .find((r) => r.label === 'Connections')!;
    expect(row.value).toBe('2');
    expect(row.reading).toContain('India');
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tests/graph-person.test.ts`
Expected: FAIL — `Cannot find module '@/lib/graph/person-panel'`.

- [ ] **Step 3: Write the panel**

Create `lib/graph/person-panel.ts`:

```ts
import type { Graph } from '@/lib/graph/types';
import { egoView, type EgoView } from '@/lib/graph/ego';
import { degree, centrality, eigenvector, kCore } from '@/lib/graph/metrics';
import type { MetricRow } from '@/lib/graph/panel';
import { BY_PERSON } from '@/data/people';
import { BY_ISO } from '@/data/countries';

/**
 * The person equivalent of lib/graph/panel.ts, and a separate file because the measure set
 * genuinely differs rather than as a matter of taste.
 *
 * Two of the eight state measures cannot come across. A bipartite graph has no triangles,
 * so the clustering coefficient behind Entanglement is identically 0 for every node — it
 * would print "0.00, separate fronts" on every page and mean nothing. Conflict clusters by
 * label propagation would group people together WITH countries, which is not a finding.
 *
 * Contagion exposure is here only because of the 2026-09-05 eigenvector fix: a bipartite
 * graph is exactly the oscillation case for power iteration, and against the previous
 * implementation every figure in this column would have been a parity artefact of a
 * hardcoded loop count. tests/graph-metrics.test.ts's both-parities assertion protects it.
 *
 * The full-graph rule from lib/graph/panel.ts holds here unchanged: every measure runs on
 * `graph` before egoView cuts it down for drawing.
 */
export interface PersonPanel {
  view: EgoView;
  rows: MetricRow[];
  nodeCount: number;
  degree: number;
}

interface Rank { rank: number; tiedWith: number }

/** Competition ranking, matching lib/graph/panel.ts. See that file for why not a sorted index. */
function rankOf(scores: Map<string, number>, id: string): Rank | null {
  const own = scores.get(id);
  if (own === undefined) return null;
  let above = 0;
  let equal = 0;
  for (const v of scores.values()) {
    if (v > own) above++;
    else if (v === own) equal++;
  }
  return { rank: above + 1, tiedWith: equal - 1 };
}

const rankValue = (r: Rank | null, n: number) => (r ? `#${r.rank} of ${n}` : '—');
const rankNote = (r: Rank | null) => {
  if (!r) return ' This person has no recorded connections, so they hold no position here.';
  if (r.tiedWith === 0) return '';
  return ` Shared with ${r.tiedWith} other node${r.tiedWith === 1 ? '' : 's'} on an identical score.`;
};

export function personPanel(graph: Graph<unknown>, id: string, topN: number): PersonPanel {
  const person = BY_PERSON.get(id);
  const home = person?.home;

  // Whole graph first, ego view second — the rule lib/graph/panel.ts exists to enforce.
  const { betweenness: bc, closeness: cl } = centrality(graph);
  const ev = eigenvector(graph);
  const cores = kCore(graph);
  const deg = degree(graph, id);

  // Friction excluding the home edge. A leader is named beside their own state in nearly
  // every story about it, so including it would make this a ranking of who governs a busy
  // country — which the threat board already answers.
  let crossBorder = 0;
  for (const [other, edge] of graph.adjacency.get(id) ?? []) {
    if (other !== home) crossBorder += edge.friction;
  }

  const bcRank = rankOf(bc, id);
  const evRank = rankOf(ev, id);
  const clRank = rankOf(cl, id);
  const homeName = home ? (BY_ISO.get(home)?.name ?? home) : null;

  const view = egoView(graph, id, topN);

  const rows: MetricRow[] = [
    { label: 'Connections', value: String(deg),
      reading: `States naming ${person?.name ?? id} in at least one event`
        + (homeName ? `, including ${homeName}, whom they serve` : '')
        + (view.hidden ? `; the ${view.hidden} weakest are not drawn` : '') + '.' },
    { label: 'Cross-border friction', value: String(Math.round(crossBorder)),
      reading: `Summed tension across every state except ${homeName ?? 'their own'}. The home tie is drawn but not counted — it says who they are, not where they are active.` },
    { label: 'Brokerage', value: rankValue(bcRank, graph.nodes.length),
      reading: 'How often this node lies on the shortest route between two others.' + rankNote(bcRank) },
    { label: 'Contagion exposure', value: rankValue(evRank, graph.nodes.length),
      reading: 'Named alongside states that are themselves embroiled, rather than merely alongside many.' + rankNote(evRank) },
    { label: 'Reach', value: rankValue(clRank, graph.nodes.length),
      reading: 'How near this node sits to the rest of the network along the strongest paths.' + rankNote(clRank) },
    { label: 'Core depth', value: String(cores.get(id) ?? 0),
      reading: 'Depth within the densely connected middle of the network.' },
  ];

  return { view, rows, nodeCount: graph.nodes.length, degree: deg };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run tests/graph-person.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation-check the home-edge rule**

Change the friction loop to drop its condition (`crossBorder += edge.friction;` for every
edge) and re-run.
Expected: "excludes the home state from cross-border friction" FAILS. Revert.

- [ ] **Step 6: Commit**

```bash
git add lib/graph/person-panel.ts tests/graph-person.test.ts
git commit -m "Read a person by six measures, and never by their own flag

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The page

**Files:**
- Create: `app/person/[id]/page.tsx`
- Modify: `lib/quota/index.ts:16` (add a METERED entry), `components/Nav.tsx`
- Test: browser verification (see Step 4); no new automated test — the page is composition over four tested modules, matching the precedent set for `app/network/[iso]/page.tsx`

**Interfaces:**
- Consumes: `personGraph` (Task 3), `personPanel` (Task 4), `BY_PERSON` (Task 1); `NetworkGraph`, `NetworkMetrics`, `parseTrail`, `encodeTrail`, `DEFAULT_TOP_N`, `consume`, `corpus`.
- Produces: route `/person/[id]`; METERED key `person_network`.

- [ ] **Step 1: Add the metered action**

`lib/quota/index.ts`, in the `METERED` object after line 16:

```ts
  person_network: 'Network of states around an official',
```

- [ ] **Step 2: Write the page**

Create `app/person/[id]/page.tsx`. This mirrors `app/network/[iso]/page.tsx` closely; read
that file first and follow it, including the per-walk quota key and the early return before
any engine work.

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Panel, SectionTitle } from '@/components/ui';
import { Paywall } from '@/components/Paywall';
import { NetworkGraph } from '@/components/NetworkGraph';
import { NetworkMetrics } from '@/components/NetworkMetrics';
import { corpus } from '@/lib/queries';
import { personGraph } from '@/lib/graph/build';
import { personPanel } from '@/lib/graph/person-panel';
import { parseTrail, encodeTrail, DEFAULT_TOP_N } from '@/lib/graph/ego';
import { consume } from '@/lib/quota';
import { BY_PERSON } from '@/data/people';
import { BY_ISO } from '@/data/countries';

/**
 * The person drilldown. Same shape as app/network/[iso]/page.tsx — gate, wire the walk,
 * render what personPanel hands back — and deliberately no measure computed here.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = BY_PERSON.get(id.toLowerCase());
  return { title: p ? `${p.name} — network` : 'Person' };
}

export default async function PersonPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ trail?: string; n?: string }>;
}) {
  const { id: raw } = await params;
  const { trail: rawTrail, n: rawN } = await searchParams;
  const id = raw.toLowerCase();
  const person = BY_PERSON.get(id);
  if (!person) notFound();

  // Trail tokens may name a person or a state; both are valid walk steps.
  const trail = parseTrail(rawTrail, id)
    .filter((t) => BY_PERSON.has(t.toLowerCase()) || BY_ISO.has(t));
  const gate = await consume('person_network', trail[0]);

  if (!gate.allowed) {
    return (
      <div className="space-y-4">
        <SectionTitle>{person.name} — network</SectionTitle>
        <Paywall what={`The ${person.name} connection network`} kind={gate.kind} />
      </div>
    );
  }

  const graph = personGraph(corpus());
  const topN = Math.max(3, Math.min(24, Number(rawN) || DEFAULT_TOP_N));
  const panel = personPanel(graph, id, topN);

  return (
    <div className="space-y-4">
      <SectionTitle>{person.name} — network</SectionTitle>
      <p className="text-[11px] text-muted">{person.role}, {BY_ISO.get(person.home)?.name ?? person.home}</p>

      <nav aria-label="Walk" className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
        {trail.map((t, i) => (
          <span key={`${t}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-faint">→</span>}
            {i === trail.length - 1
              ? <span className="text-text">{t}</span>
              : <Link href={`/person/${encodeURIComponent(t)}?trail=${encodeTrail(trail.slice(0, i))}`}
                      className="hover:text-[color:var(--color-accent)]">{t}</Link>}
          </span>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <NetworkGraph view={panel.view} trail={trail} topEvents={graph.topEvents} />
          <p className="px-4 pb-4 text-[11px] leading-snug text-muted">
            An edge means this person and that state were named in the same clustered event —
            a reporting relationship, not a claim that they acted toward it. The tie to{' '}
            {BY_ISO.get(person.home)?.name ?? person.home} is affiliation and is not counted in
            any rank. This view rests on the roster: an official who is not listed is invisible.
          </p>
        </Panel>

        <Panel>
          <div className="p-4">
            <NetworkMetrics rows={panel.rows} degree={panel.degree} />
          </div>
        </Panel>
      </div>

      {!gate.unlimited && (
        <p className="text-center text-[11px] text-faint">
          {gate.remaining} of {gate.limit} free analyses remaining ·{' '}
          <Link href="/pricing" className="underline decoration-dotted hover:text-muted">See plans</Link>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run the suite and build**

Run: `npm test && npm run build`
Expected: PASS, and `/person/[id]` present in the route table.

Note: if the dev server is running, stop it first. `npm run build` and `next dev` share
`.next`, and building against a live dev server corrupts it — the symptom is a
`MODULE_NOT_FOUND` on an unrelated route, not a real error.

- [ ] **Step 4: Verify in the browser**

Start the dev server and check, reading the actual page rather than assuming:

1. `/person/modi` renders, with modi centred and states around him.
2. Cross-border friction is **lower** than the sum of all edge frictions — the home tie is
   excluded. Compare against the tooltip on the India node.
3. Entanglement and Conflict cluster do **not** appear.
4. Rank denominators equal the whole graph's node count, not the drawn ten.
5. `/person/nobody` returns 404.
6. Walking to a state and back does not spend a second credit.

- [ ] **Step 5: Commit**

```bash
git add app/person/[id]/page.tsx lib/quota/index.ts components/Nav.tsx
git commit -m "Walk the network from a person outward

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Document what it does and does not claim

**Files:**
- Modify: `app/methodology/page.tsx` (new section after §7, renumber those that follow), `README.md`, `STATE.md`, `docs/specs/2026-09-05-person-network-design.md` (status line)

- [ ] **Step 1: Add the methodology section**

Add a section after "7. The network of states", matching the surrounding `<H>`/`<P>` markup,
and renumber the sections below it. It must state, in prose:

- An edge means a person and a state were named in the same clustered event — a reporting
  relationship, not an action.
- Coverage equals roster coverage. An unlisted official is invisible, and absence is not
  evidence of non-involvement. Give the roster's last-reviewed date.
- The home-state tie is drawn as affiliation and excluded from every rank, with the reason.
- Entanglement and conflict clusters are absent here because a person↔country graph has no
  triangles — not because they were forgotten.
- It rests on roughly 400 of 4,200 articles and is thin.
- There are no person-to-person edges, and why: people are named in article bodies, which
  this corpus does not store.

- [ ] **Step 2: Update README and STATE.md**

`README.md`: a section after "The network of states" in that file's voice, plus a bullet in
"What it actually does".

`STATE.md`: add the person network to "What is done"; update the test count to the actual
figure from `npm test`; and replace next-step 3 (person-node extraction) with what remains —
fetching article bodies, its ToS prerequisite, and that it is what person↔person needs.

- [ ] **Step 3: Update the spec's status line**

Change `**Status: design approved 2026-09-05, not yet implemented.**` to record it as shipped
and note any deltas between the spec and what was built, as
`docs/specs/2026-09-03-network-graph-design.md` does.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add app/methodology/page.tsx README.md STATE.md docs/specs/2026-09-05-person-network-design.md
git commit -m "Document the person network, including what it cannot show

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## After all tasks

Run a whole-branch review over the merge base, triaging anything deferred during the tasks,
then `superpowers:finishing-a-development-branch`.

Two things to re-measure before declaring it done, because both are corpus-dependent and both
were true on 2026-09-05 rather than being invariants:

- The article count naming a roster figure. If it has fallen well below ~400, the roster has
  gone stale or the corpus has drifted.
- That the person graph is still bipartite in production: no edge may join two people or two
  states. The test pins it on fixtures; confirm it on the live graph too.
