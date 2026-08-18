'use strict';

/**
 * User settings: schema-checked on load, written atomically with 0600 perms.
 *
 * The settings file is user-editable text on disk, so it is untrusted input
 * like anything else. It is parsed with JSON.parse (never eval'd or require'd)
 * and every field is coerced against the schema below. Unknown keys are
 * dropped and malformed values fall back to defaults, so a corrupt or hand-
 * mangled file degrades to "default settings" instead of crashing at startup.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULTS = Object.freeze({
  fontFamily:
    'JetBrains Mono, Fira Code, SF Mono, Menlo, Consolas, DejaVu Sans Mono, monospace',
  fontSize: 14,
  lineHeight: 1.2,
  letterSpacing: 0,
  cursorStyle: 'bar',
  cursorBlink: true,
  theme: 'auto',
  lightTheme: 'GitHub Light',
  darkTheme: 'Tokyo Night',
  scrollback: 10000,
  shell: null,
  shellArgs: null,
  copyOnSelect: false,
  confirmOnClose: true,
  restoreSession: true,
  renderer: 'webgl',
  vibrancy: true,
  bell: false,
  // Working directories of the tabs open at last exit, for session restore.
  lastSession: [],
});

const ENUMS = Object.freeze({
  cursorStyle: ['bar', 'block', 'underline'],
  renderer: ['webgl', 'canvas'],
});

const NUMERIC_RANGES = Object.freeze({
  fontSize: [6, 72],
  lineHeight: [0.8, 3],
  letterSpacing: [-5, 10],
  scrollback: [100, 200000],
});

function clamp(value, range) {
  return Math.min(range[1], Math.max(range[0], value));
}

/** Coerce an arbitrary parsed object into a known-good settings object. */
function coerce(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;

  for (const key of Object.keys(DEFAULTS)) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const value = raw[key];
    const fallback = DEFAULTS[key];

    if (key === 'shell') {
      if (typeof value === 'string' && value.trim() && !value.includes(' ')) {
        out.shell = value.trim();
      }
      continue;
    }
    if (key === 'shellArgs') {
      if (Array.isArray(value) && value.every((a) => typeof a === 'string')) {
        out.shellArgs = value.slice(0, 32);
      }
      continue;
    }
    if (key === 'lastSession') {
      if (Array.isArray(value)) {
        out.lastSession = value
          .filter((p) => typeof p === 'string' && p.length > 0 && p.length <= 4096)
          .slice(0, 20);
      }
      continue;
    }
    if (ENUMS[key]) {
      if (ENUMS[key].includes(value)) out[key] = value;
      continue;
    }
    if (typeof fallback === 'number') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = NUMERIC_RANGES[key] ? clamp(value, NUMERIC_RANGES[key]) : value;
      }
      continue;
    }
    if (typeof fallback === 'boolean') {
      if (typeof value === 'boolean') out[key] = value;
      continue;
    }
    if (typeof fallback === 'string') {
      if (typeof value === 'string' && value.length <= 512) out[key] = value;
    }
  }
  // These two must stay integers or xterm misbehaves.
  out.scrollback = Math.round(out.scrollback);
  out.fontSize = Math.round(out.fontSize);
  return out;
}

class Settings {
  constructor(filePath) {
    this.filePath =
      filePath || path.join(os.homedir(), '.config', 'josh', 'settings.json');
    this.values = { ...DEFAULTS };
  }

  load() {
    try {
      const text = fs.readFileSync(this.filePath, 'utf8');
      this.values = coerce(JSON.parse(text));
    } catch {
      // Missing or unreadable/corrupt file: defaults are the correct answer.
      this.values = { ...DEFAULTS };
    }
    return this.values;
  }

  /** Atomic: write a sibling temp file, then rename over the target. */
  save(partial) {
    this.values = coerce({ ...this.values, ...(partial || {}) });
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = path.join(dir, '.settings.' + process.pid + '.' + Date.now() + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(this.values, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
    return this.values;
  }

  get() {
    return { ...this.values };
  }
}

module.exports = { Settings, DEFAULTS, coerce };
