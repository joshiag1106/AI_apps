// tests/demo-audio.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BHAIRAVI_RATIOS, PLUCK_PATTERN, musicLevel, narrationFor, pickVoice, raga, shouldRestoreMusic } from '@/lib/demo/audio';

const audioSource = readFileSync('lib/demo/audio.ts', 'utf8');
const componentSource = readFileSync('components/demo/DemoAudio.tsx', 'utf8');
const bothSources = audioSource + '\n' + componentSource;

describe('raga', () => {
  it('scales every Bhairavi ratio by the root, in ascending order', () => {
    const notes = raga(200);
    expect(notes).toHaveLength(7);
    expect(notes[0]).toBe(200);
    for (let i = 1; i < notes.length; i++) expect(notes[i]).toBeGreaterThan(notes[i - 1]);
    // mutation guard: pins the exact ratios, not just their shape
    BHAIRAVI_RATIOS.forEach((ratio, i) => expect(notes[i]).toBeCloseTo(200 * ratio, 9));
  });

  it('is silent about no root: 0 in, all zeros out, never NaN or negative', () => {
    expect(raga(0)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

// Josh, 2026-09-24: "unwanted hum with the narration", then "remove the drone sound also, keep only
// tanpura sound". The sustained sine drone is gone; only the plucked notes remain.
describe('no sustained drone', () => {
  it('makes only plucked notes: one oscillator in the component, and it is stopped on a schedule', () => {
    expect(componentSource.match(/createOscillator\(\)/g)).toHaveLength(1);
    expect(componentSource).toMatch(/osc\.stop\(now \+ \d/);
    expect(bothSources).not.toMatch(/droneTones|droneGain/);
  });
});

describe('the voice comes first', () => {
  it('silences the music completely while the narration speaks, and brings it back after', () => {
    expect(musicLevel(true)).toBe(0);
    expect(musicLevel(false)).toBeGreaterThan(0);
  });

  // speechSynthesis.cancel() on a chapter change makes the OLD utterance report its end after the new
  // one has started; restoring on that would bring the music back up under the new voice.
  it('restores the music only when the utterance that ended is the one still current', () => {
    expect(shouldRestoreMusic(3, 3)).toBe(true);
    expect(shouldRestoreMusic(2, 3)).toBe(false);
  });

  it('is what the narration does: the whole mix is silenced, and restored only by the current utterance', () => {
    expect(componentSource).toMatch(/musicLevel\(true\)/);
    expect(componentSource).toMatch(/shouldRestoreMusic\(/);
  });
});

describe('PLUCK_PATTERN', () => {
  it('stays inside the 7-note raga', () => {
    for (const i of PLUCK_PATTERN) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(BHAIRAVI_RATIOS.length);
    }
  });

  it('rises then settles back to where it started, not a one-way run', () => {
    expect(PLUCK_PATTERN[0]).toBe(PLUCK_PATTERN[PLUCK_PATTERN.length - 1]);
    expect([...PLUCK_PATTERN]).toEqual([...PLUCK_PATTERN].reverse());
  });
});

describe('narrationFor', () => {
  it('reads the title as a first sentence, then the caption already shown on screen', () => {
    expect(narrationFor({ title: 'The world, scored', caption: 'Every state coloured by risk.' }))
      .toBe('The world, scored. Every state coloured by risk.');
  });

  it('trims stray whitespace from either field', () => {
    expect(narrationFor({ title: '  Title  ', caption: '  Said once.  ' })).toBe('Title. Said once.');
  });

  it('says just the title when a chapter has no caption, rather than a trailing ". "', () => {
    expect(narrationFor({ title: 'Title', caption: '' })).toBe('Title');
    expect(narrationFor({ title: 'Title', caption: '   ' })).toBe('Title');
  });
});

// Makes the sound feature's own claim — every tone synthesized at runtime, nothing fetched,
// embedded or downloaded, nothing persisted — a test rather than only a comment. A future edit
// that pulls in a recorded asset or an audio library, or starts writing a sound preference to
// localStorage, fails here instead of silently invalidating the claim in the file's own header.
describe('pickVoice', () => {
  const v = (name: string, lang: string) => ({ name, lang });
  const name = (voices: { name: string; lang: string }[]) => pickVoice(voices)?.name ?? null;

  // What this Mac offers: Rishi is its only Indian-English voice, and he is male. The old rule — first
  // en-IN voice — narrated the tour in his voice.
  it('picks a female voice over a male Indian-English one', () => {
    expect(name([v('Rishi', 'en-IN'), v('Daniel', 'en-GB'), v('Samantha', 'en-US')])).toBe('Samantha');
  });

  it('prefers a natural-quality female voice, and among equals an Indian-English one', () => {
    const edge = [
      v('Samantha', 'en-US'), v('Google UK English Female', 'en-GB'),
      v('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
      v('Microsoft Neerja Online (Natural) - English (India)', 'en-IN'),
      v('Microsoft Prabhat Online (Natural) - English (India)', 'en-IN'),
    ];
    expect(name(edge)).toBe('Microsoft Neerja Online (Natural) - English (India)');
    expect(name(edge.slice(0, 3))).toBe('Microsoft Aria Online (Natural) - English (United States)');
  });

  it('ranks Chrome\'s online female voices and Apple\'s premium ones above a standard voice', () => {
    expect(name([v('Samantha', 'en-US'), v('Google UK English Female', 'en-GB')])).toBe('Google UK English Female');
    expect(name([v('Samantha', 'en-US'), v('Ava (Premium)', 'en-US')])).toBe('Ava (Premium)');
    expect(name([v('Samantha', 'en-US'), v('Veena', 'en-IN')])).toBe('Veena');
  });

  // Apple's Eloquence voices (Flo, Sandy, Shelley, Grandma…) and the novelty ones are female-sounding at
  // best and robotic at worst; they are nobody's idea of a live narrator.
  it('passes over robotic and novelty voices', () => {
    expect(name([v('Grandma (English (US))', 'en-US'), v('Flo (English (UK))', 'en-GB'), v('Bubbles', 'en-US'), v('Karen', 'en-AU')])).toBe('Karen');
  });

  it('with no known female voice, prefers any English voice that is not known to be male or robotic', () => {
    expect(name([v('Rishi', 'en-IN'), v('Mystery', 'en-IN')])).toBe('Mystery');
    expect(name([v('Rishi', 'en-IN'), v('Grandma (English (US))', 'en-US')])).toBe('Rishi');
  });

  it('still speaks in whatever English voice there is rather than none, and never in another language', () => {
    expect(name([v('Rishi', 'en-IN')])).toBe('Rishi');
    expect(name([v('Google हिन्दी', 'hi-IN'), v('Amélie', 'fr-CA')])).toBeNull();
    expect(name([])).toBeNull();
  });

  it('is what the narration uses, at the voice\'s own natural rate', () => {
    expect(componentSource).toMatch(/pickVoice\(/);
    expect(componentSource).toMatch(/utter\.rate = 1;/);
  });
});

describe('the sound feature carries no recorded asset, dependency, or stored preference', () => {
  it('loads no audio file, sample, or third-party audio library', () => {
    for (const pattern of [/new Audio\(/, /decodeAudioData/, /createBufferSource/, /\bhowler\b/i, /\bTone\./, /data:audio/, /\.(mp3|wav|ogg|m4a|aac|flac)\b/i]) {
      expect(bothSources, `matched ${pattern}`).not.toMatch(pattern);
    }
  });

  it('never fetches anything over the network', () => {
    expect(bothSources).not.toMatch(/\bfetch\(/);
  });

  it('never reads or writes localStorage — the sound choice resets every visit, like the palette', () => {
    // Matches actual property access (localStorage.setItem, window.localStorage[...]), not the
    // word's own appearance in this file's explanatory doc comment ("no localStorage").
    expect(componentSource).not.toMatch(/localStorage\s*[.[]/);
  });

  it('the only sound-producing calls are oscillators and the browser’s own speech synthesis', () => {
    expect(componentSource).toMatch(/ctx\.createOscillator\(\)/);
    expect(componentSource).toMatch(/new SpeechSynthesisUtterance\(/);
  });
});
