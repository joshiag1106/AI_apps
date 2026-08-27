/**
 * One theme and a set of packs, turned into zsh, bash or PowerShell 7 script.
 *
 * The defect this module exists to prevent: a prompt whose non-printing escape
 * sequences are not marked as non-printing. The shell then counts colour bytes
 * as visible width, and every wrapped command line corrupts, history recall
 * redraws over itself, and Ctrl+A lands in the wrong column. It is the most
 * common bug in this whole category of software, and it is invisible until a
 * line is long enough to wrap.
 *
 *   zsh   percent-brace pairs around every escape
 *   bash  backslash-bracket pairs around every escape
 *   pwsh  nothing at all -- PSReadLine measures VT itself, and a stray marker
 *         would print literally
 *
 * zsh additionally treats the percent sign as special inside a prompt, so a
 * literal one arriving from a path must be doubled. bash does not.
 *
 * Colours are truecolor, which is sound because shell-resolver.js already sets
 * COLORTERM=truecolor on every session it spawns.
 *
 * Nothing from settings or a user pack file reaches the emitted text
 * unescaped. Names pass an allowlist; values are single-quoted with embedded
 * quotes escaped for the dialect.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./kit-themes.js'),
      require('./kit-render.js'),
      require('./kit-lib.js')
    );
  } else {
    root.KitEmit = factory(root.KitThemes, root.KitRender, root.KitLib);
  }
})(typeof self !== 'undefined' ? self : this, function (KitThemes, KitRender, KitLib) {
  'use strict';

  const DIALECTS = Object.freeze(['zsh', 'bash', 'pwsh']);
  const ESC = String.fromCharCode(27);
  const PACK_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
  const BINARY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

  /** Marks a run of escape bytes as occupying no columns. */
  function wrap(sequence, dialect) {
    if (dialect === 'zsh') return '%{' + sequence + '%}';
    if (dialect === 'bash') return '\\[' + sequence + '\\]';
    return sequence;
  }

  /** A truecolor foreground escape, written with the shell's own octal form so
   *  that no raw control byte is ever placed in a generated POSIX file. */
  function colourEscape(hex, dialect) {
    const value = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#ffffff';
    const r = parseInt(value.slice(1, 3), 16);
    const g = parseInt(value.slice(3, 5), 16);
    const b = parseInt(value.slice(5, 7), 16);
    const body = '[38;2;' + r + ';' + g + ';' + b + 'm';
    return dialect === 'pwsh' ? ESC + body : '\\033' + body;
  }

  function resetEscape(dialect) {
    return dialect === 'pwsh' ? ESC + '[0m' : '\\033[0m';
  }

  /** Single-quote a value so nothing inside it can be interpreted. */
  function quote(value, dialect) {
    const text = String(value);
    if (dialect === 'pwsh') return "'" + text.split("'").join("''") + "'";
    return "'" + text.split("'").join("'\\''") + "'";
  }

  function isSafeBinary(name) {
    return typeof name === 'string' && BINARY_PATTERN.test(name);
  }

  /* --------------------------------------------------------- POSIX prompt */

  /**
   * Colour declarations, evaluated once at install time.
   *
   * ANSI-C quoting is what makes this correct in both shells: $'\033[...' is
   * expanded by the shell at assignment, so the prompt string carries real
   * escape bytes. Writing the octal form straight into the prompt would work
   * in bash, whose prompt expansion understands it, and print literally in
   * zsh, whose does not.
   */
  function posixColours(slots) {
    const lines = [];
    for (const slot of Object.keys(slots)) {
      lines.push('__josh_c_' + slot + "=$'" + colourEscape(slots[slot], 'zsh') + "'");
    }
    lines.push("__josh_c_reset=$'" + resetEscape('zsh') + "'");
    return lines.join('\n');
  }


  /**
   * The git summary, assembled at prompt time. Its markers and its ordering
   * come from kit-render.js, the same table the preview draws from, so the two
   * cannot describe the same repository differently.
   */
  function posixGitFormatter(glyphs) {
    const markers = glyphs === 'rich' ? KitRender.MARKERS.rich : KitRender.MARKERS.plain;
    const lines = [
      '__josh_git_fmt() {',
      '  JOSH_GIT=""',
      '  if [ -z "$JOSH_GIT_BRANCH" ]; then',
      '    return 0',
      '  fi',
      '  if [ "$JOSH_GIT_DETACHED" = "1" ]; then',
      '    JOSH_GIT="($JOSH_GIT_BRANCH)"',
      '  else',
      '    JOSH_GIT=$JOSH_GIT_BRANCH',
      '  fi',
    ];

    if (glyphs === 'rich') {
      lines.push('  JOSH_GIT=' + quote(KitRender.BRANCH_MARK + ' ', 'zsh') + '"$JOSH_GIT"');
    }

    for (const key of KitRender.COUNTS) {
      const variable = 'JOSH_GIT_' + key.toUpperCase();
      lines.push('  if [ "$' + variable + '" -gt 0 ]; then');
      lines.push('    JOSH_GIT="$JOSH_GIT ' + markers[key] + '$' + variable + '"');
      lines.push('  fi');
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * The shell expression for one segment's text, and the guard under which the
   * segment is shown at all. Returning null omits the segment entirely.
   */
  function posixSegment(segment, glyphs) {
    const opts = segment.opts || {};
    switch (segment.type) {
      case 'user':
        return { prepare: '', value: '$JOSH_USER', guard: '[ -n "$JOSH_USER" ]' };
      case 'host':
        return { prepare: '', value: '$JOSH_HOST', guard: '[ -n "$JOSH_HOST" ]' };
      case 'cwd':
        return {
          prepare: '__josh_cwd_fmt ' + Math.max(0, Math.round(opts.truncate || 0)),
          value: '$JOSH_CWD',
          guard: '',
        };
      case 'git':
        return { prepare: '__josh_git_fmt', value: '$JOSH_GIT', guard: '[ -n "$JOSH_GIT" ]' };
      case 'exit':
        return {
          prepare: '',
          value: '$JOSH_EXIT',
          guard: opts.onlyOnFailure === true ? '[ "$JOSH_EXIT" -ne 0 ]' : '',
        };
      case 'duration':
        return {
          prepare: '__josh_dur_fmt "$JOSH_DURATION_MS"',
          value: '$JOSH_DUR',
          guard: '[ "$JOSH_DURATION_MS" -gt 0 ] && [ "$JOSH_DURATION_MS" -ge '
            + Math.max(0, Math.round(opts.minMs || 0)) + ' ]',
        };
      case 'jobs':
        return {
          prepare: 'JOSH_JOBS=$(jobs -p | wc -l | tr -d " ")',
          value: '$JOSH_JOBS',
          guard: '[ "$JOSH_JOBS" -gt 0 ]',
        };
      case 'time':
        return { prepare: 'JOSH_TIME=$(date "+%H:%M")', value: '$JOSH_TIME', guard: '' };
      case 'venv':
        return {
          prepare: 'JOSH_VENV=${VIRTUAL_ENV##*/}',
          value: '$JOSH_VENV',
          guard: '[ -n "$VIRTUAL_ENV" ]',
        };
      case 'char':
        return {
          prepare: '', guard: '', literal: true,
          value: KitRender.pickGlyph(segment, glyphs),
        };
      default:
        return null;
    }
  }

  /**
   * A prompt function that rebuilds the prompt string every time. The git
   * segment is recomputed per prompt, so a static string could not stay right
   * for more than one command.
   */
  function posixPrompt(theme, dialect, slots, glyphs) {
    const variable = dialect === 'zsh' ? 'PROMPT' : 'PS1';
    const reset = wrap('$__josh_c_reset', dialect);

    const lines = [
      '__josh_prompt() {',
      '  JOSH_EXIT=$?',
      '  __josh_timer_stop',
      '  __josh_git_collect >/dev/null 2>&1',
      '  __josh_out=""',
    ];

    const spans = [];
    for (const segment of theme.segments) {
      const piece = posixSegment(segment, glyphs);
      if (piece === null) continue;
      spans.push({ segment: segment, piece: piece });
    }

    for (let i = 0; i < spans.length; i += 1) {
      const segment = spans[i].segment;
      const piece = spans[i].piece;
      const slot = Object.prototype.hasOwnProperty.call(slots, segment.slot)
        ? segment.slot : 'fg';
      const colour = wrap('$__josh_c_' + slot, dialect);
      const gap = i < spans.length - 1 ? ' ' : '';

      if (piece.prepare) lines.push('  ' + piece.prepare);

      // A literal glyph is known at emit time and needs no escaping pass. A
      // dynamic value may carry a percent sign, which zsh reads as a prompt
      // escape, so zsh doubles it and bash leaves it alone.
      let text = piece.value;
      if (!piece.literal && dialect === 'zsh') {
        lines.push('  __josh_text="' + piece.value + '"');
        lines.push('  __josh_text=${__josh_text//\\%/%%}');
        text = '$__josh_text';
      }

      const append = '  __josh_out="$__josh_out' + colour + text + reset + gap + '"';
      if (piece.guard) {
        lines.push('  if ' + piece.guard + '; then');
        lines.push('  ' + append);
        lines.push('  fi');
      } else {
        lines.push(append);
      }
    }

    if (theme.multiline) {
      lines.push('  __josh_out="$__josh_out' + (dialect === 'zsh' ? '$\'\\n\'' : '\\n') + '"');
    }

    lines.push('  ' + variable + '=$__josh_out');
    lines.push('}');
    return lines.join('\n');
  }

  function posixHooks(dialect) {
    if (dialect === 'zsh') {
      return [
        'zmodload zsh/datetime 2>/dev/null',
        'autoload -Uz add-zsh-hook',
        'add-zsh-hook precmd __josh_prompt',
        'add-zsh-hook preexec __josh_timer_start',
      ].join('\n');
    }
    return [
      '# --rcfile is ignored for login shells, and Josh starts login shells',
      '# deliberately, so the hook arrives through PROMPT_COMMAND instead.',
      'case "$PROMPT_COMMAND" in',
      '  *__josh_prompt*) : ;;',
      '  *) PROMPT_COMMAND="__josh_prompt${PROMPT_COMMAND:+; $PROMPT_COMMAND}" ;;',
      'esac',
      "trap '__josh_timer_start' DEBUG",
    ].join('\n');
  }

  /* ---------------------------------------------------------- pack output */

  function posixPacks(packs, dialect) {
    const lines = [];
    for (const pack of packs) {
      const groups = new Map();
      for (const entry of pack.aliases) {
        const key = isSafeBinary(entry.requires) ? entry.requires : '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
      }

      for (const pair of groups) {
        const binary = pair[0];
        const entries = pair[1];
        const indent = binary === '' ? '' : '  ';
        if (binary !== '') lines.push('if command -v ' + binary + ' >/dev/null 2>&1; then');
        for (const entry of entries) {
          lines.push(indent + '__josh_alias ' + quote(entry.name, dialect)
            + ' ' + quote(entry.value, dialect));
        }
        if (binary !== '') lines.push('fi');
      }

      for (const entry of pack.functions) {
        const binary = isSafeBinary(entry.requires) ? entry.requires : '';
        const guards = [];
        if (binary !== '') guards.push('command -v ' + binary + ' >/dev/null 2>&1');
        guards.push('! command -v ' + entry.name + ' >/dev/null 2>&1');
        lines.push('if ' + guards.join(' && ') + '; then');
        lines.push('  ' + entry.name + '() {');
        for (const line of entry.value.split('\n')) lines.push('    ' + line);
        lines.push('  }');
        lines.push('fi');
      }
    }
    return lines.join('\n');
  }

  function pwshPacks(packs) {
    const lines = [];
    for (const pack of packs) {
      for (const entry of pack.aliases) {
        const binary = isSafeBinary(entry.requires) ? entry.requires : '';
        const call = '__josh_alias -Name ' + quote(entry.name, 'pwsh')
          + ' -Body ' + quote(entry.value, 'pwsh');
        if (binary === '') {
          lines.push(call);
        } else {
          lines.push('if (Get-Command -Name ' + quote(binary, 'pwsh')
            + ' -ErrorAction SilentlyContinue) { ' + call + ' }');
        }
      }
    }
    return lines.join('\n');
  }

  /* ---------------------------------------------------------- pwsh prompt */

  function pwshPrompt(theme, slots, glyphs) {
    const reset = resetEscape('pwsh');
    const markers = glyphs === 'rich' ? KitRender.MARKERS.rich : KitRender.MARKERS.plain;

    const lines = [
      'function global:prompt {',
      '  $JoshExit = $LASTEXITCODE',
      '  if ($null -eq $JoshExit) { $JoshExit = 0 }',
      '  $JoshGit = __josh_git_collect',
      '  $JoshOut = ' + quote('', 'pwsh'),
    ];

    for (let i = 0; i < theme.segments.length; i += 1) {
      const segment = theme.segments[i];
      const colour = colourEscape(slots[segment.slot] || slots.fg, 'pwsh');
      const gap = i < theme.segments.length - 1 ? ' ' : '';
      const open = '$JoshOut += ' + quote(colour, 'pwsh') + ' + ';
      const close = ' + ' + quote(reset + gap, 'pwsh');

      switch (segment.type) {
        case 'cwd':
          lines.push('  ' + open + '(Get-Location).Path' + close);
          break;
        case 'git':
          lines.push('  if ($JoshGit) {');
          lines.push('    $JoshText = $JoshGit.Branch');
          lines.push('    if ($JoshGit.Detached) { $JoshText = ' + quote('(', 'pwsh')
            + ' + $JoshText + ' + quote(')', 'pwsh') + ' }');
          for (const key of KitRender.COUNTS) {
            const field = key.charAt(0).toUpperCase() + key.slice(1);
            lines.push('    if ($JoshGit.' + field + ' -gt 0) { $JoshText += '
              + quote(' ' + markers[key], 'pwsh') + ' + $JoshGit.' + field + ' }');
          }
          lines.push('    ' + open + '$JoshText' + close);
          lines.push('  }');
          break;
        case 'user':
          lines.push('  ' + open + '$env:USERNAME' + close);
          break;
        case 'host':
          lines.push('  ' + open + '$env:COMPUTERNAME' + close);
          break;
        case 'exit':
          if (segment.opts && segment.opts.onlyOnFailure === true) {
            lines.push('  if ($JoshExit -ne 0) { ' + open + '$JoshExit' + close + ' }');
          } else {
            lines.push('  ' + open + '$JoshExit' + close);
          }
          break;
        case 'char':
          lines.push('  $JoshOut += ' + quote(colour + KitRender.pickGlyph(segment, glyphs)
            + reset + gap, 'pwsh'));
          break;
        default:
          break;
      }
    }

    if (theme.multiline) lines.push('  $JoshOut += [Environment]::NewLine');
    lines.push('  return $JoshOut');
    lines.push('}');
    return lines.join('\n');
  }

  /* ------------------------------------------------------------------ emit */

  /**
   * @param theme    a theme, coerced here regardless of where it came from
   * @param packs    pack objects; one with an unacceptable name contributes
   *                 nothing at all, rather than contributing escaped garbage
   * @param dialect  zsh | bash | pwsh
   * @param options  { glyphs, ui, xterm }
   */
  function emit(theme, packs, dialect, options) {
    if (DIALECTS.indexOf(dialect) === -1) return '';

    const safeTheme = KitThemes.coerceTheme(theme);
    if (safeTheme === null) return '';

    const config = options && typeof options === 'object' ? options : {};
    const slots = KitRender.resolveSlots(config.ui, config.xterm);
    const glyphs = config.glyphs === 'rich' ? 'rich' : 'plain';

    const accepted = (Array.isArray(packs) ? packs : []).filter((pack) => {
      if (!pack || typeof pack !== 'object') return false;
      if (typeof pack.name !== 'string' || !PACK_NAME_PATTERN.test(pack.name)) return false;
      return Array.isArray(pack.aliases) && Array.isArray(pack.functions);
    });

    const wantsGit = safeTheme.segments.some((segment) => segment.type === 'git');
    const wantsAliases = accepted.some((pack) => pack.aliases.length + pack.functions.length > 0);

    const parts = ['# Generated by Josh. Not a dotfile; deleted when this session ends.'];

    if (dialect === 'pwsh') {
      if (wantsGit) parts.push(KitLib.PWSH_GIT);
      if (wantsAliases) parts.push(KitLib.PWSH_ALIAS, pwshPacks(accepted));
      parts.push(pwshPrompt(safeTheme, slots, glyphs));
      return parts.join('\n') + '\n';
    }

    parts.push('JOSH_ELISION=' + quote(glyphs === 'rich' ? '…' : '...', dialect));
    parts.push('JOSH_USER=${USER:-}');
    parts.push(dialect === 'zsh' ? 'JOSH_HOST=${HOST:-}' : 'JOSH_HOST=${HOSTNAME:-}');
    parts.push(KitLib.POSIX_PROMPT);
    if (wantsGit) parts.push(KitLib.POSIX_GIT, posixGitFormatter(glyphs));
    if (wantsAliases) parts.push(KitLib.POSIX_ALIAS, posixPacks(accepted, dialect));
    parts.push(posixColours(slots));
    parts.push(posixPrompt(safeTheme, dialect, slots, glyphs));
    parts.push(posixHooks(dialect));

    return parts.join('\n') + '\n';
  }

  return { DIALECTS, emit, wrap, quote, colourEscape, resetEscape, isSafeBinary };
});
