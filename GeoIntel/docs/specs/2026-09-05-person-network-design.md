# Person network — officials, the states they move among, and what 408 articles can honestly support

**Status: implemented and merged 2026-09-06.** Where this document and the code disagree,
the code is what runs. Three deltas from the design, all recorded in the build ledger at
`.superpowers/sdd/2026-09-05-person-network/progress.md`:

- A **backfill** (`npm run backfill:people`) was needed and is not described below. `enrich()`
  analyses only newly fetched articles, so 4,203 of 4,713 stored rows would have kept an
  empty `people` array permanently and the graph would have seen 2.6% of the corpus.
- A free **`/person` index** was added. The plan called for a nav link, which would have had
  to hardcode one official — the same defect as the existing `/network/CHN` link.
- The home-state edge is excluded from the friction total **only**, never from the structural
  ranks. An earlier draft of §6 said "every rank"; that was wrong and is corrected below.

Successor to `docs/specs/2026-09-03-network-graph-design.md`, whose first non-goal was
person nodes. This spec is the answer to that non-goal, and it is a narrower answer than the
question implied.

## Purpose

The state network answers *which countries are entangled with which*. It cannot answer *who*.
Actors in this engine are ISO3 codes and always have been, so the "network of people" that
originally prompted the network work has never existed in the product.

This adds a person layer of the only shape the corpus can carry honestly: a **bipartite
person↔country graph**. A person node links to the states they are named alongside. It
answers "which states does this official turn up in the reporting of, beyond their own", and
symmetrically "which outside figures are named in this country's stories".

It does **not** answer "who talks to whom". See the measurement below for why.

## What the corpus actually contains — measure this before building

Every number here was measured on the live corpus on 2026-09-05 (4,214 articles, 2,435
events). Re-measure before starting; if these have moved materially, the design's premises
need re-checking rather than its details.

| | |
|---|---|
| Mean article title | 65 characters |
| Mean snippet | 54 characters, and **3,208 of 4,214 articles have no snippet at all** |
| Article bodies stored | **none** — the schema has no body column |
| Articles naming any senior figure | 408 (9.7%) |
| Articles naming **two or more** figures | **60 (1.4%)** |

The last row is the finding that shaped this spec. Only articles naming two people can
produce a person↔person edge, and 60 articles — before clustering into events, before the
corroboration gate, before 90-day decay — yields a graph of roughly a dozen edges. That is
not a network. For contrast the state graph carries 547 edges from 68 nodes, because nearly
every headline names a country and many name two.

**The blocker is not entity recognition. It is that people are named in article bodies and
this pipeline stores only headlines.** Any future attempt at person↔person must begin by
fetching and storing publisher article text, which is a new ingest capability and lands
squarely in the redistribution and terms-of-service review already at the top of
`STATE.md`'s next steps. It is out of scope here.

The person↔country relation is viable precisely because it needs only one person and one
country in the same headline: 408 articles, and essentially all of them name a state.

## Non-goals

- **Person↔person edges.** ~~Unsupported by the corpus, as measured above.~~
  **SUPERSEDED 2026-09-06** — see `docs/specs/2026-09-06-person-to-person-design.md`.
  That measurement was taken against a twelve-name list before the roster existed. With
  120 officials it is 125 events and 75 pairs, and person↔person is being built.
- **Fetching article bodies.** A separate project with legal prerequisites.
- **Open-domain name extraction.** Rejected deliberately; see Architecture §1.
- **Inferring relationships from text** ("X criticised Y"). Requires bodies and a model in
  the scoring path, both of which this product's stance rules out.
- **Replacing the state network.** This is a second view over the same events.

## Two facts from the existing code that constrain everything below

**Clustering keys on shared actors.** `lib/verify/cluster.ts:129` decides two reports
describe the same event by testing `a.actors.some(x => b.actors.includes(x))`. If people were
merged into `actors`, event clustering would change — and that is the subsystem that spent
all of August being stabilised, that produced a 393-article blob at the percolation
threshold, and that carries regression tests for both blobbing and fragmentation.

**People therefore live in their own field and are never merged into `actors`.** This is the
single most important constraint in this spec. A test asserts it directly.

**`edgeKey` joins participants with `|`.** Task 1's review ruling documented that collision
risk specifically because person identifiers were expected here one day: `'A|B' + 'C'` and
`'A' + 'B|C'` both key to `A|B|C`. Person ids are validated to exclude `|` at the gazetteer,
which is that anticipated constraint finally being used.

## Architecture

### 1. Gazetteer (`data/people.ts`)

Mirrors `data/countries.ts` exactly, because that file's shape is already proven against
this corpus's scripts.

```ts
export interface Person {
  id: string;        // lowercase-hyphen, e.g. 'wang-yi'. MUST NOT contain '|'.
  name: string;      // display form, e.g. 'Wang Yi'
  role: string;      // e.g. 'Foreign Minister'
  home: string;      // ISO3 of the state they serve
  aliases: string[]; // forms outlets actually print, across scripts
}
```

Roster scope: roughly 80–150 figures — heads of state and government, foreign and defence
ministers, and named ministry spokespeople — for the states the corpus actually covers.

Curated rather than model-extracted. Deterministic, auditable, and it keeps `/methodology`'s
standing claim that no score on the site is produced by a model guessing at plausibility.
The cost is upkeep: the roster goes stale as cabinets change, a real recurring burden roughly
doubling what the country gazetteer already carries. Accepted rather than hidden, and stated
on `/methodology`.

### 2. Extraction (`lib/analyze/entities.ts`)

`extractPeople(text): string[]`, beside `extractActors`, reusing the existing `matches()`
helper unchanged — it already handles Latin word boundaries versus CJK/Devanagari substring
matching, which is exactly the problem person aliases pose.

The short-alias hazard is worse for people than for countries: a bare surname like `lai` or
`xi` will fire inside ordinary words. Aliases shorter than four Latin characters must be
either qualified (`'lai ching-te'`) or given a script-specific form only, and a test pins the
known offenders.

### 3. Storage

- `Article` gains `people: string[]`; one new column, one migration.
- `GeoEvent` gains `people: string[]`, aggregated at `lib/verify/cluster.ts:308` alongside
  `actors` — as a sibling, never merged.

### 4. Graph construction (`lib/graph/build.ts`)

`buildGraph` gains one option:

```ts
opts: { topPerEdge?: number; rank?: (item: T) => number;
        pairFilter?: (a: string, b: string) => boolean }
```

applied inside the existing `i`/`j` pairing loop. `personGraph(events)` passes a filter
admitting only person↔country pairs, so the bipartite structure is enforced at construction
and no country↔country edge duplicates the state graph.

Friction stays `impact()`, unchanged, so a person edge and a dyad tension score remain the
same arithmetic over the same events.

### 5. Measures — six of eight survive, and this is not a detail

**A bipartite graph has no triangles.** Two consequences, both load-bearing:

- **Entanglement is dropped.** Clustering coefficient is identically 0 for every node in a
  bipartite graph. Shipping it would print `0.00` beside a sentence about separate fronts for
  every person on the site.
- **Conflict cluster is replaced** by home-state affiliation. Label propagation across a
  person↔country graph groups people *with* countries, which means nothing.

Surviving: Connections, Total friction, Brokerage, Contagion exposure, Reach, Core depth.

**Contagion exposure survives only because of the 2026-09-05 eigenvector fix, and this is a
hard dependency rather than a happy accident.** A bipartite graph is precisely the degenerate
case for power iteration: the spectrum is symmetric, so +λ and −λ have equal magnitude and
the iterate oscillates forever rather than converging. Built against the previous
implementation, every Contagion exposure figure on every person page would have been a
parity-dependent artefact of a hardcoded loop count, wrong with no error and no way to
notice. `tests/graph-metrics.test.ts`'s both-parities assertion is what protects it, and that
test must not be weakened.

Read on a person, the measure means: named alongside states that are themselves embroiled,
rather than merely alongside many states.

### 6. The home-state edge

Each person has exactly one `home`. Without special handling, Modi–IND and Xi–CHN would be
the heaviest edges on the board and would say nothing, because a leader is named beside their
own state in nearly every story about it.

The home edge is therefore **drawn, and excluded from the friction total**: rendered in a
distinct affiliation style so a reader can see whose minister someone is, while the summed
figure is relabelled *Cross-border friction* and leaves it out. Naming the row for what it
measures is what keeps the exclusion legible rather than surprising.

It is **not** excluded from the structural ranks (Brokerage, Contagion exposure, Reach, Core
depth). Those are positions in the real network, and deleting a genuine edge to compute them
would rank people in a graph that does not exist. The distinction is that friction is a
magnitude the home tie would dominate — a leader is named beside their own state constantly —
whereas a single edge barely perturbs a centrality. An earlier draft of this section said
"excluded from every rank"; that was wrong and would have produced structurally false
figures.

### 7. Page (`app/person/[id]/page.tsx`)

Reuses `NetworkGraph`, `radialLayout`, `parseTrail`, `encodeTrail` and the walk unchanged.
Metered on the existing per-walk key, so walking between people and countries costs one
credit for the walk.

`/network/[iso]` gains a people panel in a later pass, making the walk bidirectional.

## Honesty constraints

- The view must state that it rests on 408 articles and is thin. The thin-evidence caveat
  already built for degree ≤ 2 applies unchanged.
- Coverage equals roster coverage. An unlisted official is invisible, and absence must never
  read as absence of involvement. Stated on the page, not only in `/methodology`.
- An edge means **co-mention in a clustered event** — the same reporting relationship the
  state graph carries, and not a claim that a person acted toward a state.
- The roster's staleness is disclosed with the date it was last reviewed.

## Testing

- Alias matching across Latin, CJK, Devanagari and Arabic, including the short-alias
  offenders (`xi`, `lai`) which must not fire inside ordinary words.
- Person ids reject `|`, pinning the `edgeKey` constraint from Task 1.
- `pairFilter` emits no country↔country edge from a mixed participant list.
- Home edge excluded from Cross-border friction, still present in the drawing, and still
  counted in Connections and in the structural ranks.
- Entanglement and conflict cluster absent from the person panel.
- **The clustering guard:** `GeoEvent.actors` is byte-identical for a fixed article fixture
  before and after people are extracted. This is the test that protects August's work.

Every test must be checked against its mutant before it is trusted. Ten review rounds on the
network-graph plan were lost to assertions that survived a one-character change, and every
one of them looked correct while being worthless.

## Known limitations, to surface on `/methodology`

1. **Thin.** 408 of 4,214 articles carry a roster figure. Ranks among fewer than ~30 people
   are weak evidence.
2. **Roster-bounded.** Only listed officials exist. A cabinet change silently degrades
   coverage until the roster is updated.
3. **Headlines only.** People are named in article bodies, which this corpus does not hold.
   The person layer sees only who made the headline.
4. **Co-mention, not interaction.** The graph cannot distinguish an official visiting a state
   from one being condemned by it.
5. ~~**No person↔person edges**, and the measured reason why.~~ **SUPERSEDED 2026-09-06:**
   the reason was a stale measurement. What remains true is that edges carry no ACTION —
   see the successor spec for why the headline verb cannot be trusted to name one.
