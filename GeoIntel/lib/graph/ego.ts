import type { Graph, GraphEdge } from '@/lib/graph/types';
import { isPersonNode } from '@/lib/graph/build';
import { BY_PERSON } from '@/data/people';
import { BY_ISO } from '@/data/countries';

/**
 * One state and its strongest connections.
 *
 * The cap is the reason this module exists. The corpus graph has a node of degree 59 out
 * of a possible 65, so an uncapped neighbourhood is very nearly the whole network and the
 * drilldown shows a hairball on its first click. Capping keeps every step legible, and
 * `hidden` keeps the omission honest rather than silent.
 *
 * Depth is always one. Walking to a neighbour is what moves you outward; a depth
 * parameter would be a second way to do the same thing that reintroduces exactly the
 * saturation the cap exists to prevent.
 */

export const DEFAULT_TOP_N = 10;
const MAX_TRAIL = 24;

export interface EgoView {
  focus: string;
  /** Strongest first. */
  neighbours: string[];
  /** Spokes from the focus plus edges among the visible neighbours. */
  edges: GraphEdge[];
  /** Neighbours omitted by the cap. Shown in the UI; never silently dropped. */
  hidden: number;
}

export function egoView(g: Graph<unknown>, focus: string, topN = DEFAULT_TOP_N): EgoView {
  const adj = g.adjacency.get(focus);
  if (!adj) return { focus, neighbours: [], edges: [], hidden: 0 };

  const ranked = [...adj.entries()]
    .sort(([an, ae], [bn, be]) => (be.friction - ae.friction) || (an < bn ? -1 : 1))
    .map(([n]) => n);

  const neighbours = ranked.slice(0, topN);
  const edges: GraphEdge[] = [];

  for (const n of neighbours) edges.push(adj.get(n)!);
  // Edges among neighbours, without which a reported clustering coefficient is invisible.
  // Both indices come from `neighbours`, so membership needs no test — a `visible` Set
  // built from that same array used to be consulted here, and neither lookup could ever
  // return false. It read as the guard keeping hidden neighbours out; the slice above is
  // what actually does that, and the test in tests/graph-ego.test.ts pins it by counting
  // the edges rather than re-deriving the property from the array they were built from.
  for (let i = 0; i < neighbours.length; i++) {
    for (let j = i + 1; j < neighbours.length; j++) {
      const e = g.adjacency.get(neighbours[i])?.get(neighbours[j]);
      if (e) edges.push(e);
    }
  }

  return { focus, neighbours, edges, hidden: Math.max(0, ranked.length - neighbours.length) };
}

/**
 * The breadcrumb of a walk, taken from the URL and therefore untrusted: it is whatever
 * someone typed. Repeats collapse so a cycle cannot grow without bound, and the whole
 * thing is capped for the same reason.
 */
export function parseTrail(raw: string | undefined, focus: string): string[] {
  const seen = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .filter((s) => s !== focus.toUpperCase());

  const deduped: string[] = [];
  for (const s of seen) if (!deduped.includes(s)) deduped.push(s);

  // Keep the most recent steps: where you have just been matters more than where you began.
  const kept = deduped.slice(-(MAX_TRAIL - 1));
  return [...kept, focus.toUpperCase()];
}

/**
 * The trail to hand the next page, given where you are and where you are going.
 *
 * parseTrail's inverse — and that direction matters. parseTrail always appends the
 * current focus as the trail's LAST token, so by the time a page renders its links,
 * `trail` already ends with the state the user is standing on right now. `to` (the
 * state being walked to) becomes the *next* page's focus, and parseTrail will append it
 * there; appending it here too duplicated it, which is exactly the bug this function was
 * extracted to fix: every generated link on the page read like `?trail=CHN,CHN`. If `to`
 * already appears earlier in `trail` (walking back to a state already visited), it is
 * dropped from that earlier position — parseTrail's own focus-filter would also catch a
 * stray duplicate on arrival, but doing it here keeps the URL itself clean, which is the
 * whole point of a walk being a shareable link. Do not re-add `to` after this filter.
 */
export function nextTrail(trail: string[], to: string): string {
  const target = to.toUpperCase();
  return encodeTrail(trail.filter((t) => t.toUpperCase() !== target));
}

/**
 * A trail as a query-string value.
 *
 * The one place trail tokens become a URL. parseTrail sanitises shape — case, blanks,
 * repeats, length — but it deliberately does not judge what a token means, so a token can
 * still be any string somebody typed. Interpolating that raw is what breaks the walk:
 * `?trail=IND%26n=1` arrives as the single token `IND&N=1`, and re-emitting it unencoded
 * produces `?trail=IND&N=1,CHN`, so the next page reads a trail of just `IND` and silently
 * loses the rest. A `#` truncates at the fragment the same way.
 *
 * Each token is encoded individually and joined with a literal comma, rather than encoding
 * the joined string, so an ordinary walk stays readable as `?trail=CHN,USA` — a URL people
 * are meant to paste to each other — while anything unusual inside a token is neutralised.
 */
export function encodeTrail(tokens: string[]): string {
  return tokens.map(encodeURIComponent).join(',');
}

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

/**
 * A trail token as the node it names.
 *
 * parseTrail UPPERCASES every token — it sanitises shape without judging meaning, and ISO3
 * codes are uppercase — but roster ids are lowercase, so a person arrives as 'AJIT-DOVAL'
 * and every BY_PERSON lookup against it misses. The walk breadcrumb then printed the slug
 * where the name belongs and linked it to /network/AJIT-DOVAL, a 404: exactly the two
 * defects nodeHref and nodeLabel fix for graph nodes, in the breadcrumb instead of the
 * picture. Latent while the graph was bipartite, because no walk could pass through two
 * people; live the moment it was mixed.
 *
 * An unknown token comes back unchanged rather than lowercased, since nothing knows better
 * what case it should have been.
 */
export function trailNode(token: string): { id: string; person: boolean } {
  const lower = token.toLowerCase();
  return isPersonNode(lower) ? { id: lower, person: true } : { id: token, person: false };
}

/**
 * Whether a trail token names a node that exists — a tracked state or a rostered person.
 *
 * parseTrail deliberately does not judge meaning, so a token is whatever somebody typed.
 * Both walk pages drop the ones naming nothing, to keep junk out of the breadcrumb and out
 * of the links it generates.
 *
 * It lives here, shared, because carrying it inline in each page is what produced the bug
 * trailNode fixes: /person had it right (lowercasing before the roster lookup) and /network
 * tested states ONLY, so a walk crossing both kinds was 404-linked on one page and silently
 * truncated on the other. One definition, two callers.
 */
export function isKnownNode(token: string): boolean {
  return BY_ISO.has(token) || isPersonNode(token.toLowerCase());
}

/** Advance width per character at font-size 11 in the mono face, plus horizontal padding. */
const CHAR_W = 6.6;
const BOX_PAD = 14;
/** Widest a person node may be drawn. Beyond this the name is ellipsised instead. */
const MAX_BOX_W = 160;
/**
 * Narrowest a person node may be, as a multiple of its height.
 *
 * Not cosmetic. The box is drawn with rx = r, so at w = 2r it is an EXACT CIRCLE — visually
 * identical to a state node, which is the one thing the shape is carrying. 'Doval' on a
 * 26px-radius node rendered 52x52 at rx 26 in the live page and could not be told from a
 * country. Since colour is what the palette control reassigns, shape is the only channel
 * left to say what kind of node this is, so it has to hold for every label length.
 */
const MIN_ASPECT = 1.45;

/**
 * Where to draw a person node, and what it can actually say there.
 *
 * A person is a rounded rectangle rather than a circle, so unlike every other node its width
 * comes from its LABEL. radialLayout does not know that: it positions nodes knowing only a
 * radius of at most MAX_R (20), so it reserves at most 40px for something that can want far
 * more. That gap is a real defect, not a rounding error — 'Mohammed bin Abdulrahman Al Thani'
 * wants 232px, and centred at the ring's extreme x of 474 its right edge lands at 590 in a
 * 520-wide canvas, drawn straight off the picture.
 *
 * Two guards, because they fix different halves:
 *
 * - The width is CAPPED and the name ellipsised past it, so one node cannot span half the
 *   canvas. The untruncated name still reaches the reader through the node's tooltip.
 * - The centre is CLAMPED so the box cannot leave the canvas at either edge. A node that
 *   already fits is left exactly where the layout put it; only an overflowing one moves, and
 *   moving it is strictly better than drawing it where it cannot be seen.
 *
 * Neither guard prevents two wide boxes overlapping each other. That needs a label-aware
 * layout, which is a much larger change than this defect warrants.
 */
export function personBox(label: string, r: number, x: number, size: number): {
  w: number; cx: number; label: string;
} {
  let text = label;
  let w = Math.max(2 * r * MIN_ASPECT, text.length * CHAR_W + BOX_PAD);

  if (w > MAX_BOX_W) {
    const fits = Math.max(1, Math.floor((MAX_BOX_W - BOX_PAD) / CHAR_W) - 1);
    text = `${label.slice(0, fits)}…`;
    w = Math.max(2 * r * MIN_ASPECT, text.length * CHAR_W + BOX_PAD);
  }

  // Half a box may still exceed the canvas on a very small viewBox; clamp to the centre
  // rather than producing a negative left edge.
  const half = w / 2;
  const cx = half * 2 >= size ? size / 2 : Math.min(Math.max(x, half), size - half);
  return { w, cx, label: text };
}
