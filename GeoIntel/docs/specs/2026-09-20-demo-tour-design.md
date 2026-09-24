# The demo tour — a two-minute, watch-first walkthrough for new visitors

**Status:** Designed with Josh in chat on 2026-09-20 and approved section by section ("approved, write
the specs"). Not built. The order Josh set: build this first, *then* decide free versus billing — so
the tour must work under either answer without being edited (see "Free, billing, and what the tour may
claim").

## Problem

The splash asks a first-time visitor to click Enter and work out for themselves what a dozen-page
product does. The things that make Kautilya worth paying for are *moments* — a Chinese headline being
read in its own language, a reprint folding into the story it copies, thirteen ladder rungs lighting to
the one an official's formula reached — and a static page cannot show them. A visitor who never sees
them has no reason to subscribe. Josh asked for a tutorial/demo, with animations, showing all the
features, reachable from the splash by a new button.

Four constraints from the codebase shape everything below:

- **The site is in a free-preview period** (`QUOTA_ENFORCED = false` in `lib/quota`). Nothing is
  metered and Josh has not decided free versus billing, so the tour cannot state a price, a limit or a
  plan name of its own.
- **The site's voice is anti-hype** ("scored — not asserted as truth"). A sales tour that overclaims
  would contradict the product it sells, and the corpus is the only honest source of examples.
- **Colour and motion are reader choices.** Every drawn colour reads a CSS token so the palette control
  recolours it, and every animation honours `prefers-reduced-motion`. The tour inherits both rules.
- **The splash has hard-won rules** (`app/page.tsx`, `tests/splash.test.ts`): its links are plain `<a>`
  tags, never `<Link>`, and it is a Server Component with no event handlers. The new button follows
  them.

## Decisions

Josh's, on 2026-09-20:

1. **Watch-first guided tour** — not an interactive sandbox, and not a hybrid. A "try it yourself"
   hand-off after a chapter can be added later without redoing the tour.
2. **Live corpus, with a dated fallback.** Each scene takes its example from today's real corpus; if
   today has none that fits, the scene uses a real captured example labelled with its date.
3. **A new route, `/demo`**, chromeless like the splash, opened by a second button on the splash.
4. **The eleven chapters** listed below, with the two changes recorded here: chapter 2 and the closing
   copy, both corrected against the code after approval (see "Corrections found while writing this").

Mine, with the reason:

5. **Scenes are server-rendered, and a small client shell only runs the clock.** `Mandala`,
   `NetworkGraph` and `EventCard` import server-only query code, so they cannot live in a client
   bundle. Passing rendered scenes to a client shell as children is the boundary the framework wants,
   and it means the tour shows the real components rather than a copy that drifts.
6. **The builder is a pure function of injected data**, in the repo's usual pattern: the page gathers
   inputs from the existing queries and passes them in, so tests hand it fixtures.
7. **Every scene says where its example came from** — a badge reading "Live · updated 14 min ago" or
   "Example captured 14 Sep". A tour that hides which examples are real is the failure this product is
   built to avoid.

## Corrections found while writing this

Both were caught by reading the code after the design was approved. Neither changes the approved shape.

- **Chapter 2 does not use the word-by-word English gloss.** The stored `glossed` / `title_en` field is
  a dictionary join, not a translation: 萧美琴 renders as "surname Xiao · the Americas · guqin", and a
  typical headline as "sanctions · the Chinese side". Animating that would sell the feature short and
  oversell its accuracy. What *is* high quality is the pinyin (`lib/lang/pinyin`) and the curated
  ladder-formula meaning (严正交涉 → "makes solemn representations"). Chapter 2 uses those.
- **The preview-period closing cannot say "everything you saw is open".** Ladder alerts go only to a
  reader on the paid plan who has opted in (`alertRecipients()`: `plan = 'pro' AND alerts_enabled = 1`),
  whatever `QUOTA_ENFORCED` says. So the alert scene always carries a "Desk Pro" chip, and the closing
  copy is written per state, below.

## Amendments found while writing the plan

Six things the plan's code-reading corrected. Each is already applied in the text above.

1. Chapter 6's radar is `Radar` in `components/charts.tsx`, not `Mandala` (the ring-of-states view).
2. A thin corpus captures only the six chapters that need a specific case; the others render live or are
   omitted (see "Data layer").
3. One `capturedOn` for the fallback file, not one per entry, and the capture script refuses to write
   an incomplete file.
4. The junk-headline rule also filters the trail chapter's input.
5. The stage is `inert`, and only the closing chapter is interactive.
6. Pinyin appears syllable by syllable, not word by word: `toPinyin` returns space-separated syllables
   and segmenting them into words would be a second, unverified guess.

## Design

### The chapters

Each chapter is `{ id, title, caption, seconds, source }`, about ten seconds, with `source` either
`live` or `{ captured: 'YYYY-MM-DD' }`. "Falls back" means the chapter needs a *specific* kind of case
that a given day's corpus may not hold.

| # | id | What animates | Real component / data | Falls back? |
|---|---|---|---|---|
| 1 | `board` | The world map fills with risk colours; flashpoints pulse faster the hotter they are; the stat numbers count up | `WorldMap`, `hotspotActivity`, `countryRisks`, `CountUp`, `corpusStats` | No |
| 2 | `language` | A Chinese headline appears; its pinyin fades in word by word; the ladder formula in it highlights and resolves to its curated English meaning | `ChineseText`, `lib/lang/pinyin`, the event's `ladderZh` / `ladderEn` | Yes |
| 3 | `event` | Several reports converge into one event; a reprint folds into the story it copies; the confidence meter fills from its named signals. Caption: "scored, not asserted as truth" | `EvidenceFamily`, `ConfidenceMeter`, the event's `signals` | Yes |
| 4 | `ladder` | Thirteen rungs light up to the detected one; then two headlines with the same rung are labelled "Beijing" and "not Beijing" | `LadderGauge`; articles' `ladderSpeaker` | Yes (needs one of each) |
| 5 | `trail` | Dots draw across the 90-day axis by date and by the country the formula was aimed at | `LadderTrail`, `ladderTrailData()`, `RevealOnView` | Yes (needs at least one dot) |
| 6 | `risk` | The six-vector radar scales out from its centre for the highest-scoring country | `Radar` (`components/charts.tsx`), `VECTORS`, `countryRisks` | No |
| 7 | `dyad` | The 90-day tension line draws in and its defining events pop onto it | the dyad timeline of `topDyads()[0]` | Yes (needs at least three defining events) |
| 8 | `network` | Two states connect; a walk crosses an edge and lights it | `NetworkGraph`, `stateGraph`, `egoView` | No (needs one edge) |
| 9 | `ask` | A question types itself; its reading, then the answer, assemble | `AskBox` styling, `answerQuestion` | No |
| 10 | `yours` | The watch star pops; an alert email slides in; an Export (CSV · JSON) control appears; the palette switches to colour-blind-safe and back | `WatchStar`, `renderDigest`, the palette attribute | Alert scene only |
| 11 | `close` | The call to action | `billing()`, `QUOTA_ENFORCED`, `FREE_LIMIT` | No |

Chapters 2, 4 and 5 use the **same event and country where the corpus allows** — one story seen through
three lenses reads as a walkthrough rather than a slideshow. Chapter 3 picks its own event.

**Chapter 4** needs one Beijing-speaker ladder article and one other-party ladder article. That is
Stage 1's attribution (`ladder_speaker`), shown with the same wording an event page already uses
("rung 8 · not Beijing").

**Chapter 9** builds its question from the data: `what is happening between {A} and {B}?` for the top
dyad's two states. That form is the one `tests/ask.test.ts` proves the parser reads, and because the
pair came from the events themselves the answer cannot be empty — a test pins it.

**Chapter 10** has four beats, in this order. The star pops (the existing `star-pop`). The email is the
**real** `renderDigest(jumps, origin)`, given a `Jump` built from real data: the item is the country
Beijing's formula was aimed at, `rung` is the event's rung, and `previous` is the highest rung in that
country's *earlier* trail dots, or 0 if there are none — never an invented earlier rung. `renderDigest`
refuses a loopback origin, so `demoOrigin()` uses the configured origin and falls back to
`https://kautilya.example` when it is unset or loopback. Third, an "Export · CSV · JSON" control fades
in beside it — drawn, not wired: the tour never triggers a real export. Then the palette switches to "accessible" and
back by setting `data-palette` on `<html>` — DOM only, nothing written to `localStorage`, restoring the
reader's own value afterwards, including on pause, hidden tab and unmount. The attribute is the
mechanism the whole site already recolours from, so the scene shows every mark changing at once.

### Data layer

- `lib/demo/script.ts` — `buildDemoScript(input: DemoInput): DemoScript`, pure. `DemoInput` carries the
  events, trail, country risks, hotspots, dyads, stats and the ladder articles, all gathered by the page
  from existing queries.
- `lib/demo/select.ts` — one selector per chapter. Each returns a real example or `null`; the script
  builder substitutes the fallback for `null` and marks that chapter's `source`.
- `data/demo-fallbacks.ts` — captured examples, **generated** by `scripts/demo-capture.ts` (`npm run
  demo:capture`) from the current corpus rather than typed by hand. The entries are captured
  together, so the file carries one `capturedOn` that applies to every entry. Each is self-contained
  (headline, outlet, date, rung, formula — no links into a corpus that will have moved on). The capture
  script refuses to write a file in which any chapter has no real example, so a fallback is never
  fabricated to fill a gap. It always renders the alert digest with `https://kautilya.example`, never the
  configured origin, because the file is tracked and published. Headlines and outlets only, which is what the site already shows.
- **A thin corpus uses captured examples for the six chapters that have them.** Below
  `MIN_LIVE_EVENTS = 20`, the chapters that need a specific case (2, 3, 4, 5, 7 and the alert scene of 10)
  use captured examples and say so. Chapters 1, 6, 8 and 9 have nothing to capture — a map, a radar, a
  network and an answer are the corpus itself — so they render from whatever it holds, and a chapter with
  nothing to show (no risk scores, no edge, no dyad to ask about) is left out of the tour rather than
  animated empty. The chapter list, progress and transcript are all derived from what remains.
- **Selectors must not pick junk.** Chapters 2, 4 and 5 prefer articles marked primary and from the higher-tier outlets (`is_primary` and
  `tier` on the article row; the plan pins the exact rule), and a test
  pins that the 17 Sep 体坛 headline — a casino-style page republishing an August story, documented in
  STATE.md — is never chosen. The same headline rule filters the articles the tour's
  trail chapter is drawn from, so the tour never shows a dot that the rule would refuse to use as an
  example. That makes chapter 5 differ from `/china` by exactly those dots, which is deliberate. This
  guards the tour independently of whatever is decided about denying such outlets at ingest.

### Surface

- `app/demo/page.tsx` — a Server Component, `force-dynamic` like the splash. It builds the script,
  renders each chapter's scene, and passes them to `DemoTour`. Title "Demo".
- `components/demo/DemoTour.tsx` — `'use client'`. Owns the clock, the controls and replay only.
- `lib/demo/clock.ts` — the pure reducer behind it: `{ index, playing, elapsedMs }` with actions `next`,
  `prev`, `goto`, `play`, `pause`, `tick`, `replay`, all clamped to the chapter count.
- `components/demo/scenes/*.tsx` — one Server Component per chapter. Animation is CSS "beats": each
  element takes its delay from a `--beat` custom property, in `.demo-*` keyframes in `globals.css`.
  Continuous motion (pulses, radar draw-in, bar growth, count-up) is the existing components', and it
  fires on mount because a scene is only mounted while it is active.
- **Replay** changes the scene's React `key`, remounting it, which re-fires every existing draw-in and
  count-up without new code.
- `app/layout.tsx` — `isSplash` becomes a "chromeless" check for `/` and `/demo`, so the demo has no nav
  or footer. `middleware.ts` already forwards `x-pathname` on both branches.
- `app/page.tsx` — a second button, "▶ Watch the 2-minute demo", beside "Enter →": a plain
  `<a href="/demo">`, secondary style (outlined), same fade-up stagger, no handler, no `'use client'`.
  "Enter →" stays the primary button.

### Controls and accessibility

- Play/pause, previous, next, eleven chapter buttons named by title (`aria-current="step"` on the
  current one), a per-chapter progress bar, replay, and a close link to `/` that is a plain `<a>`.
- Keys: Space toggles, ←/→ change chapter, Home/End jump, Esc closes.
- **Autoplay starts on load and can always be paused** (WCAG 2.2.2). It also pauses while the tab is
  hidden, which stops the clock running against animations the browser is throttling.
- **Reduced motion:** the tour opens *paused* on chapter 1, every scene renders in its final state with
  no keyframes, and chapters change only by hand. A `@media (prefers-reduced-motion: reduce)` block
  covers every `.demo-*` rule, the same as the rest of `globals.css`.
- **A transcript of every chapter's title and caption is always in the page**, in a `<details>` after the
  stage. Screen-reader users get the whole tour at once instead of a live region announcing every ten
  seconds, and a visitor without JavaScript still gets chapter 1 and the transcript.
- **The stage is inert while an animation plays.** `WorldMap`, `NetworkGraph`, `LadderTrail` and the
  charts render `next/link` markers, and a soft navigation out of a chromeless route carries its hidden
  chrome to wherever it lands (the reason the splash uses plain anchors). Marking the stage `inert` makes
  every such link unclickable and unfocusable, so no tab stop hides inside an animation. The closing
  chapter is the one interactive scene: its buttons are plain `<a>` tags and the stage is not inert
  while it shows. A guard test forbids importing `next/link` anywhere in `components/demo`.
- **Colour uses tokens only.** No hex literal appears in `components/demo/**` — the one exception is the
  splash's existing `#0a0d13` for text on the accent fill, which the new closing button reuses.

### Free, billing, and what the tour may claim

The tour never prints a price, a limit or a plan name of its own. Chips and the closing copy are
derived from the same constants the pricing page reads, so the day Josh flips `QUOTA_ENFORCED` — or
opens billing — the tour changes with it, unedited.

- **Chips.** A chapter that uses a metered action gets a small "Desk" chip **only while
  `QUOTA_ENFORCED` is true**: chapter 3 → `event_detail`; 2, 4 and 5 → `china_deepdive`; 6 →
  `country_deepdive`; 7 → `dyad_analysis`; 8 → `network_graph`; the export chip in 10 → `export`. A
  test asserts every mapped key exists in `METERED`, so a chip can never name a feature that isn't
  there. **The alert scene's "Desk Pro" chip is unconditional**, because alerts are gated on the plan,
  not on the switch.
- **The closing chapter**, by state:

| `QUOTA_ENFORCED` | `billing().mode` | Copy | Buttons |
|---|---|---|---|
| false | `closed` | The board, the event and analysis views, the network and Ask are open while Kautilya is in preview. Email alerts are part of Desk Pro, which is not open yet. | Enter the threat board |
| false | `stripe` / `mock` | Same, ending "Email alerts are part of Desk Pro." | Enter · See plans |
| true | `closed` | `{FREE_LIMIT}` free analyses, then Desk Pro — subscriptions are not open yet. | Enter the threat board |
| true | `stripe` / `mock` | `{FREE_LIMIT}` free analyses, then Desk Pro. | Enter · See plans |

"See plans" appears only where `/pricing` can lead somewhere.

## Testing and verification

**Unit tests, test-first.** The clock reducer (advance on tick, stop at the end, clamp, pause,
`goto`, replay, reduced-motion start). `buildDemoScript` (live example chosen; fallback substituted and
dated when a selector returns `null`; thin corpus makes every chapter captured; ordering stable). Each
selector's rule, including that the 体坛 headline is never chosen. The closing table, all four rows. The
chip mapping against `METERED`. `demoOrigin()` for set, unset and loopback. The alert `Jump`'s
`previous` is the earlier trail rung or 0, never invented.

**Guard tests, in the repo's existing markup/source style.** The splash demo button is an `<a>` with a
genuine `href="/demo"`, no `onClick`, and the page is still not `'use client'`. `/demo` is chromeless.
A reduced-motion block covers `.demo-*`. No hex literals in `components/demo/**` beyond the one allowed.
The chapter-9 question parses to a non-empty answer against a fixture. Every fallback entry has a
`capturedOn` and needs no live id. Every chapter has a title, a caption, `seconds > 0` and a scene, and
the transcript lists all of them.

**Real-browser verification — looking at pixels, not only the DOM.** A production build served from a
scratch copy of the database, watched in **real Chrome** (the built-in pane throttles animation when
hidden, which cost real time on 2026-09-16): all eleven chapters at desktop and at 375 px, keyboard-only
end to end, Esc back to the splash, a run with reduced motion, and the palette scene confirmed to restore
the reader's own choice. Forced-fallback and thin-corpus runs by pointing the page at a fixture
database. Console and server logs clean. **Report what was not seen**, as STATE.md has done for every
prior feature.

## Non-goals

- Interactivity: no hotspots, no sandbox, no "try it" hand-off (additive later).
- Recorded audio or video files. **Superseded 2026-09-22, out of this plan's original scope:**
  optional synthesized sound was added afterward — oscillators built from ratios at runtime and the
  browser's own text-to-speech, still no recorded asset of any kind. See STATE.md's demo-tour section.
- Any price, plan name or limit written into the tour.
- Translating the tour. It is English; the corpus it shows is not.
- Analytics or telemetry on tour views. None exists in the app and none is added.
- A nav link to `/demo`. The splash is its entry point for now.
- Fixing the junk-outlet problem at ingest. Separate decision; the tour only guards itself.

## Risks

- **Payload.** All scenes render on the server up front, so the RSC payload carries eleven scenes,
  including the network graph. Measure it in the production build against `/board`; if it is heavy,
  render only the current and next chapter and stream the rest.
- **Hidden-tab throttling** makes scroll- and visibility-driven animation impossible to watch in the
  built-in pane. Verify in Chrome; the clock pausing on a hidden tab is a feature for the same reason.
- **Fallbacks age.** A captured example labelled "captured 14 Sep" is honest but eventually dull. The
  date is the mitigation, and `npm run demo:capture` is the refresh.
- **Chapter 2 can be starved.** It needs a Beijing formula in a Chinese headline from a decent outlet;
  the live Japan row in STATE.md shows how thin that can be. It falls back rather than lowering the bar.
- **The palette scene touches the live document.** It is DOM-only and restored on every exit path, but a
  crash mid-scene could leave the demo page recoloured until reload. Nothing persists.
- **Eleven chapters in about two minutes is tight** at ten seconds each. Durations are per-chapter data,
  so timing is tuned after watching it, not fixed by this document.

## Addendum 2026-09-24 — twelve chapters, a person step, a female narrator

Chapter numbers above are as first written; from 3 on, each is now one higher.

- **Chapter 3, "One story, told in different languages" (Language Lens), 12 s.** The Lens topic whose
  sharpest framing difference is widest, its two languages side by side (what each search asked, up to
  three framing bars with the differing one marked, the newest usable headline), then the verdict in the
  Lens page's own words (`describeSharpest`, now shared by both). Only a difference `lib/lens/compare`
  already called out qualifies; with none the chapter is left out. It has no capture: a framing gap is a
  claim about today's reporting. No chip — `/lens` is not metered. A headline's English line is the stored
  key terms or the curated Japanese glossary, labelled "Key terms", never the Chinese dictionary join —
  chapter 2's rule.
- **Chapter 9 walks on to an official**, 9 → 12 s. After the state walk, the graph crossfades
  (`demo-leave` out, a Beat in, one grid cell) at 4.5 s to the person graph, one more step: the official
  most often named with the state reached whose own top ten still shows that state. The walked edge inside
  the Beat waits for it (`.demo-beat .edge-traveled`). With no such official the chapter is the old 9 s
  walk with the old caption (`WALK_ONLY`).
- **The narrator is a female voice** chosen by `pickVoice` (`lib/demo/audio.ts`): known female voices by
  name, neural/premium/online quality first, Indian English among equals; male and robotic voices are
  passed over, and a voice still beats silence. Rate 1.0. It is still the browser's own `speechSynthesis`,
  so how natural it sounds depends on the device: Edge's "Natural" voices and Chrome's online ones are good,
  a Mac with only standard voices gets Samantha.

The tour now runs about 2:07.
