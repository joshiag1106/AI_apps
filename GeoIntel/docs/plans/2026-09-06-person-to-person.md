# Person-to-Person Edges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw edges between officials named in the same event, with the states those events concerned carried on the edge as context.

**Architecture:** One line changes in `personGraph`'s pair filter, turning the bipartite person↔country graph into a mixed one. `buildGraph` gains a per-edge `context` accumulator for place. Two measures return to the person panel because the graph now has triangles. Two rendering defects the mixed graph would expose are fixed first, before any person↔person edge can reach the screen.

**Tech Stack:** TypeScript, Next.js 15 App Router, node:sqlite via `lib/db`, vitest.

**Spec:** `docs/specs/2026-09-06-person-to-person-design.md` — read it first. It carries the measurements, and the reasoning for the one thing this deliberately does not build.

## Global Constraints

1. **Edges are co-mention, never interaction.** No edge carries an action, and no copy may imply one. The spec's `"Zelensky warns airlines"` example is the reason: it pairs two people who did not interact.
2. **Country↔country pairs stay excluded.** The state graph must not be duplicated with weights from a different event subset. Pinned by test.
3. **Node type is distinguished by shape, never by colour.** Colour belongs to the palette system added 2026-09-06; a hard-coded hue would be the one mark on the page that ignores a reader's accessibility choice.
4. **Every new test is checked against its mutant before it is trusted.** Break the code the test protects, watch it fail, revert. The network-graph plan lost ten review rounds to assertions that survived a one-character change, and the person-network plan lost one more to a fixture that could not reach the branch it named.
5. **Every new test file opens with a header comment** naming what it protects and the mutation each test catches, matching `tests/graph-person.test.ts`.
6. **British spelling in user-facing copy** ("neighbourhood", "recognised", "colour").

---

## File Structure

| File | Responsibility |
|---|---|
| `components/NetworkGraph.tsx` | Routes each node link by type; labels people by name and states by code; draws the two types as different shapes. |
| `lib/graph/ego.ts` | `nodeHref`, `nodeLabel` — the two presentation decisions that depend on node type. |
| `lib/graph/build.ts` | `pairFilter` change; `context` accumulation per edge. |
| `lib/graph/types.ts` | `GraphEdge.context`. |
| `lib/graph/person-panel.ts` | Entanglement and conflict cluster return. |
| `app/person/[id]/page.tsx`, `app/methodology/page.tsx` | Copy: co-mention, not interaction. |
| `tests/graph-person.test.ts` | Inverted bipartite assertions, triangles, context, panel rows, routing, labels. |

**Task order matters.** Tasks 1 and 2 fix rendering defects that exist only latently today — a person node in an ego view would link to `/network/<person-id>` and 404. They land before Task 3 makes person nodes reachable.

---

### Task 1: Route each node link by its type

**Files:**
- Modify: `components/NetworkGraph.tsx:82`, `lib/graph/ego.ts`
- Test: `tests/graph-person.test.ts` (append)

**Interfaces:**
- Consumes: `isPersonNode(id: string): boolean` from `@/lib/graph/build`; `nextTrail(trail: string[], to: string): string` from `@/lib/graph/ego`.
- Produces: `nodeHref(id: string, trail: string[]): string` exported from `@/lib/graph/ego`.

**Why first:** `NetworkGraph` hardcodes `/network/${n.id}` for every neighbour link. It is harmless today only because the bipartite graph puts no clickable person in anyone's ego view — the focus person renders as a `<g>`, not a `<Link>`. Task 3 makes person nodes appear as neighbours, and every one would link to `/network/ajit-doval`, which 404s.

- [ ] **Step 1: Write the failing test**

Append to `tests/graph-person.test.ts`:

```ts
import { nodeHref } from '@/lib/graph/ego';

describe('nodeHref', () => {
  it('routes a person to /person and a state to /network', () => {
    // NetworkGraph draws both node kinds once the graph is mixed, and a hardcoded
    // '/network/' would send every person link to a 404. The id alone does not say which
    // kind it is, so the component must not guess either.
    expect(nodeHref('modi', ['CHN'])).toBe('/person/modi?trail=CHN');
    expect(nodeHref('IND', ['CHN'])).toBe('/network/IND?trail=CHN');
  });

  it('drops the destination from the trail, as nextTrail does', () => {
    // Same walk semantics either side: arriving somewhere already in the trail must not
    // duplicate it, because parseTrail appends the focus on arrival.
    expect(nodeHref('modi', ['modi', 'CHN'])).toBe('/person/modi?trail=CHN');
  });

  it('encodes the trail, so a junk token cannot truncate the walk', () => {
    expect(nodeHref('IND', ['A#B', 'CHN'])).toBe('/network/IND?trail=A%23B,CHN');
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tests/graph-person.test.ts`
Expected: FAIL — `nodeHref` is not exported from `@/lib/graph/ego`.

- [ ] **Step 3: Implement**

Append to `lib/graph/ego.ts`:

```ts
import { isPersonNode } from '@/lib/graph/build';

/**
 * Where clicking a node goes.
 *
 * The two node kinds live on different routes, and the id alone does not say which — an
 * ISO3 code and a roster id are both just strings. Before the graph was mixed this did not
 * matter, because a person's ego view held only states and the focus itself is not a link.
 * A mixed graph puts clickable people in the picture, and a hardcoded '/network/' prefix
 * would send every one of them to a 404.
 */
export function nodeHref(id: string, trail: string[]): string {
  const base = isPersonNode(id) ? '/person' : '/network';
  return `${base}/${encodeURIComponent(id)}?trail=${nextTrail(trail, id)}`;
}
```

Check for an import cycle: `build.ts` already imports from `ego.ts`? It does not — `ego.ts`
imports only `types`, and `build.ts` imports `types`, `risk` and `data/people`. Adding
`ego.ts` → `build.ts` is therefore safe. If a cycle appears, move `isPersonNode` into
`lib/graph/types.ts` rather than duplicating it.

- [ ] **Step 4: Use it in the component**

`components/NetworkGraph.tsx` — change the import and the link:

```tsx
import { nodeHref, type EgoView } from '@/lib/graph/ego';
```

```tsx
          <Link key={n.id} href={nodeHref(n.id, trail)}>{circle}</Link>
```

`edgeKey` stays imported from `@/lib/graph/build`; only `nextTrail` is replaced.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/graph-person.test.ts && npm test`
Expected: PASS. Run the whole suite — `NetworkGraph` is shared by the state and person pages.

- [ ] **Step 6: Mutation-check**

In `nodeHref`, hardcode the base to `'/network'` and re-run.
Expected: "routes a person to /person and a state to /network" FAILS. Revert.

- [ ] **Step 7: Commit**

```bash
git add lib/graph/ego.ts components/NetworkGraph.tsx tests/graph-person.test.ts
git commit -m "Route a graph node by its type, not by a hardcoded prefix

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Label and shape the two node types

**Files:**
- Modify: `components/NetworkGraph.tsx` (node loop, ~lines 57-84), `lib/graph/ego.ts`
- Test: `tests/graph-person.test.ts` (append)

**Interfaces:**
- Consumes: `BY_PERSON` from `@/data/people`; `isPersonNode` from `@/lib/graph/build`.
- Produces: `nodeLabel(id: string): string` from `@/lib/graph/ego`; `Person.short?: string` in `@/data/people`.

**Why:** node labels render `n.id` verbatim. A state reads `IND`; a person reads `ajit-doval` — a lowercase-hyphen slug, inside a circle of radius 9 to 20 pixels at font-size 11. It overflows, and it is not how the name is written anywhere else in the product.

- [ ] **Step 1: Write the failing test**

```ts
import { nodeLabel } from '@/lib/graph/ego';

describe('nodeLabel', () => {
  it('shows a state as its code and a person by the name outlets print', () => {
    // A slug is not a name. 'ajit-doval' is how the roster keys the record; 'Doval' is what
    // every outlet in the corpus writes, and it is what fits inside a node.
    expect(nodeLabel('IND')).toBe('IND');
    expect(nodeLabel('ajit-doval')).toBe('Doval');
    // Surname-first, so the LAST word is the given name. Labelling him 'Jinping' is the
    // same error as labelling Donald Trump 'Donald', and it breaks for Wang Yi, Li Qiang,
    // Kim Jong Un, Lee Jae-myung, To Lam and Lai Ching-te too — a large share of this
    // roster. No rule can infer the convention from the string, so the roster states it.
    expect(nodeLabel('xi-jinping')).toBe('Xi');
    expect(nodeLabel('wang-yi')).toBe('Wang Yi');
  });

  it('falls back to the id for a node the roster does not know', () => {
    // A hand-built graph in a test, or a stale id in a URL, must render as something rather
    // than as undefined.
    expect(nodeLabel('nobody-here')).toBe('nobody-here');
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tests/graph-person.test.ts`
Expected: FAIL — `nodeLabel` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/graph/ego.ts`:

```ts
import { BY_PERSON } from '@/data/people';

/**
 * What a node says on the picture.
 *
 * States are three characters and fit anywhere. People are not: the id is a slug, and a full
 * display name ("Volodymyr Zelensky") is far wider than a node.
 *
 * There is no rule that shortens a name correctly. "Last word" is right for Doval and
 * Zelensky and WRONG for every surname-first name on the roster — it turns Xi Jinping into
 * "Jinping", which is the same error as calling Donald Trump "Donald", and it breaks Wang
 * Yi, Li Qiang, Kim Jong Un, Lee Jae-myung, To Lam and Lai Ching-te identically. The
 * convention is not recoverable from the string, so the roster carries it: `short` where a
 * shortened form exists, and the full name where none is safe.
 */
export function nodeLabel(id: string): string {
  const person = BY_PERSON.get(id);
  if (!person) return id;
  return person.short ?? person.name;
}
```

Add the field to `data/people.ts`'s `Person` interface:

```ts
  /**
   * How the name is drawn on a graph node, where the full form does not fit.
   *
   * Set it wherever a shortened form is unambiguous and conventional — the family name for
   * a Western name, the family name FIRST for a surname-first name. Omit it and the full
   * name is used, which is always safe and merely wider.
   */
  short?: string;
```

and populate it across the roster: `short: 'Doval'` for Ajit Doval, `short: 'Xi'` for Xi
Jinping, `short: 'Wang Yi'` for Wang Yi (both words — 'Wang' alone collides with nobody on
this roster today but is a very common surname), `short: 'Modi'`, `short: 'Trump'`,
`short: 'Putin'`, and so on. Where you are unsure of the convention, omit it.

- [ ] **Step 4: Draw the two types differently**

In `components/NetworkGraph.tsx`, inside the node loop, choose the shape by type. A person
becomes a rounded rectangle wide enough for its label; a state stays a circle:

```tsx
        const person = isPersonNode(n.id);
        const label = nodeLabel(n.id);
        // ~6.6px per character at font-size 11 in the mono face, plus padding.
        const w = person ? Math.max(2 * n.r, label.length * 6.6 + 14) : 2 * n.r;
        const shape = person ? (
          <rect x={n.x - w / 2} y={n.y - n.r} width={w} height={2 * n.r} rx={n.r}
            fill={isFocus ? 'var(--color-accent)' : 'var(--color-panel)'}
            stroke={isFocus ? 'var(--color-accent)' : 'var(--color-line)'} strokeWidth="1.5" />
        ) : (
          <circle cx={n.x} cy={n.y} r={n.r}
            fill={isFocus ? 'var(--color-accent)' : 'var(--color-panel)'}
            stroke={isFocus ? 'var(--color-accent)' : 'var(--color-line)'} strokeWidth="1.5" />
        );
```

Render `{shape}` where `<circle>` was, and `{label}` where `{n.id}` was in the `<text>`.
Import `isPersonNode` from `@/lib/graph/build` and `nodeLabel` from `@/lib/graph/ego`.

Shape, not colour: a reader must tell a person from a state in **every** palette, including
Monochrome, and colour is the one channel the palette control reassigns.

- [ ] **Step 5: Run the tests and build**

Run: `npm test && npm run build`
Expected: PASS. Stop the dev server before building — they share `.next`, and building
against a live dev server corrupts it with a MODULE_NOT_FOUND on an unrelated route.

- [ ] **Step 6: Look at it**

Start the dev server and open `/person/modi`. Check the labels read as names, nothing
overflows its shape, and people and states are distinguishable at a glance. Then switch the
footer palette to **Monochrome** and confirm they still are — that is the check shape exists
for.

- [ ] **Step 7: Commit**

```bash
git add lib/graph/ego.ts components/NetworkGraph.tsx tests/graph-person.test.ts
git commit -m "Label people by name and draw them as a different shape

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Mix the graph

**Files:**
- Modify: `lib/graph/build.ts` (`personGraph`'s `pairFilter` and docblock)
- Test: `tests/graph-person.test.ts` (invert the bipartite assertions)

**Interfaces:**
- Consumes: `isPersonNode`, `personGraph`.
- Produces: a `personGraph` containing person↔person edges.

- [ ] **Step 1: Invert the existing tests**

Replace the assertion currently named "emits no person-to-person edge even when two are
named", and edit the country one. Keep both — the second is still a real constraint:

```ts
  it('emits a person-to-person edge when two are named in one event', () => {
    // Inverted from the assertion that used to forbid this. The bipartite shape was a
    // consequence of the roster holding twelve names when it was measured; with 120 there
    // are 125 such events and 75 distinct pairs, which is a network rather than an anecdote.
    const graph = personGraph([event({ actors: ['CHN'], people: ['modi', 'wang-yi'] })]);
    const between = graph.edges.filter((e) => isPersonNode(e.a) && isPersonNode(e.b));
    expect(between).toHaveLength(1);
    expect([between[0].a, between[0].b].sort()).toEqual(['modi', 'wang-yi']);
    expect(graph.edges).toHaveLength(3);   // modi-CHN, wang-yi-CHN, modi-wang-yi
  });

  it('still emits no country-to-country edge, so it cannot duplicate the state graph', () => {
    const graph = personGraph([event({ actors: ['IND', 'CHN'], people: ['modi'] })]);
    for (const e of graph.edges) expect(isPersonNode(e.a) || isPersonNode(e.b)).toBe(true);
    expect(graph.edges.map((e) => [e.a, e.b].sort().join('-')).sort())
      .toEqual(['CHN-modi', 'IND-modi']);
  });

  it('has triangles, which is what licenses the two measures Task 5 restores', () => {
    // The person panel dropped Entanglement and conflict clusters BECAUSE a bipartite graph
    // has none. This asserts the premise, so their reinstatement rests on a checked fact
    // rather than on reasoning in a commit message.
    const graph = personGraph([event({ actors: ['CHN'], people: ['modi', 'wang-yi'] })]);
    let triangles = 0;
    for (const n of graph.nodes) {
      const nb = [...(graph.adjacency.get(n)?.keys() ?? [])];
      for (let i = 0; i < nb.length; i++) {
        for (let j = i + 1; j < nb.length; j++) {
          if (graph.adjacency.get(nb[i])?.has(nb[j])) triangles++;
        }
      }
    }
    expect(triangles).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run and verify they fail**

Run: `npx vitest run tests/graph-person.test.ts`
Expected: FAIL on all three — the filter is still bipartite.

- [ ] **Step 3: Change the filter**

`lib/graph/build.ts`, in `personGraph`:

```ts
      // Any pair touching a person. Country-country stays out, so the state graph is not
      // duplicated with weights drawn from a different subset of events. This was `!==`
      // — bipartite — until the roster grew from 12 names to 120 and the measurement that
      // justified it turned out to be stale. See docs/specs/2026-09-06-person-to-person-design.md.
      pairFilter: (a, b) => isPersonNode(a) || isPersonNode(b),
```

Rewrite the `personGraph` docblock: it currently states person↔person is excluded because
the corpus cannot support it, citing "60 of 4,214 articles". Replace with 125 events and 75
pairs, and note that what the corpus still cannot support is the **action**, not the edge.

- [ ] **Step 4: Run and verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Restore `!==` in the filter and re-run.
Expected: the person-to-person and triangle tests FAIL. Revert.

- [ ] **Step 6: Confirm on the live corpus**

Run `npm run ingest`, then check the shape matches what the spec measured — roughly 123
nodes, 508 edges, ~75 of them person↔person, non-zero triangles. A large deviation means the
corpus moved and the spec's figures need re-measuring before continuing.

- [ ] **Step 7: Commit**

```bash
git add lib/graph/build.ts tests/graph-person.test.ts
git commit -m "Let people connect to people, and give up the bipartite invariant

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Carry the place on the edge

**Files:**
- Modify: `lib/graph/types.ts` (`GraphEdge.context`), `lib/graph/build.ts` (`Extracted.context`, accumulation, `personGraph` supplying it)
- Test: `tests/graph-person.test.ts` (append)

**Interfaces:**
- Produces: `GraphEdge.context: string[]` — states of the events behind an edge, most frequent first.

- [ ] **Step 1: Write the failing test**

```ts
describe('edge context', () => {
  it('carries the states of the events behind an edge, most frequent first', () => {
    // "Place as context" is the half of the request the country nodes only imply. In a force
    // layout position is an artefact of the solver, so proximity is not a reading — the edge
    // has to say where it came from.
    const graph = personGraph([
      event({ actors: ['CHN', 'IND'], people: ['modi', 'wang-yi'] }),
      event({ actors: ['CHN'], people: ['modi', 'wang-yi'] }),
    ]);
    const edge = graph.adjacency.get('modi')!.get('wang-yi')!;
    expect(edge.context[0]).toBe('CHN');          // in both events
    expect(edge.context).toContain('IND');        // in one
    expect(edge.context).toHaveLength(2);
  });

  it('accumulates over every contributing event, not only those kept for topEvents', () => {
    // topEvents is capped at topPerEdge (8). Deriving place from it would read a sample of a
    // 28-event tie and present it as the whole, which is the kind of quiet approximation
    // this product exists to avoid.
    const many = Array.from({ length: 12 }, (_, i) =>
      event({ actors: [i === 11 ? 'PAK' : 'CHN'], people: ['modi', 'wang-yi'] }));
    const edge = personGraph(many).adjacency.get('modi')!.get('wang-yi')!;
    expect(edge.context).toContain('PAK');
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npx vitest run tests/graph-person.test.ts`
Expected: FAIL — `context` is not a property of `GraphEdge`.

- [ ] **Step 3: Add the fields**

`lib/graph/types.ts`, in `GraphEdge`:

```ts
  /** States of the events behind this edge, most frequent first. Empty when none was given. */
  context: string[];
```

`lib/graph/build.ts`, in `Extracted`:

```ts
  /** Context to attach to every edge this item produces — for events, the states involved. */
  context?: string[];
```

- [ ] **Step 4: Accumulate it**

In `buildGraph`: add `ctx: new Map<string, number>()` to the initial `raw` record, destructure
`context` from `extract(item)` alongside `participants`, and inside the pair loop after
`cur.n += 1;`:

```ts
        for (const c of context ?? []) cur.ctx.set(c, (cur.ctx.get(c) ?? 0) + 1);
```

Where the `GraphEdge` is constructed:

```ts
      context: [...v.ctx.entries()]
        .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
        .map(([c]) => c),
```

The name tie-break keeps the order deterministic when two states appear equally often.
Without it the output depends on Map insertion order — the defect that made the country
panel's ranks alphabetical.

- [ ] **Step 5: Supply it from personGraph**

In `personGraph`'s extractor add `context: e.actors` beside `friction` and `alignment`.
`stateGraph` supplies none: a country↔country edge's context is its own endpoints, which
would be noise.

- [ ] **Step 6: Run and verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Mutation-check**

Delete the `.sort(...)` from the context construction and re-run.
Expected: "most frequent first" FAILS. Revert.

- [ ] **Step 8: Commit**

```bash
git add lib/graph/types.ts lib/graph/build.ts tests/graph-person.test.ts
git commit -m "Carry the states an edge came from on the edge itself

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Restore the two measures, and show the place

**Files:**
- Modify: `lib/graph/person-panel.ts`, `components/NetworkGraph.tsx` (tooltip)
- Test: `tests/graph-person.test.ts` (edit the row-list assertion)

**Interfaces:**
- Consumes: `clusteringCoefficient`, `conflictClusters` from `@/lib/graph/metrics`; `GraphEdge.context` from Task 4.
- Produces: `personPanel` returning eight rows.

- [ ] **Step 1: Edit the row-list test**

Edit the existing six-row assertion — do not replace it — so it keeps catching a dropped or
reordered row:

```ts
  it('emits eight rows now that the graph has triangles', () => {
    // Entanglement and Conflict cluster were dropped BECAUSE a bipartite graph has none of
    // the triangles they measure. Task 3 gave that up, so both mean something again: for a
    // person, "the officials you are named with are also named with each other" describes a
    // circle rather than restating a tautology.
    const labels = personPanel(personGraph(events()), 'modi', 10).rows.map((r) => r.label);
    expect(labels).toEqual([
      'Connections', 'Cross-border friction', 'Brokerage', 'Contagion exposure',
      'Reach', 'Entanglement', 'Core depth', 'Conflict cluster',
    ]);
  });
```

- [ ] **Step 2: Run and verify it fails**

Run: `npx vitest run tests/graph-person.test.ts`
Expected: FAIL — six rows returned, eight expected.

- [ ] **Step 3: Restore the measures**

In `lib/graph/person-panel.ts` import `clusteringCoefficient` and `conflictClusters`, compute
`const entanglement = clusteringCoefficient(graph, id);` and `const cluster = conflictClusters(graph).get(id);`,
and insert two rows at the positions above:

```ts
    { label: 'Entanglement', value: entanglement.toFixed(2),
      reading: entanglement > 0.5
        ? 'The officials and states this person is named with are largely named with each other too: one connected circle.'
        : 'The officials and states this person is named with are largely not named with each other: separate contexts rather than one circle.' },
```

```ts
    { label: 'Conflict cluster', value: cluster === undefined ? '—' : `#${cluster + 1}`,
      reading: 'Group of nodes most often named with one another. A reporting cluster, not an alliance and not a faction.'
        + (cluster === undefined ? ' This person has no recorded connections, so belongs to none.' : '') },
```

Replace the docblock paragraph explaining why the two were absent with one explaining why
they are back, naming the bipartite change as the cause.

- [ ] **Step 4: Show the place in the tooltip**

`components/NetworkGraph.tsx`, in the node `<title>`, after the strongest-event line:

```tsx
              + (edge.context.length
                  ? `\nSeen in: ${edge.context.slice(0, 3).join(', ')}`
                    + (edge.context.length > 3 ? ` and ${edge.context.length - 3} more` : '')
                  : '')
```

Capped at three with the remainder counted, matching how the neighbour cap is already
disclosed. The spec found one edge picking up six states from four events; the whole list is
noise rather than context.

- [ ] **Step 5: Run the tests and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Mutation-check**

Remove the `Entanglement` row and re-run.
Expected: the eight-row assertion FAILS. Revert.

- [ ] **Step 7: Commit**

```bash
git add lib/graph/person-panel.ts components/NetworkGraph.tsx tests/graph-person.test.ts
git commit -m "Restore the two measures the bipartite graph made meaningless

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Say what an edge is, and is not

**Files:**
- Modify: `app/person/[id]/page.tsx` (caption), `app/methodology/page.tsx` (§8), `README.md`, `STATE.md`, `docs/specs/2026-09-06-person-to-person-design.md` (status line)

**Why its own task:** the copy is the safety mechanism. A line drawn between two named people reads as a relationship in a way a line between two countries does not, and a reader will supply the verb the data lacks. This is the task a reviewer should reject hardest if it is done thinly.

- [ ] **Step 1: The page caption**

Extend the caption below the graph in `app/person/[id]/page.tsx`. In the page's own voice it
must say:

- A line between two people means they were **named in the same clustered event**. It is not
  a meeting, a call, an agreement or a dispute, and the engine cannot tell which.
- The states on an edge are what the reporting was **about**, not where the people were.
- Coverage is the roster: 63 of 120 officials appear at all, so a missing line means "not
  both named in one event", never "no relationship".

- [ ] **Step 2: The methodology section**

Extend §8 ("People in the network") with the example, quoted, because it demonstrates the
constraint far better than asserting it:

> A headline reading *"Zelensky warns airlines Russian skies not safe"* names both Zelensky
> and, in its summary, Putin — so the two appear on one line here. Zelensky warned airlines.
> The two did not speak. That is what a co-mention edge is, and it is why no edge on this
> view carries an action: the verb in a headline usually has a different object than the
> other person named.

- [ ] **Step 3: README and STATE.md**

`README.md`: extend "People in the network" — person-to-person edges exist now, what they
mean, and that they carry no action.

`STATE.md`: add person-to-person to "What is done"; update the roster row if the figures
moved; and correct next-step 3, which says person-to-person is blocked on article text. That
is now true only of the **action labels**, not of the edges.

- [ ] **Step 4: The spec status line**

Change `**Status: design approved 2026-09-06, not yet implemented.**` to record it shipped,
noting any deltas, as the two earlier specs do.

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add app/person/[id]/page.tsx app/methodology/page.tsx README.md STATE.md docs/specs/2026-09-06-person-to-person-design.md
git commit -m "Say plainly that a line between two people is not a meeting

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## After all tasks

Whole-branch review over the merge base, then `superpowers:finishing-a-development-branch`.

Re-measure before declaring it done. All three are corpus-dependent rather than invariants,
and the last is the mistake this whole plan exists to correct:

- The mixed graph is still ~123 nodes / ~508 edges with ~75 person↔person edges.
- Triangle count is still non-zero — two measures depend on it.
- **The person-pair count.** It was 60 articles at 12 roster names and 125 events at 120. If
  the roster changes again this number moves again, and the design's premises move with it.
