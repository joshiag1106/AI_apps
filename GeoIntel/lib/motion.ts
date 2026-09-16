/**
 * Turns a data value into an animation-duration in seconds. Kept as pure functions,
 * separate from the SVG that draws them, so the mapping from data to motion can be
 * tested without rendering anything.
 */

/** World-map flashpoint markers: a hotter (0-100) flashpoint pulses faster. */
export function hotspotPulseDuration(heat: number): number {
  const t = Math.max(0, Math.min(100, heat)) / 100;
  return +(3.2 - t * 1.9).toFixed(2);
}

/** Mandala nodes in the severe tier (score >= 70): the more severe, the faster. */
export function severityPulseDuration(score: number): number {
  const t = Math.max(0, Math.min(30, score - 70)) / 30;
  return +(2.2 - t * 0.9).toFixed(2);
}
