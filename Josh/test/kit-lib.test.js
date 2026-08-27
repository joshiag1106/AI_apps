'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const KitLib = require('../src/shared/kit-lib.js');

const TAB = String.fromCharCode(9);

/** Which POSIX shells this machine actually has. CI has both; a contributor
 *  may have neither, and the suite must stay green either way. */
function available(shell) {
  try {
    execFileSync(shell, ['-c', 'exit 0'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const SHELLS = ['bash', 'zsh'].filter(available);

/** Run a driver script through a real shell, in a temp directory of its own. */
function withScript(body, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'josh-kit-'));
  try {
    const script = path.join(dir, 'driver.sh');
    fs.writeFileSync(script, body, { mode: 0o700 });
    return run(script, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function shellOut(shell, args, input) {
  return execFileSync(shell, args, {
    input: input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** Driver output is key=value lines; the first = separates them. */
function readPairs(stdout) {
  const out = {};
  for (const line of stdout.split('\n')) {
    if (line === '') continue;
    const at = line.indexOf('=');
    if (at === -1) continue;
    out[line.slice(0, at)] = line.slice(at + 1);
  }
  return out;
}

const REPORT = [
  'printf "branch=%s\\n" "$JOSH_GIT_BRANCH"',
  'printf "detached=%s\\n" "$JOSH_GIT_DETACHED"',
  'printf "ahead=%s\\n" "$JOSH_GIT_AHEAD"',
  'printf "behind=%s\\n" "$JOSH_GIT_BEHIND"',
  'printf "staged=%s\\n" "$JOSH_GIT_STAGED"',
  'printf "unstaged=%s\\n" "$JOSH_GIT_UNSTAGED"',
  'printf "untracked=%s\\n" "$JOSH_GIT_UNTRACKED"',
  'printf "conflicts=%s\\n" "$JOSH_GIT_CONFLICTS"',
].join('\n');

function parse(shell, fixtureText) {
  const script = KitLib.POSIX_GIT + '\n__josh_git_parse\n' + REPORT + '\n';
  return withScript(script, (driver) => readPairs(shellOut(shell, [driver], fixtureText)));
}

const OID = '1234567abcdef1234567890abcdef1234567890a';

function fixture(...records) {
  return records.join('\n') + '\n';
}

const HEAD_MAIN = [
  '# branch.oid ' + OID,
  '# branch.head main',
  '# branch.upstream origin/main',
];

/** A porcelain-v2 ordinary record. Only XY is read, but the rest is present
 *  so the fixture is a real line rather than a convenient shape. */
function ordinary(xy, file) {
  return '1 ' + xy + ' N... 100644 100644 100644 ' + OID + ' ' + OID + ' ' + file;
}

/**
 * Install [name, body] pairs through __josh_alias, reporting for each the
 * installer's exit status and whether the alias exists afterwards. Names and
 * bodies travel as arguments, never interpolated into the script, so a name
 * carrying punctuation is tested as data rather than as code.
 */
function aliasProbe(shell, pairs) {
  const script = [KitLib.POSIX_ALIAS, ''];
  for (let i = 0; i < pairs.length; i += 1) {
    const name = '"${' + (i * 2 + 1) + '}"';
    const body = '"${' + (i * 2 + 2) + '}"';
    script.push('__josh_alias ' + name + ' ' + body);
    script.push('printf "%s.status=%s\\n" ' + name + ' "$?"');
    script.push('if alias -- ' + name + ' >/dev/null 2>&1; then');
    script.push('  printf "%s.defined=1\\n" ' + name);
    script.push('else');
    script.push('  printf "%s.defined=0\\n" ' + name);
    script.push('fi');
  }
  return withScript(script.join('\n') + '\n', (driver) => {
    const args = [driver];
    for (const [name, body] of pairs) args.push(name, body);
    return readPairs(shellOut(shell, args));
  });
}

for (const shell of SHELLS) {
  test(shell + ': a clean tree reports its branch and nothing else', () => {
    const got = parse(shell, fixture(...HEAD_MAIN, '# branch.ab +0 -0'));
    assert.strictEqual(got.branch, 'main');
    assert.strictEqual(got.detached, '0');
    for (const key of ['ahead', 'behind', 'staged', 'unstaged', 'untracked', 'conflicts']) {
      assert.strictEqual(got[key], '0', key);
    }
  });

  test(shell + ': the index half and the worktree half of XY count separately', () => {
    const staged = parse(shell, fixture(...HEAD_MAIN, ordinary('M.', 'a.txt')));
    assert.strictEqual(staged.staged, '1');
    assert.strictEqual(staged.unstaged, '0');

    const unstaged = parse(shell, fixture(...HEAD_MAIN, ordinary('.M', 'a.txt')));
    assert.strictEqual(unstaged.staged, '0');
    assert.strictEqual(unstaged.unstaged, '1');

    const both = parse(shell, fixture(...HEAD_MAIN, ordinary('MM', 'a.txt')));
    assert.strictEqual(both.staged, '1');
    assert.strictEqual(both.unstaged, '1');
  });

  test(shell + ': several records accumulate rather than overwrite', () => {
    const got = parse(shell, fixture(
      ...HEAD_MAIN,
      ordinary('M.', 'a.txt'),
      ordinary('A.', 'b.txt'),
      ordinary('.M', 'c.txt')
    ));
    assert.strictEqual(got.staged, '2');
    assert.strictEqual(got.unstaged, '1');
  });

  test(shell + ': a rename record counts like any other staged change', () => {
    const record = '2 R. N... 100644 100644 100644 ' + OID + ' ' + OID
      + ' R100 new.txt' + TAB + 'old.txt';
    const got = parse(shell, fixture(...HEAD_MAIN, record));
    assert.strictEqual(got.staged, '1');
    assert.strictEqual(got.unstaged, '0');
  });

  test(shell + ': untracked files are counted, ignored files are not', () => {
    const got = parse(shell, fixture(...HEAD_MAIN, '? new.txt', '? other.txt', '! build/'));
    assert.strictEqual(got.untracked, '2');
    assert.strictEqual(got.staged, '0');
    assert.strictEqual(got.unstaged, '0');
  });

  test(shell + ': unmerged records are conflicts, not modifications', () => {
    const record = 'u UU N... 100644 100644 100644 100644 '
      + OID + ' ' + OID + ' ' + OID + ' both.txt';
    const got = parse(shell, fixture(...HEAD_MAIN, record));
    assert.strictEqual(got.conflicts, '1');
    assert.strictEqual(got.staged, '0');
    assert.strictEqual(got.unstaged, '0');
  });

  test(shell + ': a detached head reports the short oid, not a branch name', () => {
    const got = parse(shell, fixture(
      '# branch.oid ' + OID,
      '# branch.head (detached)'
    ));
    assert.strictEqual(got.detached, '1');
    assert.strictEqual(got.branch, OID.slice(0, 7));
  });

  test(shell + ': an unborn branch has no oid to shorten', () => {
    const got = parse(shell, fixture(
      '# branch.oid (initial)',
      '# branch.head main'
    ));
    assert.strictEqual(got.detached, '0');
    assert.strictEqual(got.branch, 'main');
  });

  test(shell + ': ahead and behind are both reported positive', () => {
    const ahead = parse(shell, fixture(...HEAD_MAIN, '# branch.ab +3 -0'));
    assert.strictEqual(ahead.ahead, '3');
    assert.strictEqual(ahead.behind, '0');

    const behind = parse(shell, fixture(...HEAD_MAIN, '# branch.ab +0 -2'));
    assert.strictEqual(behind.ahead, '0');
    assert.strictEqual(behind.behind, '2');

    const diverged = parse(shell, fixture(...HEAD_MAIN, '# branch.ab +4 -5'));
    assert.strictEqual(diverged.ahead, '4');
    assert.strictEqual(diverged.behind, '5');
  });

  test(shell + ': no upstream means zero counts, not missing output', () => {
    const got = parse(shell, fixture(
      '# branch.oid ' + OID,
      '# branch.head feature'
    ));
    assert.strictEqual(got.branch, 'feature');
    assert.strictEqual(got.ahead, '0');
    assert.strictEqual(got.behind, '0');
  });

  test(shell + ': a second parse does not inherit the first tree state', () => {
    const script = KitLib.POSIX_GIT + '\n'
      + '__josh_git_parse < "$1"\n'
      + 'printf "first=%s\\n" "$JOSH_GIT_STAGED"\n'
      + '__josh_git_parse < "$2"\n'
      + 'printf "second=%s\\n" "$JOSH_GIT_STAGED"\n'
      + 'printf "branch=%s\\n" "$JOSH_GIT_BRANCH"\n';
    const got = withScript(script, (driver, dir) => {
      const dirty = path.join(dir, 'dirty');
      const clean = path.join(dir, 'clean');
      fs.writeFileSync(dirty, fixture(...HEAD_MAIN, ordinary('M.', 'a.txt')));
      fs.writeFileSync(clean, fixture(...HEAD_MAIN));
      return readPairs(shellOut(shell, [driver, dirty, clean]));
    });
    assert.strictEqual(got.first, '1');
    assert.strictEqual(got.second, '0');
    assert.strictEqual(got.branch, 'main');
  });

  test(shell + ': the root walk finds the enclosing repository', () => {
    const script = KitLib.POSIX_GIT + '\n'
      + 'cd "$1" || exit 1\n'
      + 'if __josh_git_root; then printf "root=%s\\n" "$JOSH_GIT_ROOT"; fi\n'
      + 'printf "found=%s\\n" "$?"\n';
    const got = withScript(script, (driver, dir) => {
      const repo = path.join(dir, 'repo');
      const deep = path.join(repo, 'src', 'main');
      fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
      fs.mkdirSync(deep, { recursive: true });
      return readPairs(shellOut(shell, [driver, deep]));
    });
    assert.match(got.root, /repo$/);
  });

  test(shell + ': a directory outside any repository reports no root', () => {
    const script = KitLib.POSIX_GIT + '\n'
      + 'cd "$1" || exit 1\n'
      + 'if __josh_git_root; then printf "found=1\\n"; else printf "found=0\\n"; fi\n'
      + 'printf "root=[%s]\\n" "$JOSH_GIT_ROOT"\n';
    const got = withScript(script, (driver, dir) => {
      const plain = path.join(dir, 'plain');
      fs.mkdirSync(plain, { recursive: true });
      return readPairs(shellOut(shell, [driver, plain]));
    });
    assert.strictEqual(got.found, '0');
    assert.strictEqual(got.root, '[]');
  });

  test(shell + ': the alias installer refuses to shadow an existing command', () => {
    const got = aliasProbe(shell, [['ls', 'ls -G'], ['cd', 'cd -']]);
    for (const name of ['ls', 'cd']) {
      assert.strictEqual(got[name + '.status'], '1', name);
      assert.strictEqual(got[name + '.defined'], '0', name);
    }
  });

  test(shell + ': the alias installer defines a name nothing else claims', () => {
    const got = aliasProbe(shell, [['joshfreename', 'echo hi']]);
    assert.strictEqual(got['joshfreename.status'], '0');
    assert.strictEqual(got['joshfreename.defined'], '1');
  });

  test(shell + ': the installer refuses a name it has already defined', () => {
    const got = aliasProbe(shell, [['joshtwice', 'echo one'], ['joshtwice', 'echo two']]);
    assert.strictEqual(got['joshtwice.status'], '1', 'the second attempt must lose');
    assert.strictEqual(got['joshtwice.defined'], '1');
  });

  test(shell + ': a name carrying shell punctuation is rejected outright', () => {
    const names = ['a;b', 'a b', 'a$b', 'a/b', '-a', '1a', ''];
    const got = aliasProbe(shell, names.map((n) => [n, 'echo pwned']));
    for (const name of names) {
      assert.strictEqual(got[name + '.status'], '1', JSON.stringify(name));
      assert.strictEqual(got[name + '.defined'], '0', JSON.stringify(name));
    }
  });

  test(shell + ': two to four dots are the one punctuation exception', () => {
    const got = aliasProbe(shell, [
      ['..', 'cd ..'],
      ['...', 'cd ../..'],
      ['....', 'cd ../../..'],
      ['.....', 'cd nowhere'],
      ['.', 'cd .'],
    ]);
    for (const name of ['..', '...', '....']) {
      assert.strictEqual(got[name + '.status'], '0', name);
      assert.strictEqual(got[name + '.defined'], '1', name);
    }
    for (const name of ['.....', '.']) {
      assert.strictEqual(got[name + '.status'], '1', name);
      assert.strictEqual(got[name + '.defined'], '0', name);
    }
  });
}

test('every shipped snippet is plain ASCII with no control characters', () => {
  for (const name of ['POSIX_GIT', 'POSIX_ALIAS', 'PWSH_GIT', 'PWSH_ALIAS']) {
    const text = KitLib[name];
    assert.strictEqual(typeof text, 'string', name);
    assert.ok(text.length > 0, name);
    for (const character of text) {
      const code = character.codePointAt(0);
      const printable = code >= 0x20 && code < 0x7f;
      assert.ok(printable || code === 0x0a, name + ' carries code point ' + code.toString(16));
    }
  }
});

test('the POSIX snippets define only __josh_ prefixed names', () => {
  const text = KitLib.POSIX_GIT + '\n' + KitLib.POSIX_ALIAS;
  const found = [...text.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(\)/gm)].map((m) => m[1]);
  assert.ok(found.length > 0, 'no functions found, the regex has drifted');
  for (const name of found) assert.match(name, /^__josh_/, name);
});

test('no snippet borrows from the framework this one is not', () => {
  const all = [KitLib.POSIX_GIT, KitLib.POSIX_ALIAS, KitLib.PWSH_GIT, KitLib.PWSH_ALIAS]
    .join('\n')
    .toLowerCase();
  for (const banned of ['oh-my-zsh', 'ohmyzsh', 'omz_', 'zsh_theme', 'zsh_custom', 'plugins=(']) {
    assert.strictEqual(all.includes(banned), false, banned);
  }
});

test.todo(
  'PowerShell snippets have no unit test: exercising them needs pwsh, which '
  + 'only the Windows CI runner guarantees. Task 14 covers them end to end '
  + 'and skips when pwsh is absent.'
);
