'use strict';

/**
 * Pure scoring over recorded commands.
 *
 * No filesystem, no Electron, no clock -- `now` is passed in. Purity is what
 * makes the interesting behaviour testable, matching how validate.js,
 * split-tree.js and shell-resolver.js are already structured here.
 *
 * The weights are judgements, not measurements, and are grouped in one place
 * so they can be tuned once there is real usage to tune against.
 */

const WEIGHT = Object.freeze({
  sameDirectory: 3.0,
  sameFingerprint: 1.5,
  succeeded: 1.0,
  failed: -4.0,      // heavily demoted: suggesting a known-broken command is worse than silence
  frequency: 0.8,    // multiplied by log(1 + count), so habits do not drown everything
  repair: 5.0,       // the strongest signal there is: it demonstrably fixed this
  recencyHalfLife: 60 * 60 * 24 * 7, // one week
});

const REPAIR_WINDOW = 600; // ten minutes

/** How close two commands are, used only to pair a failure with its fix. */
function looksLikeRepairOf(fixed, failed) {
  if (fixed === failed) return false;
  const a = failed.split(/\s+/);
  const b = fixed.split(/\s+/);
  if (!a.length || !b.length) return false;
  // Same program, and the fix keeps most of what the failure said.
  if (a[0] !== b[0]) return false;
  const shared = a.filter((word) => b.includes(word)).length;
  return shared >= Math.max(1, Math.floor(a.length / 2));
}

/** Rank candidates for the line being typed, best first. */
function rank(candidates, context) {
  const ctx = context || {};
  const prefix = typeof ctx.prefix === 'string' ? ctx.prefix : null;
  if (prefix === null || !Array.isArray(candidates)) return [];

  const now = typeof ctx.now === 'number' ? ctx.now : 0;
  const cwd = ctx.cwd || null;
  const fingerprint = Array.isArray(ctx.fingerprint) ? ctx.fingerprint : [];

  // A failure followed shortly by a similar success is the strongest evidence
  // in the store: the second command demonstrably fixed the first.
  const repaired = new Set();
  for (const failure of candidates) {
    if (!failure || failure.exit === 0) continue;
    for (const fix of candidates) {
      if (!fix || fix.exit !== 0) continue;
      const gap = fix.ts - failure.ts;
      if (gap < 0 || gap > REPAIR_WINDOW) continue;
      if (looksLikeRepairOf(fix.cmd, failure.cmd)) repaired.add(fix.cmd);
    }
  }

  const counts = new Map();
  for (const entry of candidates) {
    if (entry && typeof entry.cmd === 'string') {
      counts.set(entry.cmd, (counts.get(entry.cmd) || 0) + 1);
    }
  }

  const best = new Map();
  for (const entry of candidates) {
    if (!entry || typeof entry.cmd !== 'string') continue;
    // Only a strict extension of what is typed can be a suggestion.
    if (!entry.cmd.startsWith(prefix) || entry.cmd.length === prefix.length) continue;

    let score = 0;
    if (cwd && entry.cwd === cwd) {
      score += WEIGHT.sameDirectory;
    } else if (fingerprint.length && Array.isArray(entry.fp) &&
               entry.fp.some((tag) => fingerprint.includes(tag))) {
      score += WEIGHT.sameFingerprint;
    }

    score += entry.exit === 0 ? WEIGHT.succeeded : WEIGHT.failed;
    score += WEIGHT.frequency * Math.log(1 + (counts.get(entry.cmd) || 1));
    score += Math.pow(2, -((now - entry.ts) / WEIGHT.recencyHalfLife));
    if (repaired.has(entry.cmd)) score += WEIGHT.repair;

    const previous = best.get(entry.cmd);
    if (!previous || score > previous.score) best.set(entry.cmd, { cmd: entry.cmd, score });
  }

  return [...best.values()].sort((a, b) => b.score - a.score || a.cmd.localeCompare(b.cmd));
}

/**
 * The text to show after the cursor, or null for silence.
 *
 * An empty prefix returns null on purpose: with nothing typed there is no
 * evidence to rank on, and ghost text on a bare prompt is startling rather
 * than helpful. A non-positive score is also silence -- it means the best
 * candidate is a command that failed.
 */
function best(candidates, context) {
  const ctx = context || {};
  if (typeof ctx.prefix !== 'string' || ctx.prefix === '') return null;
  const ranked = rank(candidates, ctx);
  if (!ranked.length || ranked[0].score <= 0) return null;
  return ranked[0].cmd.slice(ctx.prefix.length);
}

module.exports = { rank, best, WEIGHT, REPAIR_WINDOW, looksLikeRepairOf };
