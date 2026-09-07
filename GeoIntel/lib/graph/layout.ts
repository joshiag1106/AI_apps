import type { EgoView } from '@/lib/graph/ego';

/**
 * Where to draw an ego view, by ForceAtlas2.
 *
 * The force model is Jacomy et al. (2014), the layout Gephi uses: nodes repel each other in
 * proportion to their masses, edges pull their endpoints together in proportion to weight,
 * and a gravity term keeps loosely-attached nodes from drifting off the canvas. What it buys
 * over the ring it replaces is structure — states that fight each other as well as the focus
 * settle into the same region, so a glance shows whether a neighbourhood is one entangled
 * theatre or several separate fronts. On a ring that was present only in the crossing lines
 * and was very hard to read.
 *
 * DETERMINISM IS A REQUIREMENT HERE, not a nicety, and this implementation has no random
 * element anywhere. ForceAtlas2 normally seeds from random positions, which would make the
 * picture differ between page loads, defeat regression testing, and make two screenshots of
 * the same corpus incomparable. Instead the simulation is seeded from the ring the previous
 * layout drew — strongest neighbour at twelve o'clock, then clockwise — and run for a fixed
 * number of steps with a fixed cooling schedule. Identical input gives byte-identical
 * output, which the tests assert directly.
 *
 * What the change cost, recorded because it was a real property and not an accident: on the
 * ring, ANGLE encoded rank — twelve o'clock was always the strongest tie. No force layout
 * can preserve that, because position is an artefact of the solver. Rank is now carried by
 * node radius and edge thickness alone. The seeding starts the strongest tie at the top so
 * it tends to finish near there, but that is a tendency, not a contract, and nothing should
 * be read into an angle on this picture.
 */

export interface Placed { id: string; x: number; y: number; r: number }

const FOCUS_R = 26;
const MIN_R = 9;
const MAX_R = 20;
const PADDING = 26;

/** Force-model constants, named rather than inlined so a tuning session has knobs. */
const ITERATIONS = 220;
const REPULSION = 1.2;
/** Pulls loosely-attached nodes back toward the middle so nothing escapes the frame. */
const GRAVITY = 0.06;
/** Global step size, decayed over the run so the layout settles instead of jittering. */
const SPEED = 0.55;
/** Guards every division by a distance, so two coincident nodes cannot produce Infinity. */
const MIN_DIST = 0.01;

export function radialLayout(view: EgoView, size = 520): { nodes: Placed[]; size: number } {
  if (!view.neighbours.length) return { nodes: [], size };

  const c = size / 2;
  const ring = c - PADDING - MAX_R;

  // Friction per neighbour, which sets both the node radius and the edge pull.
  const weightOf = new Map<string, number>();
  for (const n of view.neighbours) {
    const e = view.edges.find((x) => (x.a === view.focus && x.b === n) || (x.b === view.focus && x.a === n));
    weightOf.set(n, e?.friction ?? 0);
  }
  const maxWeight = Math.max(...weightOf.values(), 1);

  // Seed: the ring this used to draw outright. A deterministic, well-spread starting state
  // costs nothing and removes the only source of randomness ForceAtlas2 would otherwise have.
  const ids = [view.focus, ...view.neighbours];
  const pos = new Map<string, { x: number; y: number }>([[view.focus, { x: c, y: c }]]);
  view.neighbours.forEach((n, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / view.neighbours.length;
    pos.set(n, { x: c + ring * Math.cos(angle), y: c + ring * Math.sin(angle) });
  });

  // Mass is degree within the drawn view, the standard FA2 choice: a node holding the
  // neighbourhood together pushes harder than one hanging off its edge.
  const mass = new Map<string, number>(ids.map((id) => [id, 1]));
  for (const e of view.edges) {
    if (mass.has(e.a)) mass.set(e.a, mass.get(e.a)! + 1);
    if (mass.has(e.b)) mass.set(e.b, mass.get(e.b)! + 1);
  }

  const scale = ring / 2;
  for (let step = 0; step < ITERATIONS; step++) {
    const fx = new Map<string, number>(ids.map((id) => [id, 0]));
    const fy = new Map<string, number>(ids.map((id) => [id, 0]));

    // Repulsion between every pair, proportional to the product of masses.
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos.get(ids[i])!;
        const b = pos.get(ids[j])!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d = Math.hypot(dx, dy);
        if (d < MIN_DIST) {
          // Coincident nodes have no direction to separate along. Nudge them apart on an
          // axis derived from their index order, so even the escape stays deterministic.
          dx = (i - j) * MIN_DIST;
          dy = MIN_DIST;
          d = Math.hypot(dx, dy);
        }
        const f = (REPULSION * mass.get(ids[i])! * mass.get(ids[j])! * scale) / d;
        const ux = (dx / d) * f;
        const uy = (dy / d) * f;
        fx.set(ids[i], fx.get(ids[i])! + ux); fy.set(ids[i], fy.get(ids[i])! + uy);
        fx.set(ids[j], fx.get(ids[j])! - ux); fy.set(ids[j], fy.get(ids[j])! - uy);
      }
    }

    // Attraction along edges, linear in distance and scaled by normalised friction, so a
    // high-friction pair settles closer than a pair that merely co-occurred once.
    for (const e of view.edges) {
      const a = pos.get(e.a);
      const b = pos.get(e.b);
      if (!a || !b) continue;
      const w = 0.15 + 0.85 * (e.friction / maxWeight);
      const ux = (a.x - b.x) * w;
      const uy = (a.y - b.y) * w;
      fx.set(e.a, fx.get(e.a)! - ux); fy.set(e.a, fy.get(e.a)! - uy);
      fx.set(e.b, fx.get(e.b)! + ux); fy.set(e.b, fy.get(e.b)! + uy);
    }

    // Gravity toward the centre. The focus is pinned there and takes no forces at all — a
    // deliberate departure from stock FA2, because this is an EGO view and a reader walking
    // from CHN to USA should find the new focus where the old one was, not wherever the
    // solver decided to put it.
    for (const id of ids) {
      if (id === view.focus) continue;
      const p = pos.get(id)!;
      fx.set(id, fx.get(id)! - GRAVITY * mass.get(id)! * (p.x - c));
      fy.set(id, fy.get(id)! - GRAVITY * mass.get(id)! * (p.y - c));
    }

    // Cooling schedule: large early steps to untangle, small late steps to settle.
    const cooling = SPEED * (1 - step / ITERATIONS);
    for (const id of ids) {
      if (id === view.focus) continue;
      const p = pos.get(id)!;
      const m = mass.get(id)!;
      // Damping by mass keeps a heavy hub from overshooting on a large early step.
      p.x += (fx.get(id)! / m) * cooling * 0.01;
      p.y += (fy.get(id)! / m) * cooling * 0.01;
    }
  }

  // Fit whatever the solver produced back inside the canvas. The force constants set a scale
  // only loosely, so this rescale is what actually guarantees nothing leaves the frame, and
  // it is uniform about the centre so the relative geometry — the part carrying meaning — is
  // preserved exactly.
  const usable = c - PADDING - MAX_R;
  let extent = 0;
  for (const id of ids) {
    const p = pos.get(id)!;
    extent = Math.max(extent, Math.hypot(p.x - c, p.y - c));
  }
  const fit = extent > usable ? usable / extent : 1;

  const nodes: Placed[] = [{ id: view.focus, x: c, y: c, r: FOCUS_R }];
  for (const n of view.neighbours) {
    const p = pos.get(n)!;
    nodes.push({
      id: n,
      x: c + (p.x - c) * fit,
      y: c + (p.y - c) * fit,
      r: MIN_R + (MAX_R - MIN_R) * (weightOf.get(n)! / maxWeight),
    });
  }

  return { nodes, size };
}
