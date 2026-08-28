'use strict';

/**
 * Owns every pseudo-terminal in the application.
 *
 * Two responsibilities beyond plain lifecycle:
 *
 *  1. Ownership. Each session is bound to the window that created it. A window
 *     may only address sessions in its own set, so a compromised renderer
 *     cannot read or write another window's shell.
 *
 *  2. Output batching. A PTY can emit thousands of small chunks per second
 *     (`cat` a large file, `yes`, a noisy build). Forwarding each one as its
 *     own IPC message is the single biggest cause of sluggish Electron
 *     terminals. Output is accumulated and flushed on a short timer instead,
 *     which keeps `cat` of a large file smooth.
 */

const os = require('node:os');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const nodePty = require('@lydell/node-pty');
const { LIMITS, assertDimensions, assertWriteData, sanitizeTitle } = require('./validate');
const { resolveShell, sanitizeEnv } = require('./shell-resolver');
const shellIntegration = require('./shell-integration');
const Parser = require('./semantic-parser.js');
const RecallStore = require('./recall-store.js');
const InputTracker = require('./input-tracker.js');
const RecallRank = require('./recall-rank.js');
const { sanitizeSuggestion } = require('./validate.js');

const FLUSH_INTERVAL_MS = 8; // ~120fps; below human perception, far above per-chunk IPC
const FLUSH_THRESHOLD_BYTES = 64 * 1024;
const WRITE_RATE_LIMIT_BYTES_PER_SEC = 16 * 1024 * 1024;

// OSC 7 (`ESC ] 7 ; file://host/path` terminated by BEL or ST). Well-behaved
// shells emit this on every directory change, so it lets us learn a session's
// cwd without polling the OS. Powers "new tab in the same directory".
const OSC7 = /\x1b\]7;file:\/\/[^/]*([^\x07\x1b]*)(?:\x07|\x1b\\)/;
const OSC7_HINT = '\x1b]7;';

class PtyManager {
  /**
   * @param {object} handlers
   * @param {(windowId:number, sessionId:string, data:string) => void} handlers.onData
   * @param {(windowId:number, sessionId:string, info:object) => void} handlers.onExit
   * @param {(windowId:number, sessionId:string, cwd:string) => void} [handlers.onCwd]
   * @param {string|null} [handlers.binDir] directory holding the bundled
   *   fallback tools (Windows sed/awk). Injected rather than resolved here so
   *   this module stays free of Electron imports.
   */
  constructor({ onData, onExit, onCwd, onSuggestion, recallStore = null, binDir = null } = {}) {
    this.sessions = new Map(); // sessionId -> record
    this.byWindow = new Map(); // windowId  -> Set<sessionId>
    this.onData = onData || (() => {});
    this.onExit = onExit || (() => {});
    this.onCwd = onCwd || (() => {});
    this.onSuggestion = onSuggestion || (() => {});
    // Injected rather than constructed here, for the same reason binDir is:
    // this module stays free of Electron and of app.getPath.
    this.recallStore = recallStore;
    this.binDir = binDir;
  }

  _ownedSet(windowId) {
    let set = this.byWindow.get(windowId);
    if (!set) {
      set = new Set();
      this.byWindow.set(windowId, set);
    }
    return set;
  }

  /**
   * Resolve a session id *for a specific window*. This is the ownership check;
   * every IPC handler must go through it rather than touching this.sessions.
   * @returns {object|null} the session record, or null if not owned by caller
   */
  resolveOwned(windowId, sessionId) {
    const record = this.sessions.get(sessionId);
    if (!record) return null;
    if (record.windowId !== windowId) return null;
    return record;
  }

  create({ windowId, cols, rows, cwd = null, glyphs = 'plain', settings = {} }) {
    assertDimensions(cols, rows);
    const owned = this._ownedSet(windowId);
    if (owned.size >= LIMITS.MAX_SESSIONS_PER_WINDOW) {
      throw new Error('session limit reached for this window');
    }

    const resolved = resolveShell({
      platform: process.platform,
      env: process.env,
      explicit: settings.shell || null,
    });
    const shellArgs = Array.isArray(settings.shellArgs) ? settings.shellArgs : resolved.args;
    const env = sanitizeEnv(process.env, { platform: process.platform, binDir: this.binDir });
    const startCwd = cwd || env.HOME || env.USERPROFILE || process.cwd();

    // A broken kit must never cost someone their terminal. Anything that goes
    // wrong here leaves the session spawning exactly as it did before the kit
    // existed, and says nothing to the user about it.
    // A fresh nonce per session. Output that cannot present it is ignored, so
    // `cat`-ing a file full of crafted sequences achieves nothing.
    const recallWanted = settings.recall === true
      && shellIntegration.recallSnippet(shellIntegration.dialectFor(resolved.file), 'a'.repeat(32)) !== '';
    const nonce = recallWanted ? Parser.makeNonce() : null;

    let integration = null;
    try {
      integration = shellIntegration.build({
        shell: resolved.file,
        settings,
        glyphs,
        env,
        home: env.HOME || env.USERPROFILE || '',
        tmpdir: os.tmpdir(),
        recall: nonce,
      });
    } catch {
      integration = null;
    }

    const spawnEnv = integration ? { ...env, ...integration.env } : env;
    const spawnArgs = integration && integration.args.length > 0
      ? shellArgs.concat(integration.args)
      : shellArgs;

    let pty;
    try {
      pty = nodePty.spawn(resolved.file, spawnArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: startCwd,
        env: spawnEnv,
      });
    } catch (error) {
      if (integration) integration.dispose();
      throw error;
    }

    const sessionId = randomUUID();
    const record = {
      id: sessionId,
      windowId,
      pty,
      shell: resolved.file,
      cwd: startCwd,
      title: resolved.file.split(/[\\/]/).pop(),
      buffer: [],
      bufferedBytes: 0,
      flushTimer: null,
      disposeKit: integration ? integration.dispose : null,
      writeBudget: WRITE_RATE_LIMIT_BYTES_PER_SEC,
      budgetResetAt: Date.now() + 1000,
      exited: false,
      // null means Recall is off for this session. Where integration cannot be
      // established Josh disables it rather than guessing prompt boundaries
      // from raw output, which is the inference that produces confidently
      // wrong suggestions.
      recall: nonce ? {
        nonce,
        // Captured at spawn, like every other per-session setting here: a
        // change applies to new sessions, never to a shell already running.
        inlineSuggest: settings.recallInlineSuggest === true,
        state: Parser.createSession(nonce),
        tracker: InputTracker.create(),
        pending: null,        // the C event awaiting its D
        fingerprint: [],      // cached per cwd, so there is no fs call per command
        fingerprintFor: null, // the cwd that fingerprint was computed for
      } : null,
    };

    pty.onData((chunk) => this._enqueue(record, chunk));
    pty.onExit((event) => {
      record.exited = true;
      this._flush(record);
      this.onExit(windowId, sessionId, {
        exitCode: event ? event.exitCode : 0,
        signal: event ? event.signal : undefined,
      });
      this._destroy(sessionId);
    });

    this.sessions.set(sessionId, record);
    owned.add(sessionId);
    return { sessionId, shell: resolved.file, pid: pty.pid, cwd: record.cwd };
  }

  _enqueue(record, chunk) {
    record.buffer.push(chunk);
    record.bufferedBytes += chunk.length;

    // Cheap substring guard before running the regex on every chunk.
    if (chunk.indexOf(OSC7_HINT) !== -1) {
      const match = OSC7.exec(chunk);
      if (match && match[1]) {
        const decoded = safeDecodeCwd(match[1]);
        if (decoded && decoded !== record.cwd) {
          record.cwd = decoded;
          this.onCwd(record.windowId, record.id, decoded);
        }
      }
    }

    // Same shape as the OSC 7 guard above: a cheap substring test before any
    // regex, because this runs on every output chunk.
    if (record.recall && chunk.indexOf(Parser.HINT) !== -1) {
      for (const event of Parser.scan(record.recall.state, chunk)) {
        this._onRecallEvent(record, event);
      }
    }

    if (record.bufferedBytes >= FLUSH_THRESHOLD_BYTES) {
      this._flush(record);
    } else if (!record.flushTimer) {
      record.flushTimer = setTimeout(() => this._flush(record), FLUSH_INTERVAL_MS);
    }
  }

  /**
   * One authenticated prompt event.
   *
   * `A` needs nothing beyond the transition the parser already made; the
   * work is at `B` (a fresh input point), `C` (a command starting) and `D`
   * (its outcome, which is the only moment worth recording).
   */
  _onRecallEvent(record, event) {
    const recall = record.recall;
    if (!recall) return;

    if (event.type === 'B') {
      recall.tracker.reset();
      // Clear whatever was showing: the line the suggestion belonged to is gone.
      this.onSuggestion(record.windowId, record.id, '');
      return;
    }

    if (event.type === 'C') {
      recall.pending = { cmd: event.cmd, startedAt: Date.now() };
      this.onSuggestion(record.windowId, record.id, '');
      return;
    }

    if (event.type === 'D') {
      const pending = recall.pending;
      recall.pending = null;
      if (!pending || !pending.cmd || !this.recallStore) return;
      this._refreshFingerprint(record);
      this.recallStore.record({
        cmd: pending.cmd,
        cwd: record.cwd,
        fp: recall.fingerprint,
        exit: event.exit,
        ms: Date.now() - pending.startedAt,
        ts: Math.floor(Date.now() / 1000),
      });
    }
  }

  /** Read the directory listing only when the working directory has changed. */
  _refreshFingerprint(record) {
    const recall = record.recall;
    if (!recall || recall.fingerprintFor === record.cwd) return;
    let names = [];
    try {
      names = fs.readdirSync(record.cwd);
    } catch {
      names = [];
    }
    recall.fingerprint = RecallStore.fingerprintFor(names);
    recall.fingerprintFor = record.cwd;
  }

  /**
   * Offer a completion for the line being typed, or say nothing.
   *
   * Silence is the default and covers every uncertainty: a line Josh cannot
   * model, a phase where a suggestion would be nonsense, the feature switched
   * off. A wrong suggestion is worse than no suggestion.
   */
  _suggest(record) {
    const recall = record.recall;
    if (!recall || !this.recallStore) return;
    if (!recall.inlineSuggest) return;
    if (recall.state.phase !== 'input') return;

    const prefix = recall.tracker.line();
    if (prefix === null) return;

    this._refreshFingerprint(record);
    const text = RecallRank.best(this.recallStore.candidates(), {
      prefix,
      cwd: record.cwd,
      fingerprint: recall.fingerprint,
      now: Math.floor(Date.now() / 1000),
    });

    // Suggestion text comes from previously executed commands, so it crosses
    // to the renderer as data: control characters stripped, length clamped.
    this.onSuggestion(record.windowId, record.id, sanitizeSuggestion(text || ''));
  }

  _flush(record) {
    if (record.flushTimer) {
      clearTimeout(record.flushTimer);
      record.flushTimer = null;
    }
    if (record.buffer.length === 0) return;
    const payload = record.buffer.join('');
    record.buffer = [];
    record.bufferedBytes = 0;
    this.onData(record.windowId, record.id, payload);
  }

  write(windowId, sessionId, data) {
    const record = this.resolveOwned(windowId, sessionId);
    if (!record || record.exited) return false;
    assertWriteData(data);

    // Everything the renderer asks to write passes through the tracker, which
    // models the typed line only as far as certainty goes and gives up on
    // anything it cannot model. A suggestion is recomputed per keystroke.
    if (record.recall) {
      record.recall.tracker.consume(data);
      this._suggest(record);
    }

    // Token bucket: a compromised renderer cannot spin writes to burn CPU or
    // memory, while a normal large paste still goes through untouched.
    const now = Date.now();
    if (now >= record.budgetResetAt) {
      record.writeBudget = WRITE_RATE_LIMIT_BYTES_PER_SEC;
      record.budgetResetAt = now + 1000;
    }
    const size = Buffer.byteLength(data, 'utf8');
    if (size > record.writeBudget) return false;
    record.writeBudget -= size;

    record.pty.write(data);
    return true;
  }

  resize(windowId, sessionId, cols, rows) {
    const record = this.resolveOwned(windowId, sessionId);
    if (!record || record.exited) return false;
    assertDimensions(cols, rows);
    try {
      record.pty.resize(cols, rows);
      return true;
    } catch {
      return false; // races with an exiting shell are normal, not errors
    }
  }

  setTitle(windowId, sessionId, title) {
    const record = this.resolveOwned(windowId, sessionId);
    if (!record) return false;
    record.title = sanitizeTitle(title);
    return true;
  }

  getCwd(windowId, sessionId) {
    const record = this.resolveOwned(windowId, sessionId);
    return record ? record.cwd : null;
  }

  /** How many live sessions a window owns. Used by the close confirmation. */
  sessionCount(windowId) {
    const owned = this.byWindow.get(windowId);
    return owned ? owned.size : 0;
  }

  kill(windowId, sessionId) {
    const record = this.resolveOwned(windowId, sessionId);
    if (!record) return false;
    try {
      record.pty.kill();
    } catch {
      /* already gone */
    }
    this._destroy(sessionId);
    return true;
  }

  killAllForWindow(windowId) {
    const owned = this.byWindow.get(windowId);
    if (!owned) return 0;
    const ids = [...owned];
    for (const id of ids) {
      const record = this.sessions.get(id);
      if (record) {
        try {
          record.pty.kill();
        } catch {
          /* already gone */
        }
        this._destroy(id);
      }
    }
    this.byWindow.delete(windowId);
    return ids.length;
  }

  _destroy(sessionId) {
    const record = this.sessions.get(sessionId);
    if (!record) return;
    if (record.flushTimer) clearTimeout(record.flushTimer);
    if (record.disposeKit) {
      record.disposeKit();
      record.disposeKit = null;
    }
    this.sessions.delete(sessionId);
    const owned = this.byWindow.get(record.windowId);
    if (owned) owned.delete(sessionId);
  }

  disposeAll() {
    for (const windowId of [...this.byWindow.keys()]) this.killAllForWindow(windowId);
  }
}

/** OSC 7 paths are percent-encoded; a malformed one must not throw. */
function safeDecodeCwd(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

module.exports = { PtyManager, FLUSH_INTERVAL_MS, OSC7, safeDecodeCwd };
