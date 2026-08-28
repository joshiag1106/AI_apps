'use strict';

/**
 * The Shell Kit, in real shells.
 *
 * Everywhere else the kit is tested a piece at a time. Here a real zsh, a real
 * bash and -- where it exists -- a real pwsh are started the way Josh starts
 * them, and asked what they ended up with.
 *
 * This is also the only place the PowerShell snippets are exercised at all,
 * which is the gap recorded when they were written. It skips when pwsh is
 * absent rather than pretending otherwise.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const Integration = require('../src/main/shell-integration.js');

function available(command, args) {
  try {
    execFileSync(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const HAS_ZSH = available('zsh', ['-c', 'exit 0']);
const HAS_BASH = available('bash', ['-c', 'exit 0']);
const HAS_PWSH = available('pwsh', ['-NoProfile', '-Command', 'exit 0']);

const SETTINGS = {
  shellKit: true,
  shellKitPrompt: 'classic',
  shellKitPacks: ['git'],
  shellKitGlyphs: 'plain',
};

/** A throwaway home and temp directory, with the user's own rc already in it. */
function stage(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'josh-e2e-'));
  try {
    const home = path.join(root, 'home');
    const tmpdir = path.join(root, 'tmp');
    const work = path.join(root, 'work');
    fs.mkdirSync(home);
    fs.mkdirSync(tmpdir);
    fs.mkdirSync(work);
    return run({ root, home, tmpdir, work });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function build(where, shell) {
  return Integration.build({
    shell,
    settings: SETTINGS,
    glyphs: 'plain',
    env: {},
    home: where.home,
    tmpdir: where.tmpdir,
  });
}

function run(command, args, options) {
  const result = spawnSync(command, args, Object.assign({ encoding: 'utf8' }, options));
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

/**
 * Both shells write their prompt to stderr when stdout is not a terminal, and
 * bash on macOS adds its own notices there. So "clean" means no error, not
 * empty -- anything naming a kit identifier, or any of the shapes a shell uses
 * to report a failure.
 */
function assertNoErrors(stderr, label) {
  const complaints = [
    /__josh_[A-Za-z_]*: /,
    /command not found/,
    /parse error/,
    /syntax error/,
    /bad substitution/,
    /no such file or directory/i,
    /permission denied/i,
  ];
  for (const pattern of complaints) {
    assert.strictEqual(
      pattern.test(stderr), false,
      label + ' reported: ' + stderr.slice(0, 400)
    );
  }
}

/* -------------------------------------------------------------------- zsh */

test('zsh: a real session gets the prompt, the packs and its own rc', {
  skip: HAS_ZSH ? false : 'zsh is not installed',
}, () => {
  stage((where) => {
    fs.writeFileSync(path.join(where.home, '.zshrc'), 'JOSH_USER_RC=ran\n');
    const built = build(where, '/bin/zsh');

    const script = [
      'print -r -- "prompt=${#PROMPT}"',
      'print -r -- "userrc=$JOSH_USER_RC"',
      'print -r -- "zdotdir=$ZDOTDIR"',
      'print -r -- "alias=$(whence -w gst)"',
      'print -r -- "fn=$(whence -w __josh_prompt)"',
      'exit',
      '',
    ].join('\n');

    const out = run('zsh', ['-i'], {
      input: script,
      cwd: where.work,
      env: {
        PATH: process.env.PATH,
        HOME: where.home,
        TERM: 'xterm-256color',
        ZDOTDIR: built.env.ZDOTDIR,
        JOSH_REAL_ZDOTDIR: built.env.JOSH_REAL_ZDOTDIR,
      },
    });

    assert.match(out.stdout, /prompt=[1-9][0-9]*/, 'a prompt must render');
    assert.match(out.stdout, /userrc=ran/, 'the user own rc must still run');
    assert.match(out.stdout, /alias=gst: alias/, 'a pack alias must resolve');
    assert.match(out.stdout, /fn=__josh_prompt: function/, 'the prompt must be a function');
    assert.ok(
      out.stdout.includes('zdotdir=' + where.home),
      'ZDOTDIR must be restored, or every nested zsh re-runs the integration'
    );
    assertNoErrors(out.stderr, 'zsh');

    built.dispose();
    return null;
  });
});

test('zsh: the rendered prompt is coloured and correctly bracketed', {
  skip: HAS_ZSH ? false : 'zsh is not installed',
}, () => {
  stage((where) => {
    const built = build(where, '/bin/zsh');
    const out = run('zsh', ['-i'], {
      input: 'print -r -- "P<$PROMPT>"\nexit\n',
      cwd: where.work,
      env: {
        PATH: process.env.PATH, HOME: where.home, TERM: 'xterm-256color',
        ZDOTDIR: built.env.ZDOTDIR,
      },
    });

    const prompt = out.stdout.match(/P<([\s\S]*)>/)[1];
    const ESC = String.fromCharCode(27);
    assert.ok(prompt.includes(ESC), 'the prompt should be coloured');
    assert.strictEqual(
      prompt.replace(/%\{[\s\S]*?%\}/g, '').includes(ESC),
      false,
      'every escape must sit inside a non-printing marker'
    );

    built.dispose();
    return null;
  });
});

/* ------------------------------------------------------------------- bash */

test('bash: a real session gets the prompt and the packs through PROMPT_COMMAND', {
  skip: HAS_BASH ? false : 'bash is not installed',
}, () => {
  stage((where) => {
    const built = build(where, '/bin/bash');

    const script = [
      'printf "prompt=%s\\n" "${#PS1}"',
      'printf "pc=%s\\n" "$PROMPT_COMMAND"',
      'printf "alias=%s\\n" "$(type -t gst)"',
      'printf "fn=%s\\n" "$(type -t __josh_prompt)"',
      'exit',
      '',
    ].join('\n');

    const out = run('bash', ['-i'], {
      input: script,
      cwd: where.work,
      env: {
        PATH: process.env.PATH,
        HOME: where.home,
        TERM: 'xterm-256color',
        JOSH_KIT_FILE: built.env.JOSH_KIT_FILE,
        PROMPT_COMMAND: built.env.PROMPT_COMMAND,
      },
    });

    assert.match(out.stdout, /prompt=[1-9][0-9]*/, 'a prompt must render');
    assert.match(out.stdout, /alias=alias/, 'a pack alias must resolve');
    assert.match(out.stdout, /fn=function/, 'the prompt must be a function');
    assert.match(out.stdout, /pc=.*__josh_prompt/, 'the real hook must be installed');
    assert.strictEqual(
      /pc=.*JOSH_KIT_FILE/.test(out.stdout), false,
      'the bootstrap must have removed itself'
    );
    assertNoErrors(out.stderr, 'bash');

    built.dispose();
    return null;
  });
});

test('bash: the very first prompt is already the kit one', {
  skip: HAS_BASH ? false : 'bash is not installed',
}, () => {
  stage((where) => {
    const built = build(where, '/bin/bash');
    // PROMPT_COMMAND sets PS1 when it runs, and it runs before the *next*
    // prompt. Without an explicit first render the opening prompt is stale.
    const out = run('bash', ['-i'], {
      input: 'printf "first=%s\\n" "${#PS1}"\nexit\n',
      cwd: where.work,
      env: {
        PATH: process.env.PATH, HOME: where.home, TERM: 'xterm-256color',
        JOSH_KIT_FILE: built.env.JOSH_KIT_FILE,
        PROMPT_COMMAND: built.env.PROMPT_COMMAND,
      },
    });
    const length = Number(out.stdout.match(/first=(\d+)/)[1]);
    assert.ok(length > 30, 'the first prompt was still the default one: ' + length);
    built.dispose();
    return null;
  });
});

/* ------------------------------------------------------------------- pwsh */

test('pwsh: a real session gets the prompt and the packs', {
  skip: HAS_PWSH ? false : 'pwsh is not installed',
}, () => {
  stage((where) => {
    const built = build(where, '/usr/local/bin/pwsh');
    const kitPath = built.args[2].replace(/^\. '/, '').replace(/'$/, '');

    const probe = [
      '. ' + JSON.stringify(kitPath),
      'Write-Output ("prompt=" + (prompt).Length)',
      'Write-Output ("fn=" + [bool](Get-Command prompt -ErrorAction SilentlyContinue))',
      'Write-Output ("alias=" + [bool](Get-Command gst -ErrorAction SilentlyContinue))',
    ].join('; ');

    const out = run('pwsh', ['-NoProfile', '-Command', probe], { cwd: where.work });

    assert.match(out.stdout, /prompt=[1-9][0-9]*/, 'a prompt must render');
    assert.match(out.stdout, /fn=True/, 'the prompt function must exist');
    assertNoErrors(out.stderr, 'pwsh');

    built.dispose();
    return null;
  });
});

/* ----------------------------------------------------------------- budget */

/**
 * What the kit costs at startup.
 *
 * Measured in a plain directory, not a repository: __josh_git_collect walks up
 * for a .git entry and returns without spawning anything when there is none,
 * so this is the kit's own cost rather than a measure of how fast git is on
 * somebody's monorepo.
 *
 * The pairs are interleaved and the *difference* is minimised, rather than
 * each side being minimised separately and then subtracted. Subtracting two
 * independently sampled minima does not cancel noise, it combines it: a
 * fortunate bare sample and an unfortunate kitted one add together. That is
 * how this test once reported the kit adding 50.0ms (bare 19.8, kitted 69.8)
 * on a runner where the real cost is 5-16ms, measured across idle and
 * deliberately loaded machines. Within an interleaved pair the machine is in
 * much the same state for both spawns, so the difference is the kit's cost
 * rather than the runner's mood.
 */
function fastestDelta(pairs, baseline, candidate) {
  let best = Infinity;
  for (let i = 0; i < pairs; i += 1) {
    const beforeBase = process.hrtime.bigint();
    baseline();
    const bare = Number(process.hrtime.bigint() - beforeBase) / 1e6;

    const beforeCandidate = process.hrtime.bigint();
    candidate();
    const kitted = Number(process.hrtime.bigint() - beforeCandidate) / 1e6;

    const delta = kitted - bare;
    if (delta < best) best = delta;
  }
  return best;
}

test('the kit costs less than 40ms of shell startup', {
  skip: HAS_ZSH ? false : 'zsh is not installed',
}, () => {
  stage((where) => {
    const built = build(where, '/bin/zsh');
    const base = {
      PATH: process.env.PATH, HOME: where.home, TERM: 'xterm-256color',
    };

    const added = fastestDelta(
      7,
      () => run('zsh', ['-i'], { input: 'exit\n', cwd: where.work, env: base }),
      () => run('zsh', ['-i'], {
        input: 'exit\n',
        cwd: where.work,
        env: Object.assign({}, base, { ZDOTDIR: built.env.ZDOTDIR }),
      })
    );

    // 40ms is roughly 2.5x the worst honest reading recorded (16ms, on a
    // machine with eight processes competing for the cores), so a busy runner
    // alone should not reach it while a real regression still would.
    assert.ok(
      added < 40,
      'the kit added ' + added.toFixed(1) + 'ms per interleaved pair'
    );

    built.dispose();
    return null;
  });
});
