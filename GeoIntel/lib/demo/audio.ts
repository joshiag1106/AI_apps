/**
 * Pure building blocks for the tour's optional sound: a synthesized tanpura-style drone and the
 * text spoken over it. Every tone here is generated from ratios at runtime — no audio file, no
 * sample, nothing fetched or embedded — so nothing in this feature can carry a copyright claim.
 * The oscillator scheduling and speechSynthesis calls live in components/demo/DemoAudio.tsx, which
 * is the only place that touches the AudioContext or speech APIs; this file has no browser
 * dependency, so it tests the same way lib/demo/clock.ts and lib/demo/stage.ts do.
 */

/**
 * Just-intonation ratios for Bhairavi, a raga sung at stillness rather than performed loud — the
 * register the tour asks for. A scale is a set of ratios, not a recorded performance of one, so
 * naming it here carries no licensing weight.
 */
export const BHAIRAVI_RATIOS = [1, 16 / 15, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 9 / 5] as const;

export function raga(rootHz: number): number[] {
  return BHAIRAVI_RATIOS.map((r) => rootHz * r);
}

/**
 * A tanpura's four strings, tuned Pa-Sa-Sa-Sa (or Ma-Sa-Sa-Sa) — here the fifth below the root, the
 * root itself twice, and the root's octave. Returned low-to-high as the ear hears the chord, not in
 * string-plucking order.
 */
export function droneTones(rootHz: number): number[] {
  return [rootHz / 2, (rootHz * 3) / 2, rootHz, rootHz * 2];
}

/**
 * A short, fixed phrase over raga() — Sa Ga Pa Dha Pa Ga Sa, indices into its 7 notes. Fixed rather
 * than randomised so the tour sounds the same on every visit and stays testable; symmetric so it
 * rises and settles back rather than wandering off.
 */
export const PLUCK_PATTERN = [0, 2, 4, 5, 4, 2, 0] as const;

/** What is spoken for a chapter: the title as a first sentence, then the caption already approved
 * for on-screen use — no separate script to keep in sync, and nothing said that is not also shown. */
export function narrationFor(chapter: { title: string; caption: string }): string {
  const title = chapter.title.trim();
  const caption = chapter.caption.trim();
  return caption ? `${title}. ${caption}` : title;
}
