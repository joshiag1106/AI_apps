// tests/demo-audio.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BHAIRAVI_RATIOS, PLUCK_PATTERN, droneTones, narrationFor, raga } from '@/lib/demo/audio';

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

describe('droneTones', () => {
  it('returns the fifth below, the root twice, and the octave — a tanpura chord, low to high', () => {
    expect(droneTones(200)).toEqual([100, 300, 200, 400]);
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
