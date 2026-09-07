# Person-to-person edges — who appears with whom, and where

**Status: SHIPPED 2026-09-06.** Built as specified, on branch `person-to-person`. Three
deltas, all recorded rather than quietly absorbed:

1. **Figures moved with the corpus, as this spec said they would.** Re-measured after a fresh
   ingest: 124 nodes / 527 edges, 73 person↔person, 1,737 triangles, 128 events naming two or
   more officials, 73 distinct pairs, Doval–Wang Yi at 29. Every premise held and nothing
   needed redesigning. The numbers below are the originals, left as measured on the day.
2. **A defect the plan did not anticipate, of the class Tasks 1 and 2 exist to prevent.**
   `parseTrail` uppercases every token and roster ids are lowercase, so the walk breadcrumb on
   `/person/[id]` printed `AJIT-DOVAL` and linked it to `/network/AJIT-DOVAL` — a verified
   404. Latent while the graph was bipartite, because no walk could pass through two people;
   live the moment it was mixed. Fixed with `trailNode` in `lib/graph/ego.ts`, beside
   `nodeHref` and `nodeLabel`, which fix the same two defects for graph nodes.
3. **One test had to be written twice.** The context-ordering assertion fed its states in an
   order that already matched their frequency, so insertion order and sorted order agreed and
   it passed with the sort deleted — it read as pinning the ranking and pinned only that the
   field was populated. The fixture now makes the two orders disagree.

**Known and NOT fixed:** `/network/[iso]` filters its trail to `BY_ISO`, so walking from a
person out to a state silently drops the person from the breadcrumb — a mixed walk loses its
history on the state side. Pre-existing, and harmless to billing (the walk still costs one
credit; only the origin label changes), but it contradicts this product's rule against
dropping anything silently.

Amends `docs/specs/2026-09-05-person-network-design.md`, whose first non-goal was
person↔person edges. That non-goal was **measured wrong**, and this document exists mostly
to correct it.

## Why the earlier answer was wrong

The 2026-09-05 spec ruled person↔person out on the grounds that only ~1% of articles name
two figures — "a dozen edges after clustering and decay, which is an anecdote rather than a
network". That number came from a probe against a **twelve-name** list, taken before the
roster existed. The roster is now 120 officials, and the measurement was never redone.

Re-measured 2026-09-06 against the live corpus:

| | |
|---|---|
| Events naming 2+ roster people | **125** |
| Distinct person-pairs | **75** |
| Events naming 3+ | 26 |
| Two-person events carrying a state actor | **125 of 125** |
| Two-person events also carrying a hotspot | 19 |

The pairs are not noise. Ranked by frequency: Doval–Wang Yi ×28 (the India–China border
talks), Trump–Xi ×15, Putin–Xi ×13, Kushner–Witkoff ×6, Putin–Zelensky ×5. That is a
network, and the earlier spec was wrong to rule it out.

**The lesson worth keeping: a measurement is scoped to the inputs it was taken with.** The
1% figure was correct for a twelve-name roster and wrong for a hundred-and-twenty-name one,
and nothing in the codebase knew the difference.

## What this does NOT do, and why

**No action labels on edges.** The original request was person-to-person *with the action* —
"X met Y", "X criticised Y". The corpus cannot support it, and this is a firmer no than the
edge count ever was. Verbs are present in headlines, but **their object is frequently a third
party or a thing**:

- *"Zelensky warns airlines Russian skies not safe"* — pairs Putin↔Zelensky. Zelensky warned
  airlines. The two did not interact.
- *"Netanyahu condemns settler attack in West Bank village"* — pairs Netanyahu↔Trump. Trump
  is nowhere in the action.
- *"Gaza refugee says sister-in-law would be alive if Home Office had let her come"* — pairs
  Trump, Katz and Netanyahu. None acted on any other.

Labelling those edges from the headline verb would have the product asserting *Zelensky
warned Putin*. That is not a thin signal; it is a confidently wrong one, in a product whose
entire position is corroboration over assertion. Resolving a verb to its object needs the
sentence, which needs article bodies — the same blocker as ever, and still gated behind the
redistribution review at `STATE.md` item 1.

Edges therefore carry the semantics the country graph already uses: **named in the same
clustered event**. Nothing more is claimed.

## Architecture

### 1. One mixed graph

`personGraph`'s pair filter changes from

```ts
pairFilter: (a, b) => isPersonNode(a) !== isPersonNode(b)   // bipartite
```

to

```ts
pairFilter: (a, b) => isPersonNode(a) || isPersonNode(b)    // any pair touching a person
```

Country↔country pairs stay excluded, so the state graph is still not duplicated with weights
drawn from a different subset of events.

Measured result: **123 nodes, 508 edges** — 75 person↔person and 433 person↔country.

### 2. The bipartite invariant is deliberately given up

This is the substantive cost and it must not be discovered later. The person layer shipped
bipartite, and `lib/graph/person-panel.ts` drops Entanglement and conflict clusters *because*
a bipartite graph has no triangles. That premise no longer holds: the mixed graph has
**1,659 triangles**.

So both measures come back, and for a person they now read usefully — *the officials you are
named with are also named with each other*, which is a real finding about a diplomatic
circle rather than a tautology. The docblock in `person-panel.ts` explaining their absence is
replaced by one explaining their return, and `tests/graph-person.test.ts`'s bipartite
assertions are **inverted rather than deleted**: no country↔country edge may exist, and
person↔person edges must.

### 3. Place on the edge

`Extracted` gains an optional field:

```ts
export interface Extracted {
  participants: string[];
  friction: number;
  alignment: number;
  /** States the contributing events took place in. Accumulated per edge as a set. */
  context?: string[];
}
```

`buildGraph` accumulates it per edge alongside friction, and `GraphEdge` gains
`context: string[]`.

Accumulated rather than derived from `topEvents`, deliberately: `topEvents` is capped at
`topPerEdge` (8), so for the 28-event Doval–Wang Yi tie a derived list would be read off a
sample and presented as the whole. The accumulation is exact.

**Displayed ranked by frequency and capped at three.** The probe found
`howard-lutnick–trump` picking up six states from four events; an uncapped list is noise
rather than context. The count of omitted states is shown, matching how the neighbour cap is
already disclosed.

### 4. Rendering

`components/NetworkGraph.tsx` needs no structural change — it draws whatever edges it is
given. Person↔person edges are distinguished from person↔country ones by **stroke weight and
node shape, not by colour**: colour now belongs to the palette system, and a hard-coded hue
would be the one thing on the page that ignores a reader's accessibility choice.

The node tooltip already names the strongest event behind an edge. It gains the edge's place
list.

## Honesty constraints

- The caption must say **co-mention, not interaction**, and say it more loudly than the
  country graph does. A line drawn between two named people reads as a relationship in a way
  a line between two countries does not, and readers will supply the verb the data lacks.
- The `"Zelensky warns airlines"` example belongs on `/methodology` verbatim. It is the
  clearest available demonstration that an edge is not an interaction, and far more
  convincing than a paragraph asserting the same thing.
- Coverage remains roster-bounded: 63 of 120 officials appear at all, so a missing edge means
  "not both named in one event", never "no relationship".
- 125 events is thin beside the state graph's 2,793. The thin-evidence caveat already built
  for low-degree nodes applies unchanged.

## Testing

- `pairFilter` admits person↔person and person↔country, and rejects country↔country.
- Person↔person edges exist in the built graph (the inverted bipartite assertion).
- Triangle count is non-zero — this is what licenses reinstating Entanglement and conflict
  clusters, so it is pinned rather than assumed.
- `context` on an edge equals the union of its contributing events' actors, and the rendered
  form is capped at three with the remainder counted.
- `personPanel` emits eight rows in this exact order, the two returning measures taking the
  positions they hold on the country panel so the two views read alike:

  `Connections`, `Cross-border friction`, `Brokerage`, `Contagion exposure`, `Reach`,
  `Entanglement`, `Core depth`, `Conflict cluster`

  The current test pins the six-row list; it is edited to this, not replaced, so the
  assertion keeps catching a silently dropped or reordered row.
- The state graph is unchanged in node and edge count by any of this.

Every test is checked against its mutant before being trusted. The network-graph plan lost
ten review rounds to assertions that survived a one-character change, and the person-network
plan lost one more to a fixture that could not reach the branch it named.

## Known limitations, to surface on `/methodology`

1. **Co-mention, not interaction.** With the Zelensky example quoted.
2. **No action, and no prospect of one** without article bodies.
3. **Roster-bounded**, as the whole person layer is.
4. **Thin**: 125 events, 75 pairs.
5. **Place is where the reporting was about, not where the people were.** Two officials named
   in a story about the South China Sea need not have been anywhere near it.
