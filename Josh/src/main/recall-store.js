'use strict';

/**
 * The recorded command history: append-only JSONL at ~/.config/josh/recall.jsonl.
 *
 * This file is a shell history on disk, so two properties are part of the
 * threat model rather than niceties. It is written 0600, never briefly wider,
 * and redaction runs *before* anything reaches the filesystem -- see
 * recall-redact.js, which is deliberately a separate module with no fs access.
 *
 * The file is plain text a user can read, edit and truncate, and a crash can
 * leave a half-written line. A corrupt line therefore costs one record, never
 * the file: every line is parsed in isolation and a failure is skipped.
 */

const fs = require('node:fs');
const path = require('node:path');

const Redact = require('./recall-redact.js');

/** Bumped only when the record shape changes incompatibly. */
const SCHEMA = 1;

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

/**
 * Marker file to ecosystem. This is what lets knowledge transfer between
 * similar projects: two directories with a Cargo.toml are alike even when
 * their paths share nothing.
 */
const MARKERS = Object.freeze({
  'package.json': 'npm',
  'Cargo.toml': 'cargo',
  '.git': 'git',
  'go.mod': 'go',
  'pyproject.toml': 'python',
  'requirements.txt': 'python',
  Gemfile: 'ruby',
  'pom.xml': 'java',
  'build.gradle': 'java',
  Makefile: 'make',
  'CMakeLists.txt': 'cmake',
  Dockerfile: 'docker',
});

/**
 * The ecosystems a directory belongs to, from its listing.
 *
 * Returns [] for anything unrecognised rather than guessing: an empty
 * fingerprint ranks as "no locality evidence", which is honest, where a wrong
 * one would rank unrelated commands as though they belonged here.
 */
function fingerprintFor(names) {
  if (!Array.isArray(names)) return [];
  const tags = new Set();
  for (const name of names) {
    if (typeof name === 'string' && MARKERS[name]) tags.add(MARKERS[name]);
  }
  return [...tags].sort();
}

class RecallStore {
  constructor({ file, maxEntries = 50000, excludePatterns = [] } = {}) {
    this.file = file;
    this.maxEntries = maxEntries;
    this.patterns = Redact.compilePatterns(excludePatterns);
    this.entries = [];
  }

  /**
   * Read the store from disk. A missing file, an unreadable one, or a parent
   * directory that does not exist all yield an empty store -- none of them is
   * an error worth failing a terminal over.
   */
  load() {
    let text = '';
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch {
      this.entries = [];
      return this.entries;
    }

    const entries = [];
    for (const line of text.split('\n')) {
      if (!line) continue;
      try {
        const record = JSON.parse(line);
        // An unknown schema is skipped rather than guessed at.
        if (record && record.v === SCHEMA) entries.push(record);
      } catch {
        // A half-written line after a crash costs this record, not the file.
      }
    }
    this.entries = entries;
    return this.entries;
  }

  /**
   * Record one completed command.
   *
   * Returns false, having touched nothing at all, when redaction refuses it.
   * The check runs first on purpose: a secret must not reach the filesystem
   * even briefly, and there is no code path here that writes before asking.
   */
  record(entry) {
    if (!entry || Redact.shouldRedact(entry.cmd, this.patterns)) return false;

    const record = {
      v: SCHEMA,
      ts: typeof entry.ts === 'number' ? entry.ts : Math.floor(Date.now() / 1000),
      cmd: entry.cmd,
      cwd: entry.cwd || null,
      fp: Array.isArray(entry.fp) ? entry.fp : [],
      exit: typeof entry.exit === 'number' ? entry.exit : 0,
      ms: typeof entry.ms === 'number' ? entry.ms : 0,
    };

    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: DIR_MODE });
      fs.appendFileSync(this.file, JSON.stringify(record) + '\n', { mode: FILE_MODE });
    } catch {
      // A store Josh cannot write is not worth failing a command over. The
      // in-memory index still serves this session.
    }

    this.entries.push(record);
    // Amortised: compacting on every write would rewrite the whole file per
    // command, which is the one thing a hot path must not do.
    if (this.entries.length > this.maxEntries * 1.2) this.compact();
    return true;
  }

  candidates() {
    return this.entries;
  }

  size() {
    return this.entries.length;
  }

  /**
   * Trim to `maxEntries`, keeping the most recent, and rewrite the file
   * atomically -- a sibling temp file at 0600, then rename -- so a crash
   * mid-compaction leaves the old store rather than a truncated one.
   */
  compact() {
    const kept = this.entries.slice().sort((a, b) => a.ts - b.ts).slice(-this.maxEntries);
    this.entries = kept;

    const temp = this.file + '.tmp';
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: DIR_MODE });
      fs.writeFileSync(temp, kept.map((r) => JSON.stringify(r)).join('\n') + '\n', {
        mode: FILE_MODE,
      });
      fs.renameSync(temp, this.file);
    } catch {
      try {
        fs.rmSync(temp, { force: true });
      } catch {
        /* nothing further to do */
      }
    }
    return kept;
  }
}

module.exports = { RecallStore, fingerprintFor, SCHEMA, FILE_MODE, MARKERS };
