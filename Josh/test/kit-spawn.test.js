'use strict';
const test = require('node:test');
const assert = require('node:assert');

const nodePty = require('@lydell/node-pty');
const { PtyManager } = require('../src/main/pty-manager.js');
const shellIntegration = require('../src/main/shell-integration.js');

const REAL_BUILD = shellIntegration.build;
const REAL_SPAWN = nodePty.spawn;

/**
 * A pty that does nothing.
 *
 * Task 9 is about what the spawn path decides, not about running a shell, and
 * a real pty keeps the test process alive after the assertions are done. The
 * end-to-end task spawns for real.
 */
function fakePty(record) {
  return {
    pid: 4242,
    onData() {},
    onExit(handler) { record.onExit = handler; },
    write() {},
    resize() {},
    kill() {},
  };
}

/** Run with node-pty and shell-integration replaced, always restoring both. */
function withStubs({ build, spawn }, run) {
  const calls = { spawn: [], build: [], pty: {} };

  nodePty.spawn = (file, args, options) => {
    calls.spawn.push({ file, args, options });
    if (spawn) spawn(file, args, options);
    return fakePty(calls.pty);
  };
  if (build) shellIntegration.build = build;

  try {
    return run(calls);
  } finally {
    nodePty.spawn = REAL_SPAWN;
    shellIntegration.build = REAL_BUILD;
  }
}

function manager() {
  return new PtyManager({ onData: () => {}, onExit: () => {}, onCwd: () => {} });
}

const BASE = { windowId: 1, cols: 80, rows: 24 };

/* ------------------------------------------------------ the kit is asked */

test('the spawn path consults the kit, and passes it what it needs', () => {
  const seen = [];
  withStubs({ build: (args) => { seen.push(args); return null; } }, () => {
    manager().create(Object.assign({}, BASE, { glyphs: 'rich', settings: { shellKit: true } }));
  });

  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].glyphs, 'rich');
  assert.strictEqual(seen[0].settings.shellKit, true);
  assert.strictEqual(typeof seen[0].shell, 'string');
  assert.ok(seen[0].tmpdir.length > 0, 'a temp directory must be offered');
  assert.strictEqual(typeof seen[0].env, 'object', 'the sanitized env, not process.env');
});

test('the glyph mode defaults to plain when the renderer says nothing', () => {
  const seen = [];
  withStubs({ build: (args) => { seen.push(args); return null; } }, () => {
    manager().create(Object.assign({}, BASE, { settings: {} }));
  });
  assert.strictEqual(seen[0].glyphs, 'plain');
});

/* --------------------------------------------------- a kit that declines */

test('a session with the kit switched off spawns with an untouched environment', () => {
  withStubs({ build: () => null }, (calls) => {
    const mgr = manager();
    const before = mgr.create(Object.assign({}, BASE, { settings: {} }));
    assert.ok(before.sessionId.length > 0);

    const spawned = calls.spawn[0];
    assert.strictEqual('ZDOTDIR' in spawned.options.env, false);
    assert.strictEqual('JOSH_KIT_FILE' in spawned.options.env, false);
    assert.strictEqual('PROMPT_COMMAND' in spawned.options.env, false);
  });
});

test('a kit that declines does not add arguments either', () => {
  let withKit = null;
  let without = null;
  withStubs({ build: () => null }, (calls) => {
    manager().create(Object.assign({}, BASE, { settings: {} }));
    without = calls.spawn[0].args;
  });
  withStubs({ build: () => ({ env: {}, args: [], dispose: () => {} }) }, (calls) => {
    manager().create(Object.assign({}, BASE, { settings: { shellKit: true } }));
    withKit = calls.spawn[0].args;
  });
  assert.deepStrictEqual(withKit, without);
});

/* ------------------------------------------------------ a kit that works */

test('the kit environment is merged over the sanitized one, and its args appended', () => {
  withStubs({
    build: () => ({
      env: { ZDOTDIR: '/tmp/kit', JOSH_REAL_ZDOTDIR: '/home/ada' },
      args: ['-NoExit', '-Command', '. kit'],
      dispose: () => {},
    }),
  }, (calls) => {
    manager().create(Object.assign({}, BASE, { settings: { shellKit: true } }));
    const spawned = calls.spawn[0];

    assert.strictEqual(spawned.options.env.ZDOTDIR, '/tmp/kit');
    assert.strictEqual(spawned.options.env.JOSH_REAL_ZDOTDIR, '/home/ada');
    assert.strictEqual(spawned.options.env.TERM_PROGRAM, 'Josh', 'sanitizeEnv still applies');
    assert.deepStrictEqual(spawned.args.slice(-3), ['-NoExit', '-Command', '. kit']);
  });
});

/* ------------------------------------------------------ a kit that breaks */

test('a kit that throws still yields a working session', () => {
  withStubs({
    build: () => { throw new Error('deliberate failure inside the kit'); },
  }, (calls) => {
    const session = manager().create(
      Object.assign({}, BASE, { settings: { shellKit: true } })
    );
    assert.ok(session.sessionId.length > 0, 'a broken kit must not cost a terminal');
    assert.strictEqual(calls.spawn.length, 1, 'and the shell must still be spawned');
  });
});

test('a kit that throws leaves the environment exactly as it would have been', () => {
  withStubs({ build: () => { throw new Error('boom'); } }, (calls) => {
    manager().create(Object.assign({}, BASE, { settings: { shellKit: true } }));
    assert.strictEqual('ZDOTDIR' in calls.spawn[0].options.env, false);
  });
});

/* ------------------------------------------------------------- teardown */

test('dispose runs when the session is killed, exactly once', () => {
  let disposed = 0;
  withStubs({
    build: () => ({ env: {}, args: [], dispose: () => { disposed += 1; } }),
  }, () => {
    const mgr = manager();
    const session = mgr.create(Object.assign({}, BASE, { settings: { shellKit: true } }));
    assert.strictEqual(disposed, 0, 'not while the session is alive');

    mgr.kill(1, session.sessionId);
    assert.strictEqual(disposed, 1);

    mgr.disposeAll();
    assert.strictEqual(disposed, 1, 'and not again on a second teardown path');
  });
});

test('dispose runs when the shell exits on its own', () => {
  let disposed = 0;
  withStubs({
    build: () => ({ env: {}, args: [], dispose: () => { disposed += 1; } }),
  }, (calls) => {
    const mgr = manager();
    mgr.create(Object.assign({}, BASE, { settings: { shellKit: true } }));

    // The shell exited by itself: the same path _destroy runs from.
    calls.pty.onExit({ exitCode: 0 });
    assert.strictEqual(disposed, 1);
    mgr.disposeAll();
  });
});

test('a failed spawn cleans the kit up rather than leaking it', () => {
  let disposed = 0;
  withStubs({
    build: () => ({ env: {}, args: [], dispose: () => { disposed += 1; } }),
    spawn: () => { throw new Error('no such shell'); },
  }, () => {
    const mgr = manager();
    assert.throws(() => mgr.create(Object.assign({}, BASE, { settings: { shellKit: true } })));
    assert.strictEqual(disposed, 1);
    mgr.disposeAll();
  });
});
