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

/**
 * Assert a POSIX permission mode, on the filesystems that have them.
 *
 * Windows implements no POSIX permission bits: Node's `mode` option to mkdir
 * and writeFile is ignored on NTFS, and statSync reports 0o666 whatever was
 * requested. Asserting 0o700/0o600 there tests the filesystem, not Josh.
 *
 * The modes still matter - these files carry a per-session nonce - so they
 * stay asserted on macOS and Linux, which is every platform where the bits
 * exist at all.
 */
const POSIX_MODES = process.platform !== 'win32';

function assertMode(actual, expected, message) {
  if (POSIX_MODES) assert.strictEqual(actual, expected, message);
}

function hasBash() {
  try {
    execFileSync('bash', ['-c', 'exit 0'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const BASH = hasBash();

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
    settings: { shellKit: true, shellKitPrompt: 'classic', shellKitPacks: ['git'] },
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
        shellKit: true, shellKitPrompt: 'classic', shellKitPacks: [],
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
        shellKit: true, shellKitPrompt: 'classic', shellKitPacks: [], shellArgs: [],
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
    assertMode(fs.statSync(dir).mode & 0o777, Integration.DIR_MODE);
    for (const name of fs.readdirSync(dir)) {
      assertMode(
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
      settings: { shellKit: true, shellKitPrompt: 'stack', shellKitPacks: ['git'] },
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
      settings: { shellKit: true, shellKitPrompt: '../../etc/passwd', shellKitPacks: [] },
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

/* ------------------------------------------------------------------- bash */

function buildBash(where, overrides) {
  return Integration.build(Object.assign({
    shell: '/bin/bash',
    settings: { shellKit: true, shellKitPrompt: 'classic', shellKitPacks: ['git'] },
    glyphs: 'plain',
    env: {},
    home: where.home,
    tmpdir: where.tmpdir,
  }, overrides || {}));
}

test('bash gets its hook through the environment, and no extra arguments', () => {
  scratch((where) => {
    const built = buildBash(where);
    assert.deepStrictEqual(built.args, [], '--rcfile is ignored for login shells');
    assert.strictEqual(built.env.PROMPT_COMMAND, Integration.BASH_BOOTSTRAP);
    assert.match(built.env.JOSH_KIT_FILE, /josh-kit\.bash$/);
    assert.strictEqual(fs.existsSync(built.env.JOSH_KIT_FILE), true);
    built.dispose();
    return null;
  });
});

test('the bash bootstrap carries no glob metacharacter, so it can be matched literally', () => {
  for (const character of ['*', '?', '[', ']', '\\']) {
    assert.strictEqual(
      Integration.BASH_BOOTSTRAP.includes(character),
      false,
      'bootstrap contains ' + character
    );
  }
});

test('the bash kit takes the bootstrap back out of PROMPT_COMMAND', () => {
  scratch((where) => {
    const built = buildBash(where);
    const kit = fs.readFileSync(built.env.JOSH_KIT_FILE, 'utf8');
    assert.ok(kit.includes('PROMPT_COMMAND=${PROMPT_COMMAND/"$__josh_boot"/}'),
      'the hook must disarm itself after its one run');
    const removeAt = kit.indexOf('$__josh_boot');
    const installAt = kit.indexOf('__josh_prompt${PROMPT_COMMAND');
    assert.ok(removeAt !== -1 && installAt !== -1);
    assert.ok(removeAt < installAt, 'disarm before installing, or the install is undone');
    built.dispose();
    return null;
  });
});

test('a real bash disarms the bootstrap and keeps what the user appended', {
  skip: BASH ? false : 'bash is not installed',
}, () => {
  scratch((where) => {
    const built = buildBash(where);
    const probe = [
      'JOSH_KIT_FILE=' + JSON.stringify(built.env.JOSH_KIT_FILE),
      // Exactly what bash holds when a .bashrc appended to the inherited hook.
      'PROMPT_COMMAND=' + JSON.stringify(Integration.BASH_BOOTSTRAP + '; echo mine >/dev/null'),
      'eval "$PROMPT_COMMAND"',
      'printf "pc=%s\\n" "$PROMPT_COMMAND"',
      'if declare -F __josh_prompt >/dev/null; then printf "prompt=yes\\n"; fi',
      'if alias gst >/dev/null 2>&1; then printf "alias=yes\\n"; fi',
      '__josh_prompt',
      'printf "rendered=%s\\n" "${#PS1}"',
    ].join('\n');

    const out = execFileSync('bash', ['-c', probe], {
      cwd: where.root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    assert.match(out, /prompt=yes/, 'the prompt function must be installed');
    assert.match(out, /alias=yes/, 'the git pack must be installed');
    assert.match(out, /rendered=[1-9][0-9]*/, 'the prompt must render to something');

    const line = out.match(/pc=(.*)/)[1];
    assert.strictEqual(line.includes(Integration.BASH_BOOTSTRAP), false,
      'the bootstrap must remove itself');
    assert.ok(line.includes('echo mine'), 'what the user appended must survive');
    assert.ok(line.includes('__josh_prompt'), 'the real hook must be installed');

    built.dispose();
    return null;
  });
});

test('a bashrc that assigns PROMPT_COMMAND wipes the hook, and Josh does nothing', {
  skip: BASH ? false : 'bash is not installed',
}, () => {
  scratch((where) => {
    const built = buildBash(where);
    const probe = [
      'JOSH_KIT_FILE=' + JSON.stringify(built.env.JOSH_KIT_FILE),
      'PROMPT_COMMAND=' + JSON.stringify(Integration.BASH_BOOTSTRAP),
      // The documented caveat: an assignment, not an append.
      'PROMPT_COMMAND="echo mine >/dev/null"',
      'eval "$PROMPT_COMMAND"',
      'if declare -F __josh_prompt >/dev/null; then printf "prompt=yes\\n"; ',
      'else printf "prompt=no\\n"; fi',
    ].join('\n');

    const out = execFileSync('bash', ['-c', probe], {
      cwd: where.root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.match(out, /prompt=no/, 'nothing at all, rather than half-applied');
    built.dispose();
    return null;
  });
});

/* ------------------------------------------------------------------- pwsh */

test('pwsh is driven by arguments, and its environment is left alone', () => {
  scratch((where) => {
    const built = Integration.build({
      shell: '/usr/local/bin/pwsh',
      settings: { shellKit: true, shellKitPrompt: 'classic', shellKitPacks: ['git'] },
      glyphs: 'plain',
      env: {},
      home: where.home,
      tmpdir: where.tmpdir,
    });

    assert.deepStrictEqual(built.env, {}, 'profiles load before -Command; no env needed');
    assert.strictEqual(built.args[0], '-NoExit');
    assert.strictEqual(built.args[1], '-Command');
    assert.match(built.args[2], /^\. '.*josh-kit\.ps1'$/);

    const scriptPath = built.args[2].replace(/^\. '/, '').replace(/'$/, '');
    const kit = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(kit.includes('function global:prompt'), 'a pwsh prompt must be defined');
    assertMode(fs.statSync(scriptPath).mode & 0o777, Integration.FILE_MODE);
    built.dispose();
    return null;
  });
});

test('Windows PowerShell 5.1 gets nothing, its VT processing being off', () => {
  scratch((where) => {
    const built = Integration.build({
      shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      settings: { shellKit: true, shellKitPrompt: 'classic', shellKitPacks: [] },
      env: {}, home: where.home, tmpdir: where.tmpdir,
    });
    assert.strictEqual(built, null);
    assert.deepStrictEqual(fs.readdirSync(where.tmpdir), []);
    return null;
  });
});

test('fish gets nothing, being out of this spec rather than unsupported forever', () => {
  scratch((where) => {
    assert.strictEqual(buildBash(where, { shell: '/usr/local/bin/fish' }), null);
    return null;
  });
});

/* ------------------------------------------------------------ glyph mode */

test('auto defers to what the renderer measured', () => {
  assert.strictEqual(Integration.glyphsFor({ shellKitGlyphs: 'auto' }, 'rich'), 'rich');
  assert.strictEqual(Integration.glyphsFor({ shellKitGlyphs: 'auto' }, 'plain'), 'plain');
  assert.strictEqual(Integration.glyphsFor({}, 'rich'), 'rich');
});

test('an explicit choice overrides the measurement, having better information', () => {
  assert.strictEqual(Integration.glyphsFor({ shellKitGlyphs: 'plain' }, 'rich'), 'plain');
  assert.strictEqual(Integration.glyphsFor({ shellKitGlyphs: 'rich' }, 'plain'), 'rich');
});

test('anything else is treated as auto, and an unmeasured font as plain', () => {
  for (const junk of ['powerline', '', null, 42]) {
    assert.strictEqual(Integration.glyphsFor({ shellKitGlyphs: junk }, 'rich'), 'rich');
  }
  assert.strictEqual(Integration.glyphsFor({}, undefined), 'plain');
});

test('the emitted kit carries the settings that shape it', () => {
  scratch((where) => {
    const built = buildZsh(where, {
      settings: {
        shellKit: true, shellKitPrompt: 'classic', shellKitPacks: [],
        shellKitGitUntracked: false, shellKitGitSkip: ['/mnt/slow'],
        shellKitSafeRemove: true,
      },
    });
    const kit = fs.readFileSync(path.join(kitDir(built), 'josh-kit.zsh'), 'utf8');
    assert.ok(kit.includes("JOSH_GIT_UNTRACKED_FLAG='--untracked-files=no'"));
    assert.ok(kit.includes("JOSH_GIT_SKIP='/mnt/slow'"));
    assert.ok(kit.includes("alias rm='rm -i'"));
    built.dispose();
    return null;
  });
});

/* ------------------------------------------------------- the optional export */

/** Every file under a root, relative and sorted, for before/after comparison. */
function treeOf(root) {
  const out = [];
  (function walk(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const rel = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) walk(path.join(directory, entry.name), rel);
      else out.push(rel);
    }
  })(root, '');
  return out.sort();
}

test('the export writes all three dialects where they can be sourced', () => {
  scratch((where) => {
    const built = buildZsh(where);
    const dir = Integration.exportDirFor(where.home);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['init.bash', 'init.ps1', 'init.zsh']);
    built.dispose();
    return null;
  });
});

test('the export is 0600 inside a 0700 directory, like everything else', () => {
  scratch((where) => {
    const built = buildZsh(where);
    const dir = Integration.exportDirFor(where.home);
    assertMode(fs.statSync(dir).mode & 0o777, Integration.DIR_MODE);
    for (const name of fs.readdirSync(dir)) {
      assertMode(fs.statSync(path.join(dir, name)).mode & 0o777, Integration.FILE_MODE, name);
    }
    built.dispose();
    return null;
  });
});

test('the export lives under the config directory and nowhere else', () => {
  scratch((where) => {
    const expected = path.join(where.home, '.config', 'josh', 'shell-kit');
    assert.strictEqual(Integration.exportDirFor(where.home), expected);

    const before = treeOf(where.home);
    const built = buildZsh(where);
    const after = treeOf(where.home);

    const added = after.filter((file) => !before.includes(file));
    assert.ok(added.length > 0, 'the export should have written something');
    for (const file of added) {
      assert.ok(file.startsWith('.config/josh/'), 'wrote outside the config directory: ' + file);
    }
    built.dispose();
    return null;
  });
});

test('no dotfile is written, ever', () => {
  scratch((where) => {
    const built = buildZsh(where);
    for (const name of ['.zshrc', '.zshenv', '.zprofile', '.bashrc', '.bash_profile', '.profile']) {
      assert.strictEqual(
        fs.existsSync(path.join(where.home, name)), false,
        'Josh wrote ' + name
      );
    }
    built.dispose();
    return null;
  });
});

test('the bash export carries no bootstrap, having nothing to disarm', () => {
  scratch((where) => {
    const built = buildZsh(where);
    const exported = fs.readFileSync(
      path.join(Integration.exportDirFor(where.home), 'init.bash'), 'utf8'
    );
    assert.strictEqual(exported.includes('__josh_boot'), false);
    assert.ok(exported.includes('__josh_prompt'), 'but it must still install the prompt');
    built.dispose();
    return null;
  });
});

test('the export is rewritten when the settings behind it change', () => {
  scratch((where) => {
    const target = path.join(Integration.exportDirFor(where.home), 'init.zsh');

    const first = buildZsh(where, {
      settings: { shellKit: true, shellKitPrompt: 'classic', shellKitPacks: [] },
    });
    const before = fs.readFileSync(target, 'utf8');
    first.dispose();

    const second = buildZsh(where, {
      settings: { shellKit: true, shellKitPrompt: 'stack', shellKitPacks: ['git'] },
    });
    const after = fs.readFileSync(target, 'utf8');
    second.dispose();

    assert.notStrictEqual(before, after);
    assert.ok(after.includes("__josh_alias 'gst' 'git status'"), 'the new pack must be in it');
    return null;
  });
});

test('an unchanged export is left alone rather than rewritten', () => {
  scratch((where) => {
    const target = path.join(Integration.exportDirFor(where.home), 'init.zsh');

    const first = buildZsh(where);
    const stamp = fs.statSync(target).mtimeMs;
    first.dispose();

    const second = buildZsh(where);
    second.dispose();

    assert.strictEqual(fs.statSync(target).mtimeMs, stamp, 'identical content, no rewrite');
    return null;
  });
});

test('disabling the kit leaves the export alone rather than deleting it', () => {
  scratch((where) => {
    const built = buildZsh(where);
    built.dispose();
    const dir = Integration.exportDirFor(where.home);
    const before = fs.readdirSync(dir).sort();

    // The user may be sourcing these from another terminal right now.
    assert.strictEqual(buildZsh(where, { settings: { shellKit: false } }), null);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), before);
    return null;
  });
});

test('an export that cannot be written does not cost the session', () => {
  scratch((where) => {
    // A file where the config directory needs to be: mkdir will fail.
    const configDir = path.join(where.home, '.config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'josh'), 'not a directory');

    let built;
    assert.doesNotThrow(() => {
      built = buildZsh(where);
    });
    assert.notStrictEqual(built, null, 'the session must still work');
    assert.strictEqual(fs.existsSync(path.join(kitDir(built), 'josh-kit.zsh')), true);
    built.dispose();
    return null;
  });
});

test('a session with no home does not attempt an export', () => {
  scratch((where) => {
    const built = buildZsh(where, { home: '' });
    assert.notStrictEqual(built, null);
    built.dispose();
    return null;
  });
});
