'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { droneTones, narrationFor, raga, PLUCK_PATTERN } from '@/lib/demo/audio';

/** F3 — a calm, low register for the drone. The note itself is math, not a recording. */
const ROOT_HZ = 174.61;
const PLUCK_INTERVAL_MS = 3200;
const BTN = 'rounded-md border border-[color:var(--color-line)] px-3 py-1.5 text-[15px] text-text transition-colors hover:border-[color:var(--color-accent)]';

interface DemoAudioChapter { title: string; caption: string }

/**
 * The tour's optional sound: a synthesized tanpura drone (the scale math is in lib/demo/audio, kept
 * separate so it tests without a browser) under spoken narration of each chapter's own title and
 * caption — nothing said that is not also shown. Off by default: a browser refuses sound before a
 * user gesture regardless, and a page should not force audio on a visitor either way. The choice
 * resets every visit (no localStorage), the same rule DemoTour already keeps for the colour palette.
 *
 * Nothing here is a recording. Every tone is an oscillator built from ratios at the moment it plays,
 * and the words are read by the browser's own text-to-speech — no audio file is fetched, embedded,
 * or downloaded, so nothing in this feature can carry a copyright claim.
 */
export function DemoAudio(
  { chapters, index, playing, hidden }: { chapters: DemoAudioChapter[]; index: number; playing: boolean; hidden: boolean },
) {
  const [enabled, setEnabled] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const droneGainRef = useRef<GainNode | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const pluckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pluckStepRef = useRef(0);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  const teardown = useCallback(() => {
    if (pluckTimerRef.current !== null) { clearInterval(pluckTimerRef.current); pluckTimerRef.current = null; }
    if (speakTimerRef.current !== null) { clearTimeout(speakTimerRef.current); speakTimerRef.current = null; }
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    for (const osc of oscillatorsRef.current) { try { osc.stop(); } catch { /* already stopped */ } }
    oscillatorsRef.current = [];
    const ctx = ctxRef.current;
    ctxRef.current = null;
    droneGainRef.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close();
  }, []);

  const pluckOnce = useCallback((ctx: AudioContext, target: GainNode) => {
    const notes = raga(ROOT_HZ * 2);
    const hz = notes[PLUCK_PATTERN[pluckStepRef.current % PLUCK_PATTERN.length]];
    pluckStepRef.current += 1;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    const env = ctx.createGain();
    const now = ctx.currentTime;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.05, now + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0005, now + 1.8);
    osc.connect(env);
    env.connect(target);
    osc.start(now);
    osc.stop(now + 2);
  }, []);

  const start = useCallback(() => {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    master.connect(ctx.destination);

    const drone = ctx.createGain();
    drone.gain.value = 0.06;
    drone.connect(master);
    droneGainRef.current = drone;

    // droneTones() is [fifth-below, root, root, octave] low to high; the two sustained roots (index
    // 1 and 2) carry the chord, the fifth and octave sit under it.
    oscillatorsRef.current = droneTones(ROOT_HZ).map((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const gain = ctx.createGain();
      gain.gain.value = i === 1 || i === 2 ? 1 : 0.6;
      osc.connect(gain);
      gain.connect(drone);
      osc.start();
      return osc;
    });

    pluckStepRef.current = 0;
    pluckTimerRef.current = setInterval(() => pluckOnce(ctx, master), PLUCK_INTERVAL_MS);
  }, [pluckOnce]);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.92;
    utter.pitch = 1;
    // Chrome returns [] from getVoices() until 'voiceschanged' has fired once; voicesRef is kept
    // warm by the effect below so even the very first narration usually sees the real list.
    const voices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang?.toLowerCase().startsWith('en-in'))
      ?? voices.find((v) => v.lang?.toLowerCase().startsWith('en'));
    if (voice) utter.voice = voice;

    const drone = droneGainRef.current;
    const ctx = ctxRef.current;
    const setDrone = (level: number, overSeconds: number) => {
      if (!drone || !ctx || ctx.state === 'closed') return;
      drone.gain.cancelScheduledValues(ctx.currentTime);
      drone.gain.linearRampToValueAtTime(level, ctx.currentTime + overSeconds);
    };
    setDrone(0.02, 0.4); // duck under the voice
    const restore = () => setDrone(0.06, 0.8);
    utter.onend = restore;
    utter.onerror = restore;
    window.speechSynthesis.speak(utter);
  }, []);

  // Keeps a cached voice list warm from the moment sound could plausibly be used, so speak()'s
  // en-IN preference does not lose its very first pick to Chrome's async voice loading.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const refresh = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    refresh();
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, []);

  // Speaks the chapter that is showing whenever sound turns on, and again on every later chapter
  // change — not on every re-render, so `chapters`/`speak` are deliberately left out of the deps.
  useEffect(() => {
    if (!enabled) return;
    if (speakTimerRef.current !== null) clearTimeout(speakTimerRef.current);
    speakTimerRef.current = setTimeout(() => {
      const chapter = chapters[index];
      if (chapter) speak(narrationFor(chapter));
    }, 500);
    return () => { if (speakTimerRef.current !== null) clearTimeout(speakTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, index]);

  // Owns the AudioContext's lifetime: created when sound turns on, torn down when it turns off or
  // the tour unmounts. This lives in an effect, not in the `enabled` state updater below — Strict
  // Mode double-invokes updater functions, which would otherwise leak a second, unreferenced
  // AudioContext that teardown() can never reach. Declared before the pause/hidden effect so
  // ctxRef is already populated when that effect reads it in the same commit.
  useEffect(() => {
    if (!enabled) return;
    start();
    return () => teardown();
  }, [enabled, start, teardown]);

  // Mirrors the visual pause: a paused tour, a hidden tab, or the tour having stopped at its last
  // chapter (`playing` goes false there too) all silence the drone and stop the voice; both resume
  // with play. Suspending the context (not just muting) also frees the CPU the oscillators use.
  useEffect(() => {
    if (!enabled) return;
    const run = playing && !hidden;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (run) window.speechSynthesis.resume(); else window.speechSynthesis.pause();
    }
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== 'closed') void (run ? ctx.resume() : ctx.suspend());
  }, [enabled, playing, hidden]);

  return (
    <button
      type="button"
      className={BTN}
      aria-label={enabled ? 'Turn off music and narration' : 'Turn on music and narration'}
      title={enabled ? 'Turn off music and narration' : 'Turn on music and narration'}
      onClick={() => setEnabled((v) => !v)}
    >
      {enabled ? '♫' : '♪'}
    </button>
  );
}
