/**
 * Pure building blocks for the tour's optional sound: plucked tanpura notes and the text spoken
 * between them. Every tone here is generated from ratios at runtime — no audio file, no
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
 * How loud the music (the plucked notes) sits: silent while the narration speaks, full between
 * chapters. Only half-lowering it left notes cutting across the words.
 */
export function musicLevel(speaking: boolean): number {
  return speaking ? 0 : 1;
}

/**
 * Whether an utterance's end should bring the music back. cancel() on a chapter change makes the old
 * utterance report its end after the new one has started speaking; only the current one may restore.
 */
export function shouldRestoreMusic(endedId: number, currentId: number): boolean {
  return endedId === currentId;
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

/**
 * Female voices a browser may offer, by the name before any "Online (Natural)", "(Premium)" or " - "
 * suffix: Microsoft's neural voices (Edge, Windows), Apple's (Safari, macOS, iOS) and Chrome's online
 * ones. The speech API reports no gender, so a name is the only signal there is; en-IN first.
 */
const FEMALE = new Set([
  'neerja', 'isha', 'veena', 'heera',
  'aria', 'jenny', 'ava', 'emma', 'michelle', 'samantha', 'allison', 'susan', 'zoe', 'nicky', 'zira',
  'sonia', 'libby', 'serena', 'kate', 'stephanie', 'fiona', 'moira', 'karen', 'catherine', 'natasha',
  'tessa', 'victoria', 'clara',
  'google uk english female', 'google us english',
]);

/** Male voices, and Apple's robotic Eloquence and novelty voices — nobody's idea of a live narrator. */
const AVOID = new Set([
  'rishi', 'prabhat', 'ravi', 'daniel', 'alex', 'fred', 'aaron', 'arthur', 'oliver', 'tom', 'guy', 'ryan',
  'david', 'mark', 'george', 'gordon', 'lee', 'ralph', 'albert', 'junior', 'google uk english male',
  'eddy', 'reed', 'rocko', 'grandpa', 'grandma', 'flo', 'sandy', 'shelley', 'kathy',
  'bad news', 'good news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'wobble', 'jester', 'organ',
  'superstar', 'trinoids', 'whisper', 'zarvox',
]);

const baseName = (name: string) =>
  name.replace(/^Microsoft\s+/i, '').split(/\s+(?:Online\b|\(|-)/)[0].trim().toLowerCase();
const langOf = (v: { lang: string }) => (v.lang ?? '').replace('_', '-').toLowerCase();

function score(v: { name: string; lang: string }): number {
  const lang = langOf(v);
  const quality = /\b(natural|neural|premium|enhanced)\b/i.test(v.name) ? 4 : baseName(v.name).startsWith('google ') ? 3 : 0;
  return quality + (lang.startsWith('en-in') ? 2 : lang.startsWith('en-gb') || lang.startsWith('en-us') ? 1 : 0);
}

/**
 * The narrator: the most natural-sounding female English voice this device offers, Indian English among
 * equals. Quality comes first because the voices vary far more in naturalness than in accent — a neural
 * or premium voice sounds like a person, a standard one like a machine. With no known female voice, any
 * English voice not known to be male or robotic, then any English voice at all: a voice beats silence.
 * Never a non-English voice, which would read English captions with the wrong phonetics.
 */
export function pickVoice<T extends { name: string; lang: string }>(voices: readonly T[]): T | null {
  const english = voices.filter((v) => langOf(v).startsWith('en'));
  const indianFirst = (xs: T[]) => xs.find((v) => langOf(v).startsWith('en-in')) ?? xs[0] ?? null;
  const female = english.filter((v) => FEMALE.has(baseName(v.name)));
  if (female.length) return female.reduce((best, v) => (score(v) > score(best) ? v : best));
  return indianFirst(english.filter((v) => !AVOID.has(baseName(v.name)))) ?? indianFirst(english);
}
