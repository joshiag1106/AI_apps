'use strict';

/**
 * The IPC surface is declared in three places that must agree: the allowlists
 * in the preload, the API the preload exposes to the renderer, and the
 * handlers registered in the main process. Nothing at runtime checks that they
 * do, and a disagreement fails in the quietest possible way — `invoke` throws
 * "blocked channel", and callers that fire-and-forget swallow it. The bell's
 * Dock bounce was broken exactly this way from the commit that introduced it.
 *
 * These tests read the source as text rather than importing it, because the
 * preload calls contextBridge at module scope and only works inside a real
 * renderer. That is the same approach `settings.test.js` uses to prove every
 * documented setting is actually read by something.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = path.join(__dirname, '..', 'src');

const read = (...segments) => fs.readFileSync(path.join(SOURCE, ...segments), 'utf8');

const PRELOAD = read('preload', 'preload.js');
const IPC = read('main', 'ipc.js');
const APP = read('renderer', 'js', 'app.js');

/** The string literals inside `const <name> = new Set([ ... ]);`. */
function declaredChannels(source, name) {
  const start = source.indexOf('const ' + name + ' = new Set([');
  assert.notStrictEqual(start, -1, name + ' is no longer declared the way this test expects');
  const end = source.indexOf(']);', start);
  const body = source.slice(start, end);
  return new Set([...body.matchAll(/'([^']+)'/g)].map((match) => match[1]));
}

/** Every channel literal passed to `fn('channel'...)`, allowing newlines. */
function referencedChannels(source, callee) {
  const pattern = new RegExp(callee.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\(\\s*'([^']+)'", 'g');
  return new Set([...source.matchAll(pattern)].map((match) => match[1]));
}

const missing = (from, allowed) => [...from].filter((channel) => !allowed.has(channel)).sort();

test('every channel the preload API invokes is on the invoke allowlist', () => {
  // The bug this test exists for: `win.attention()` called a channel that was
  // never allowlisted, so the terminal bell could never bounce the Dock or
  // flash the taskbar. The renderer discards the rejection, so nothing but a
  // test like this one would ever notice.
  const allowed = declaredChannels(PRELOAD, 'INVOKE_CHANNELS');
  const used = referencedChannels(PRELOAD, 'invoke');

  assert.deepStrictEqual(
    missing(used, allowed),
    [],
    'exposed by the preload but blocked by INVOKE_CHANNELS: ' + missing(used, allowed).join(', ')
  );
});

test('every allowlisted invoke channel has a main-process handler', () => {
  // The reverse failure: a channel the renderer is permitted to call that
  // nothing answers. `invoke` would hang rather than reject.
  const allowed = declaredChannels(PRELOAD, 'INVOKE_CHANNELS');
  const handled = referencedChannels(IPC, 'ipcMain.handle');

  assert.deepStrictEqual(
    missing(allowed, handled),
    [],
    'allowlisted but unhandled in the main process: ' + missing(allowed, handled).join(', ')
  );
});

test('every event channel the renderer subscribes to is on the event allowlist', () => {
  // Same class of bug on the main-to-renderer direction. `on` throws for an
  // unlisted channel, which would silently cost the app an entire event.
  const allowed = declaredChannels(PRELOAD, 'EVENT_CHANNELS');
  const subscribed = referencedChannels(APP, 'api.on');

  assert.deepStrictEqual(
    missing(subscribed, allowed),
    [],
    'subscribed by the renderer but blocked by EVENT_CHANNELS: ' +
      missing(subscribed, allowed).join(', ')
  );
});
