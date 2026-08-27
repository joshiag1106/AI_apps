'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const Integration = require('../src/main/shell-integration.js');

function hasZsh() {
  try {
    execFileSync('zsh', ['-c', 'exit 0'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const ZSH = hasZsh();

/** A scratch root that stands in for both the OS temp dir and a user's home. */
function scratch(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'josh-integration-'));
  try {
    const tmpdir = path.join(root, 'tmp');
    const home = path.join(root, 'home');
    fs.mkdirSync(tmpdir);
    fs.mkdirSync(home);
    return run({ root, tmpdir, home });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function buildZsh(where, overrides) {
  return Integration.build(Object.assign({
    shell: '/bin/zsh',
    settings: { shellKit: true, shellKitTheme: 'classic', shellKitPacks: ['git'] },
    glyphs: 'plain',
    env: {},
    home: where.home,
    tmpdir: where.tmpdir,
  }, overrides || {}));
}

/** The directory the built env points zsh at. */
function kitDir(built) {
  return built.env.ZDOTDIR;
}

/* --------------------------------------------------------------- dialects */

test('a shell path resolves to the dialect it speaks', () => {
  assert.strictEqual(Integration.dialectFor('/bin/zsh'), 'zsh');
  assert.strictEqual(Integration.dialectFor('/usr/local/bin/bash'), 'bash');
  assert.strictEqual(Integration.dialectFor('C:\\Program Files\\PowerShell\\7\\pwsh.exe'), 'pwsh');
});

test('Windows PowerShell 5.1 is not a dialect the kit speaks', () => {
  assert.strictEqual(Integration.dialectFor('C:\\Windows\\System32\\powershell.exe'), null);
});

test('an unknown or missing shell yields no dialect at all', () => {
  for (const value of ['/usr/bin/fish', '/bin/sh', '', null, undefined, 42]) {
    assert.strictEqual(Integration.dialectFor(value), null, String(value));
  }
});

/* ---------------------------------------------------------- staying away */

test('the kit stays out of the way unless it is switched on', () => {
  scratch((where) => {
    assert.strictEqual(buildZsh(where, { settings: {} }), null);
    assert.strictEqual(buildZsh(where, { settings: { shellKit: false } }), null);
    return null;
  });
});

test('an explicit shellArgs is a choice Josh must not override', () => {
  scratch((where) => {
    const built = buildZsh(where, {
      settings: {
        shellKit: true, shellKitTheme: 'classic', shellKitPacks: [],
        shellArgs: ['-f'],
      },
    });
    assert.strictEqual(built, null);
    assert.deepStrictEqual(fs.readdirSync(where.tmpdir), [], 'nothing should be written');
    return null;
  });
});

test('an empty shellArgs is not an explicit choice', () => {
  scratch((where) => {
    const built = buildZsh(where, {
      settings: {
        shellKit: true, shellKitTheme: 'classic', shellKitPacks: [], shellArgs: [],
      },
    });
    assert.notStrictEqual(built, null);
    built.dispose();
    return null;
  });
});

test('a shell the kit does not speak changes nothing', () => {
  scratch((where) => {
    assert.strictEqual(buildZsh(where, { shell: '/usr/bin/fish' }), null);
    assert.deepStrictEqual(fs.readdirSync(where.tmpdir), []);
    return null;
  });
});

test('a temp directory that cannot be created returns null rather than throwing', () => {
  scratch((where) => {
    const missing = path.join(where.root, 'no', 'such', 'place');
    let built;
    assert.doesNotThrow(() => {
      built = buildZsh(where, { tmpdir: missing });
    });
    assert.strictEqual(built, null);
    return null;
  });
});

/* ------------------------------------------------------------ what it writes */

test('all four zsh files are generated, and no zlogin', () => {
  scratch((where) => {
    const built = buildZsh(where);
    const dir = kitDir(built);
    const written = fs.readdirSync(dir).sort();
    assert.deepStrictEqual(written, ['.zprofile', '.zshenv', '.zshrc', 'josh-kit.zsh']);
    assert.strictEqual(fs.existsSync(path.join(dir, '.zlogin')), false,
      'a generated .zlogin would shadow the user own');
    built.dispose();
    return null;
  });
});

test('the directory is 0700 and every file inside it is 0600', () => {
  scratch((where) => {
    const built = buildZsh(where);
    const dir = kitDir(built);
    assert.strictEqual(fs.statSync(dir).mode & 0o777, Integration.DIR_MODE);
    for (const name of fs.readdirSync(dir)) {
      assert.strictEqual(
        fs.statSync(path.join(dir, name)).mode & 0o777,
        Integration.FILE_MODE,
        name
      );
    }
    built.dispose();
    return null;
  });
});

test('the directory name is unpredictable', () => {
  scratch((where) => {
    const first = buildZsh(where);
    const second = buildZsh(where);
    assert.notStrictEqual(kitDir(first), kitDir(second));
    assert.match(path.basename(kitDir(first)), /^josh-kit-[0-9a-f]{32}$/);
    first.dispose();
    second.dispose();
    return null;
  });
});

test('every generated file sources the user own counterpart first', () => {
  scratch((where) => {
    const built = buildZsh(where);
    const dir = kitDir(built);
    for (const name of ['.zshenv', '.zprofile', '.zshrc']) {
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      const sourceAt = text.indexOf('$JOSH_REAL_ZDOTDIR/' + name);
      assert.ok(sourceAt > 0, name + ' must source the user file');
      const kitAt = text.indexOf('josh-kit.zsh');
      if (kitAt !== -1) {
        assert.ok(sourceAt < kitAt, name + ' must source the user file before the kit');
      }
    }
    built.dispose();
    return null;
  });
});

test('a user with a real ZDOTDIR has it forwarded and restored', () => {
  scratch((where) => {
    const real = path.join(where.root, 'dotdir');
    fs.mkdirSync(real);
    const built = buildZsh(where, { env: { ZDOTDIR: real } });

    assert.strictEqual(built.env.JOSH_REAL_ZDOTDIR, real);
    const rc = fs.readFileSync(path.join(kitDir(built), '.zshrc'), 'utf8');
    assert.ok(rc.includes("JOSH_REAL_ZDOTDIR='" + real + "'"), 'the real value must be recorded');
    assert.ok(rc.includes('export ZDOTDIR=$JOSH_REAL_ZDOTDIR'), 'and restored on the way out');
    built.dispose();
    return null;
  });
});

test('a user with no ZDOTDIR gets HOME', () => {
  scratch((where) => {
    const built = buildZsh(where, { env: {} });
    assert.strictEqual(built.env.JOSH_REAL_ZDOTDIR, where.home);
    built.dispose();
    return null;
  });
});

test('zsh is pointed at the generated directory, and given no extra arguments', () => {
  scratch((where) => {
    const built = buildZsh(where);
    assert.strictEqual(built.env.ZDOTDIR, kitDir(built));
    assert.deepStrictEqual(built.args, []);
    built.dispose();
    return null;
  });
});

test('the emitted kit reflects the chosen theme and packs', () => {
  scratch((where) => {
    const built = buildZsh(where, {
      settings: { shellKit: true, shellKitTheme: 'stack', shellKitPacks: ['git'] },
    });
    const kit = fs.readFileSync(path.join(kitDir(built), 'josh-kit.zsh'), 'utf8');
    assert.ok(kit.includes("__josh_alias 'gst' 'git status'"), 'the git pack should be present');
    assert.ok(kit.includes('%{$__josh_c_reset%}'), 'zsh markers should be present');
    built.dispose();
    return null;
  });
});

test('an unknown theme name falls back rather than failing the session', () => {
  scratch((where) => {
    const built = buildZsh(where, {
      settings: { shellKit: true, shellKitTheme: '../../etc/passwd', shellKitPacks: [] },
    });
    assert.notStrictEqual(built, null);
    assert.strictEqual(
      fs.readFileSync(path.join(kitDir(built), 'josh-kit.zsh'), 'utf8').includes('passwd'),
      false
    );
    built.dispose();
    return null;
  });
});

test('dispose removes the whole tree, and is safe to call twice', () => {
  scratch((where) => {
    const built = buildZsh(where);
    const dir = kitDir(built);
    assert.strictEqual(fs.existsSync(dir), true);
    built.dispose();
    assert.strictEqual(fs.existsSync(dir), false);
    assert.doesNotThrow(() => built.dispose());
    return null;
  });
});

/* ------------------------------------------------------- a real zsh, really */

test('a real zsh sources the user config, installs the kit, and restores ZDOTDIR', {
  skip: ZSH ? false : 'zsh is not installed',
}, () => {
  scratch((where) => {
    const real = path.join(where.root, 'dotdir');
    fs.mkdirSync(real);
    fs.writeFileSync(path.join(real, '.zshrc'), 'JOSH_USER_RC_RAN=yes\n');

    const built = buildZsh(where, { env: { ZDOTDIR: real } });
    const dir = kitDir(built);

    const probe = [
      '. ' + JSON.stringify(path.join(dir, '.zshrc')),
      'print -r -- "userrc=$JOSH_USER_RC_RAN"',
      'print -r -- "zdotdir=$ZDOTDIR"',
      'if typeset -f __josh_prompt >/dev/null; then print -r -- "prompt=yes"; fi',
      'if alias gst >/dev/null 2>&1; then print -r -- "alias=yes"; fi',
      '__josh_prompt',
      'print -r -- "rendered=${#PROMPT}"',
    ].join('\n');

    const out = execFileSync('zsh', ['-c', probe], {
      cwd: where.root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    assert.match(out, /userrc=yes/, 'the user own .zshrc must run');
    assert.match(out, new RegExp('zdotdir=' + real.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'ZDOTDIR must be restored, or every nested zsh re-runs the integration');
    assert.match(out, /prompt=yes/, 'the prompt function must be installed');
    assert.match(out, /alias=yes/, 'the git pack must be installed');
    assert.match(out, /rendered=[1-9][0-9]*/, 'the prompt must render to something');

    built.dispose();
    return null;
  });
});
