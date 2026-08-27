/**
 * Alias and function packs, as data.
 *
 * Derivation rule, applied literally: each alias name is the tool's initial,
 * then the subcommand's initials, disambiguated by extending until the name is
 * free. "Initials" means one letter per word for a multi-word subcommand
 * (cherry-pick gives cp), and the leading consonant cluster for a single word
 * (status gives st, branch gives br), or the first letter when the word opens
 * on a vowel (add gives a).
 *
 * The rule is order-dependent, which is the point: the spec fixes two names by
 * example, git status as gst and git stash as gsta, and those come out only
 * when subcommands are listed in the order the spec lists them, by how often
 * they are actually typed. So the subcommand lists below are in frequency
 * order, not alphabetical, and that ordering is load-bearing.
 *
 * Two consequences worth stating. Names are mechanical and reproducible from
 * each tool's own help output, which is why the sets are defensible and why
 * they are predictable to learn. And nothing here is copied from any existing
 * framework -- notably, the rule never produces gs, the alias whose shadowing
 * of Ghostscript is the complaint this design was built to avoid.
 *
 * Not every tool has subcommands. make, gcc, objdump and the shell builtins
 * are driven by flags, so their names are mnemonic rather than derived. Those
 * entries carry no `sub` field, and the test suite holds them to the safety
 * and uniqueness rules but not to the derivation.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KitPacks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NAME_PATTERN = /^([A-Za-z_][A-Za-z0-9_-]*|[.]{2,4})$/;
  const PACK_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
  const MAX_NAME_LENGTH = 32;
  const MAX_ALIASES = 200;
  const VOWELS = 'aeiou';

  /**
   * Short names an existing utility already owns. The derivation steps over
   * these, so every shipped alias has a real chance of being defined rather
   * than being refused at prompt time by the non-clobbering rule. gs is here
   * for the reason the whole design exists.
   */
  const RESERVED = Object.freeze([
    'gs',
    'cd', 'cp', 'mv', 'rm', 'ls', 'ln', 'nl', 'ps', 'df', 'du', 'dd', 'ed',
    'od', 'pr', 'tr', 'wc', 'sh', 'bc', 'at', 'cc', 'nc', 'dc', 'id', 'tf',
    'cal', 'cat', 'awk', 'sed', 'tar', 'top', 'who', 'cut', 'env', 'man',
  ]);

  const RESERVED_SET = new Set(RESERVED);

  function isSafeAliasName(value) {
    if (typeof value !== 'string') return false;
    if (value.length === 0 || value.length > MAX_NAME_LENGTH) return false;
    return NAME_PATTERN.test(value);
  }

  /** Letters up to the first vowel, or just the first letter if it is one. */
  function consonantCluster(word) {
    let end = 0;
    while (end < word.length && VOWELS.indexOf(word[end]) === -1) end += 1;
    return end === 0 ? 1 : end;
  }

  /**
   * Every candidate stem for a subcommand, shortest first. A multi-word
   * subcommand keeps one letter per trailing word and grows its first word; a
   * single word grows from its leading consonant cluster.
   */
  function stems(subcommand) {
    const words = String(subcommand).split(/[-_ ]+/).filter(Boolean);
    if (words.length === 0) return [];

    if (words.length > 1) {
      const tail = words.slice(1).map((word) => word[0]).join('');
      const head = words[0];
      const out = [];
      for (let k = 1; k <= head.length; k += 1) out.push(head.slice(0, k) + tail);
      return out;
    }

    const word = words[0];
    const out = [];
    for (let k = consonantCluster(word); k <= word.length; k += 1) out.push(word.slice(0, k));
    return out;
  }

  /**
   * The tool's initial plus the shortest free stem. `taken` is the set of
   * names already handed out, across every pack, in build order.
   */
  function deriveAlias(toolInitial, subcommand, taken) {
    const claimed = taken instanceof Set ? taken : new Set();
    for (const stem of stems(subcommand)) {
      const candidate = String(toolInitial) + stem;
      if (RESERVED_SET.has(candidate)) continue;
      if (claimed.has(candidate)) continue;
      return candidate;
    }
    return null;
  }

  /* ------------------------------------------------------------ pack data */

  /**
   * Subcommand lists, in frequency order, read from each tool's own help
   * output: `git help -a`, `npm help`, `pip3 --help`.
   *
   * docker and cargo were not installed on the machine these were written on,
   * so their lists come from the documented subcommand set rather than from a
   * local binary. Recorded here rather than papered over.
   */
  const GIT = {
    tool: 'g', command: 'git', requires: 'git',
    subs: [
      'status', 'add', 'commit', 'branch', 'checkout', 'diff', 'log',
      'push', 'pull', 'stash', 'rebase', 'fetch', 'merge', 'clone',
      'remote', 'reset', 'restore', 'revert', 'switch', 'tag', 'show',
      'init', 'clean', 'cherry-pick', 'config', 'blame', 'bisect',
      'describe', 'mv', 'rm', 'worktree',
    ],
  };

  const NPM = {
    tool: 'n', command: 'npm', requires: 'npm',
    subs: [
      'install', 'run', 'test', 'start', 'ci', 'publish', 'update',
      'outdated', 'audit', 'list', 'link', 'exec', 'init', 'uninstall',
    ],
  };

  const PIP = {
    tool: 'p', command: 'pip3', requires: 'pip3',
    subs: ['install', 'uninstall', 'list', 'show', 'freeze', 'download', 'check'],
  };

  const DOCKER = {
    tool: 'd', command: 'docker', requires: 'docker',
    subs: [
      'ps', 'images', 'build', 'run', 'exec', 'logs',
      'stop', 'start', 'restart', 'compose',
    ],
  };

  const CARGO = {
    tool: 'c', command: 'cargo', requires: 'cargo',
    subs: [
      'build', 'run', 'test', 'check', 'clippy', 'fmt', 'add', 'update',
      'doc', 'new', 'bench', 'clean', 'publish',
    ],
  };

  /** Flag-driven tools have no subcommand list, so these names are mnemonic. */
  const CORE_ALIASES = [
    ['ll', 'ls -l', 'ls'],
    ['la', 'ls -la', 'ls'],
    ['lh', 'ls -lh', 'ls'],
    ['lt', 'ls -lt', 'ls'],
    ['lr', 'ls -lR', 'ls'],
    ['lsd', 'ls -ld .*/ */', 'ls'],
    ['..', 'cd ..', ''],
    ['...', 'cd ../..', ''],
    ['....', 'cd ../../..', ''],
    ['dfh', 'df -h', 'df'],
    ['duh', 'du -h -d 1', 'du'],
    ['hn', 'head -n 50', 'head'],
    ['tn', 'tail -n 50', 'tail'],
    ['tfl', 'tail -f', 'tail'],
    ['wcl', 'wc -l', 'wc'],
    ['mkp', 'mkdir -p', 'mkdir'],
    ['cpr', 'cp -R', 'cp'],
    ['jobsl', 'jobs -l', ''],
    ['hist', 'history', ''],
    ['cls', 'clear', 'clear'],
    ['now', 'date "+%Y-%m-%d %H:%M:%S"', 'date'],
  ];

  const PYTHON_ALIASES = [
    ['py', 'python3', 'python3'],
    ['pym', 'python3 -m', 'python3'],
    ['pyv', 'python3 -m venv', 'python3'],
    ['pys', 'python3 -m http.server', 'python3'],
  ];

  const SYSTEMS_ALIASES = [
    ['mak', 'make', 'make'],
    ['makc', 'make clean', 'make'],
    ['makt', 'make test', 'make'],
    ['makj', 'make -j 4', 'make'],
    ['gccw', 'gcc -Wall -Wextra -Wpedantic', 'gcc'],
    ['gccg', 'gcc -g -Wall -Wextra', 'gcc'],
    ['clw', 'clang -Wall -Wextra -Wpedantic', 'clang'],
    ['clg', 'clang -g -Wall -Wextra', 'clang'],
    ['dbg', 'lldb', 'lldb'],
    ['objd', 'objdump -d', 'objdump'],
    ['nmc', 'nm -C', 'nm'],
    ['readh', 'readelf -h', 'readelf'],
  ];

  /** Function bodies are POSIX shell. A body with no PowerShell equivalent is
   *  simply not emitted for pwsh; a half-translated function is worse than an
   *  absent one. */
  const GIT_FUNCTIONS = [
    {
      name: 'gcur',
      requires: 'git',
      value: 'git rev-parse --abbrev-ref HEAD 2>/dev/null',
    },
    {
      name: 'gprunem',
      requires: 'git',
      value: [
        'git fetch --prune || return 1',
        'git branch --merged | sed -e "s/^[*+][[:space:]]*//" -e "s/^[[:space:]]*//" |',
        '  grep -v -E "^(main|master|develop)$" |',
        '  while read -r __josh_branch; do',
        '    [ -n "$__josh_branch" ] && git branch -d "$__josh_branch"',
        '  done',
      ].join('\n'),
    },
  ];

  const CORE_FUNCTIONS = [
    {
      name: 'mkcd',
      requires: 'mkdir',
      value: 'mkdir -p "$1" && cd "$1"',
    },
    {
      name: 'path',
      requires: '',
      value: 'printf "%s" "$PATH" | tr ":" "\\n"',
    },
    {
      name: 'histg',
      requires: '',
      value: 'history | grep -i -- "$1"',
    },
    {
      name: 'extract',
      requires: 'tar',
      value: [
        'case "$1" in',
        '  *.tar.gz|*.tgz) tar -xzf "$1" ;;',
        '  *.tar.bz2|*.tbz) tar -xjf "$1" ;;',
        '  *.tar.xz) tar -xJf "$1" ;;',
        '  *.tar) tar -xf "$1" ;;',
        '  *.zip) unzip -q "$1" ;;',
        '  *.gz) gunzip "$1" ;;',
        '  *) printf "josh: no rule to extract %s\\n" "$1" >&2; return 1 ;;',
        'esac',
      ].join('\n'),
    },
  ];

  /* --------------------------------------------------------- construction */

  const taken = new Set();

  function derivedGroup(group) {
    const out = [];
    for (const sub of group.subs) {
      const name = deriveAlias(group.tool, sub, taken);
      if (name === null) continue;
      taken.add(name);
      out.push(Object.freeze({
        name: name,
        value: group.command + ' ' + sub,
        requires: group.requires,
        tool: group.tool,
        sub: sub,
      }));
    }
    return out;
  }

  function mnemonicGroup(rows) {
    return rows.map((row) => {
      taken.add(row[0]);
      return Object.freeze({ name: row[0], value: row[1], requires: row[2] });
    });
  }

  function functionGroup(rows) {
    return rows.map((row) => {
      taken.add(row.name);
      return Object.freeze({ name: row.name, value: row.value, requires: row.requires });
    });
  }

  // Build order is load-bearing: names are handed out against one shared set,
  // pack by pack, aliases before functions, exactly as the test replays it.
  const gitAliases = derivedGroup(GIT);
  const gitFunctions = functionGroup(GIT_FUNCTIONS);

  const coreAliases = mnemonicGroup(CORE_ALIASES);
  const coreFunctions = functionGroup(CORE_FUNCTIONS);

  const devAliases = derivedGroup(NPM)
    .concat(derivedGroup(PIP))
    .concat(mnemonicGroup(PYTHON_ALIASES))
    .concat(derivedGroup(DOCKER));

  const systemsAliases = derivedGroup(CARGO).concat(mnemonicGroup(SYSTEMS_ALIASES));

  function pack(name, requires, aliases, functions) {
    return Object.freeze({
      name: name,
      requires: requires,
      aliases: Object.freeze(aliases),
      functions: Object.freeze(functions),
    });
  }

  const PACKS = Object.freeze({
    git: pack('git', 'git', gitAliases, gitFunctions),
    core: pack('core', '', coreAliases, coreFunctions),
    dev: pack('dev', '', devAliases, []),
    systems: pack('systems', '', systemsAliases, []),
  });

  function packNames() {
    return Object.keys(PACKS);
  }

  /* --------------------------------------------------------- coercion */

  /** Remove C0 controls and DEL, optionally keeping newlines. Written as a
   *  code-point scan so no control character appears in this source file. */
  function stripControls(value, keepNewlines) {
    let out = '';
    for (const character of String(value)) {
      const code = character.codePointAt(0);
      if (code === 0x0a && keepNewlines) {
        out += character;
        continue;
      }
      if (code < 0x20 || code === 0x7f) continue;
      out += character;
    }
    return out;
  }

  function coerceEntry(raw, fallbackRequires, keepNewlines) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!isSafeAliasName(raw.name)) return null;
    if (typeof raw.value !== 'string') return null;

    const value = stripControls(raw.value, keepNewlines);
    if (value.length === 0) return null;

    const entry = {
      name: raw.name,
      value: value,
      requires: typeof raw.requires === 'string'
        ? stripControls(raw.requires, false)
        : fallbackRequires,
    };

    // Provenance is preserved so a shipped pack round-trips through its own
    // coercion unchanged, and so the derivation stays checkable.
    if (typeof raw.tool === 'string' && raw.tool.length === 1) entry.tool = raw.tool;
    if (typeof raw.sub === 'string' && raw.sub.length > 0) {
      entry.sub = stripControls(raw.sub, false);
    }

    return entry;
  }

  /**
   * User packs load from ~/.config/josh/shell-kit/packs/*.json and pass
   * through exactly this function, so a hand-mangled file degrades to a
   * smaller pack, or to "ignored", rather than to broken shell script.
   */
  function coercePack(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (typeof raw.name !== 'string' || !PACK_NAME_PATTERN.test(raw.name)) return null;
    if (!Array.isArray(raw.aliases)) return null;

    const requires = typeof raw.requires === 'string' ? stripControls(raw.requires, false) : '';
    const functions = Array.isArray(raw.functions) ? raw.functions : [];

    return {
      name: raw.name,
      requires: requires,
      aliases: raw.aliases
        .slice(0, MAX_ALIASES)
        .map((entry) => coerceEntry(entry, requires, false))
        .filter(Boolean),
      functions: functions
        .slice(0, MAX_ALIASES)
        .map((entry) => coerceEntry(entry, requires, true))
        .filter(Boolean),
    };
  }

  /** Unknown names are dropped in place; the caller's order is kept. */
  function selectPacks(names) {
    if (!Array.isArray(names)) return [];
    const seen = new Set();
    const out = [];
    for (const name of names) {
      if (typeof name !== 'string') continue;
      if (seen.has(name)) continue;
      if (!Object.prototype.hasOwnProperty.call(PACKS, name)) continue;
      seen.add(name);
      out.push(PACKS[name]);
    }
    return out;
  }

  return {
    PACKS, RESERVED, packNames, coercePack, selectPacks,
    isSafeAliasName, deriveAlias, stems, stripControls,
  };
});
