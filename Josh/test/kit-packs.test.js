'use strict';
const test = require('node:test');
const assert = require('node:assert');
const KitPacks = require('../src/shared/kit-packs.js');

test('four packs ship, named', () => {
  assert.deepStrictEqual(KitPacks.packNames().sort(), ['core', 'dev', 'git', 'systems']);
});

test('the packs are roughly the sizes the spec commits to', () => {
  const size = (name) => {
    const pack = KitPacks.PACKS[name];
    return pack.aliases.length + pack.functions.length;
  };
  assert.ok(size('git') >= 25 && size('git') <= 40, 'git: ' + size('git'));
  assert.ok(size('core') >= 20 && size('core') <= 32, 'core: ' + size('core'));
  assert.ok(size('dev') >= 28 && size('dev') <= 42, 'dev: ' + size('dev'));
  assert.ok(size('systems') >= 20 && size('systems') <= 32, 'systems: ' + size('systems'));
});

/* ------------------------------------------------------------------ names */

test('the derivation reproduces the two names the spec fixes by example', () => {
  const taken = new Set();
  assert.strictEqual(KitPacks.deriveAlias('g', 'status', taken), 'gst');
  taken.add('gst');
  assert.strictEqual(KitPacks.deriveAlias('g', 'stash', taken), 'gsta');
});

test('a multi-word subcommand contributes one initial per word', () => {
  assert.strictEqual(KitPacks.deriveAlias('g', 'cherry-pick', new Set()), 'gcp');
});

test('a subcommand opening on a vowel contributes one letter', () => {
  assert.strictEqual(KitPacks.deriveAlias('g', 'add', new Set()), 'ga');
  assert.strictEqual(KitPacks.deriveAlias('n', 'install', new Set()), 'ni');
});

test('the leading consonant cluster is taken whole', () => {
  assert.strictEqual(KitPacks.deriveAlias('g', 'branch', new Set()), 'gbr');
  assert.strictEqual(KitPacks.deriveAlias('c', 'fmt', new Set()), 'cfmt');
});

test('derivation steps over a name an existing utility already owns', () => {
  assert.strictEqual(KitPacks.deriveAlias('c', 'doc', new Set()), 'cdo');
  assert.strictEqual(KitPacks.deriveAlias('n', 'list', new Set()), 'nli');
});

test('every shipped alias name passes the safety rule', () => {
  for (const name of KitPacks.packNames()) {
    for (const entry of KitPacks.PACKS[name].aliases) {
      assert.ok(KitPacks.isSafeAliasName(entry.name), name + ': ' + entry.name);
    }
    for (const entry of KitPacks.PACKS[name].functions) {
      assert.ok(KitPacks.isSafeAliasName(entry.name), name + ': ' + entry.name);
    }
  }
});

test('no name is defined twice, within a pack or across packs', () => {
  const seen = new Map();
  for (const name of KitPacks.packNames()) {
    const pack = KitPacks.PACKS[name];
    for (const entry of pack.aliases.concat(pack.functions)) {
      assert.strictEqual(
        seen.has(entry.name), false,
        entry.name + ' is in both ' + seen.get(entry.name) + ' and ' + name
      );
      seen.set(entry.name, name);
    }
  }
});

test('every derived alias still equals what the rule produces, in order', () => {
  const taken = new Set();
  for (const name of KitPacks.packNames()) {
    const pack = KitPacks.PACKS[name];
    for (const entry of pack.aliases.concat(pack.functions)) {
      if (!entry.sub) {
        taken.add(entry.name);
        continue;
      }
      const expected = KitPacks.deriveAlias(entry.tool, entry.sub, taken);
      assert.strictEqual(entry.name, expected, entry.tool + ' ' + entry.sub);
      taken.add(entry.name);
    }
  }
});

test('a name shipped as mnemonic is honest about not being derived', () => {
  let derived = 0;
  let mnemonic = 0;
  for (const name of KitPacks.packNames()) {
    const pack = KitPacks.PACKS[name];
    for (const entry of pack.aliases) {
      if (entry.sub) {
        assert.strictEqual(typeof entry.tool, 'string', entry.name);
        derived += 1;
      } else {
        mnemonic += 1;
      }
    }
  }
  assert.ok(derived > 60, 'most aliases should be derived, got ' + derived);
  assert.ok(mnemonic > 0, 'flag-style tools have no subcommands to derive from');
});

/* ------------------------------------------------------------- the rules */

test('the dot exception is accepted and nothing else punctuated is', () => {
  for (const good of ['..', '...', '....', 'gst', 'a_b', 'a-b', '_x', 'l']) {
    assert.strictEqual(KitPacks.isSafeAliasName(good), true, JSON.stringify(good));
  }
  for (const bad of ['.', '.....', 'a;b', 'a b', 'a$b', 'a/b', '-a', '1a', '', 'a.b']) {
    assert.strictEqual(KitPacks.isSafeAliasName(bad), false, JSON.stringify(bad));
  }
});

test('isSafeAliasName rejects anything that is not a string', () => {
  for (const bad of [null, undefined, 42, {}, [], ['gst']]) {
    assert.strictEqual(KitPacks.isSafeAliasName(bad), false, String(bad));
  }
});

test('no alias value carries a control character', () => {
  for (const name of KitPacks.packNames()) {
    for (const entry of KitPacks.PACKS[name].aliases) {
      for (const character of entry.value) {
        const code = character.codePointAt(0);
        assert.ok(
          code >= 0x20 && code !== 0x7f,
          name + ' ' + entry.name + ' carries ' + code.toString(16)
        );
      }
    }
  }
});

test('a function body may span lines but carries no other control character', () => {
  for (const name of KitPacks.packNames()) {
    for (const entry of KitPacks.PACKS[name].functions) {
      for (const character of entry.value) {
        const code = character.codePointAt(0);
        assert.ok(
          (code >= 0x20 && code !== 0x7f) || code === 0x0a,
          name + ' ' + entry.name + ' carries ' + code.toString(16)
        );
      }
    }
  }
});

test('interactive rm, cp and mv are not in core', () => {
  const core = KitPacks.PACKS.core;
  for (const entry of core.aliases.concat(core.functions)) {
    assert.notStrictEqual(entry.name, 'rm', 'aliasing rm needs its own opt-in');
    assert.notStrictEqual(entry.name, 'cp');
    assert.notStrictEqual(entry.name, 'mv');
    assert.strictEqual(/(^|\s)(rm|cp|mv)\s+-[A-Za-z]*i/.test(entry.value), false, entry.value);
  }
});

test('every alias declares the binary it needs', () => {
  for (const name of KitPacks.packNames()) {
    const pack = KitPacks.PACKS[name];
    for (const entry of pack.aliases.concat(pack.functions)) {
      assert.strictEqual(typeof entry.requires, 'string', name + ' ' + entry.name);
    }
  }
});

test('the dev pack spans more than one binary, as the spec defines it', () => {
  const needed = new Set(KitPacks.PACKS.dev.aliases.map((a) => a.requires));
  assert.ok(needed.size > 1, 'dev covers npm, python and docker');
  assert.ok(needed.has('npm'));
});

/* --------------------------------------------------------------- coercion */

test('every shipped pack survives its own coercion unchanged', () => {
  for (const name of KitPacks.packNames()) {
    const pack = KitPacks.PACKS[name];
    assert.deepStrictEqual(KitPacks.coercePack(pack), pack, name);
  }
});

test('coercion drops an unsafe name rather than the whole pack', () => {
  const out = KitPacks.coercePack({
    name: 'mine',
    requires: 'git',
    aliases: [
      { name: 'a;b', value: 'echo pwned' },
      { name: 'safe', value: 'echo hi' },
    ],
    functions: [],
  });
  assert.strictEqual(out.aliases.length, 1);
  assert.strictEqual(out.aliases[0].name, 'safe');
});

test('coercion strips control characters out of a value', () => {
  const out = KitPacks.coercePack({
    name: 'mine',
    requires: 'git',
    aliases: [{ name: 'safe', value: 'echo' + String.fromCharCode(27) + '[31m hi' }],
    functions: [],
  });
  assert.strictEqual(out.aliases[0].value, 'echo[31m hi');
});

test('coercion rejects a pack that is not salvageable', () => {
  assert.strictEqual(KitPacks.coercePack(null), null);
  assert.strictEqual(KitPacks.coercePack([]), null);
  assert.strictEqual(KitPacks.coercePack({ name: 'a b', aliases: [] }), null);
  assert.strictEqual(KitPacks.coercePack({ name: 'mine' }), null);
});

test('coercion caps a pack so one file cannot define a thousand names', () => {
  const many = Array.from({ length: 500 }, (unused, i) => ({
    name: 'joshname' + i, value: 'echo ' + i,
  }));
  const out = KitPacks.coercePack({
    name: 'mine', requires: 'git', aliases: many, functions: [],
  });
  assert.ok(out.aliases.length <= 200, 'got ' + out.aliases.length);
});

test('coercion defaults a missing requires rather than inventing one', () => {
  const out = KitPacks.coercePack({
    name: 'mine', aliases: [{ name: 'safe', value: 'echo hi' }], functions: [],
  });
  assert.strictEqual(out.aliases[0].requires, '');
});

/* --------------------------------------------------------------- selection */

test('selectPacks keeps the order it was given and drops what it does not know', () => {
  const chosen = KitPacks.selectPacks(['systems', 'nonsense', 'git']);
  assert.deepStrictEqual(chosen.map((p) => p.name), ['systems', 'git']);
});

test('selectPacks tolerates junk instead of a list', () => {
  assert.deepStrictEqual(KitPacks.selectPacks(null), []);
  assert.deepStrictEqual(KitPacks.selectPacks('git'), []);
  assert.deepStrictEqual(KitPacks.selectPacks([42, null, 'git']).map((p) => p.name), ['git']);
});

test('selectPacks never repeats a pack asked for twice', () => {
  assert.deepStrictEqual(KitPacks.selectPacks(['git', 'git']).map((p) => p.name), ['git']);
});

test('no pack borrows a curated list from the framework this one is not', () => {
  const text = JSON.stringify(KitPacks.PACKS).toLowerCase();
  for (const banned of ['oh-my-zsh', 'ohmyzsh', 'omz_', 'zsh_theme', 'zsh_custom']) {
    assert.strictEqual(text.includes(banned), false, banned);
  }
  const names = new Set();
  for (const name of KitPacks.packNames()) {
    for (const entry of KitPacks.PACKS[name].aliases) names.add(entry.name);
  }
  assert.strictEqual(names.has('gs'), false, 'gs is the alias that shadows Ghostscript');
});
