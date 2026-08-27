/**
 * Static shell snippets, as string constants.
 *
 * The prompt renders in the shell, at prompt time, so the git parser is shell
 * code and not JavaScript. It stays fixture-driven all the same: the test
 * suite pipes real porcelain-v2 fixtures through a real bash and zsh.
 *
 * Keeping the snippets here rather than inside kit-emit.js has two effects.
 * kit-emit.js stays a pure function of theme and packs, and these snippets can
 * be tested directly against the shells that will run them.
 *
 * ---------------------------------------------------------------------------
 * Two rules hold inside every template literal below, without exception:
 *
 *   1. Every dollar is written as a backslash-dollar, so that nothing here is
 *      interpolated by JavaScript. Shell and PowerShell both use bare dollars
 *      constantly; a single unescaped one would silently produce "undefined"
 *      in generated script.
 *   2. No backslash appears in the snippet text itself. Where a regular
 *      expression would want one, a bracket class is used instead.
 *
 * Both rules are mechanically checked: the ASCII test in test/kit-lib.test.js
 * covers rule 2's fallout, and every POSIX snippet is executed by a real shell.
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KitLib = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Git state for zsh and bash.
   *
   * __josh_git_parse reads porcelain-v2 on stdin and sets eight variables.
   * __josh_git_root walks up for a .git entry. __josh_git_collect joins them.
   */
  const POSIX_GIT = `
__josh_git_reset() {
  JOSH_GIT_BRANCH=""
  JOSH_GIT_DETACHED=0
  JOSH_GIT_AHEAD=0
  JOSH_GIT_BEHIND=0
  JOSH_GIT_STAGED=0
  JOSH_GIT_UNSTAGED=0
  JOSH_GIT_UNTRACKED=0
  JOSH_GIT_CONFLICTS=0
}

# Read porcelain-v2 on stdin.
#
# The XY field of a 1 or 2 record is two characters: index state then worktree
# state, a dot meaning unmodified. So MM is one staged change and one unstaged
# change, and the two counters are independent rather than a single "dirty".
__josh_git_parse() {
  __josh_git_reset
  __josh_oid=""

  while IFS=" " read -r __josh_kind __josh_rest; do
    case "\$__josh_kind" in
      "#")
        __josh_key=\${__josh_rest%% *}
        __josh_value=\${__josh_rest#* }
        case "\$__josh_key" in
          branch.oid)
            __josh_oid=\$__josh_value
            ;;
          branch.head)
            if [ "\$__josh_value" = "(detached)" ]; then
              JOSH_GIT_DETACHED=1
            else
              JOSH_GIT_BRANCH=\$__josh_value
            fi
            ;;
          branch.ab)
            __josh_ahead=\${__josh_value%% *}
            __josh_behind=\${__josh_value##* }
            JOSH_GIT_AHEAD=\${__josh_ahead#+}
            JOSH_GIT_BEHIND=\${__josh_behind#-}
            ;;
        esac
        ;;
      1|2)
        __josh_xy=\${__josh_rest%% *}
        case "\$__josh_xy" in
          .*) : ;;
          *) JOSH_GIT_STAGED=\$((JOSH_GIT_STAGED + 1)) ;;
        esac
        case "\$__josh_xy" in
          ?.) : ;;
          *) JOSH_GIT_UNSTAGED=\$((JOSH_GIT_UNSTAGED + 1)) ;;
        esac
        ;;
      u)
        JOSH_GIT_CONFLICTS=\$((JOSH_GIT_CONFLICTS + 1))
        ;;
      "?")
        JOSH_GIT_UNTRACKED=\$((JOSH_GIT_UNTRACKED + 1))
        ;;
    esac
  done

  # A detached head has no branch name, so it borrows the first seven
  # characters of the oid. An unborn branch has "(initial)" instead of an oid
  # and gets nothing.
  if [ "\$JOSH_GIT_DETACHED" = "1" ]; then
    case "\$__josh_oid" in
      "("*)
        JOSH_GIT_BRANCH=""
        ;;
      *)
        __josh_tail=\${__josh_oid#???????}
        if [ -n "\$__josh_tail" ] && [ "\$__josh_tail" != "\$__josh_oid" ]; then
          JOSH_GIT_BRANCH=\${__josh_oid%"\$__josh_tail"}
        else
          JOSH_GIT_BRANCH=\$__josh_oid
        fi
        ;;
    esac
  fi
}

# Walk up for a .git entry rather than letting git fail. A directory outside
# any repository then costs no process at all, which is most of the reason a
# git-aware prompt can stay fast.
__josh_git_root() {
  JOSH_GIT_ROOT=""
  __josh_dir=\$PWD
  while :; do
    if [ -e "\$__josh_dir/.git" ]; then
      JOSH_GIT_ROOT=\$__josh_dir
      return 0
    fi
    if [ -z "\$__josh_dir" ]; then
      return 1
    fi
    __josh_dir=\${__josh_dir%/*}
  done
}

# The root is cached, so repeated prompts inside one tree skip the walk.
__josh_git_collect() {
  __josh_root=""
  if [ -n "\$JOSH_GIT_CACHE_ROOT" ]; then
    case "\$PWD" in
      "\$JOSH_GIT_CACHE_ROOT"|"\$JOSH_GIT_CACHE_ROOT"/*)
        __josh_root=\$JOSH_GIT_CACHE_ROOT
        ;;
    esac
  fi

  if [ -z "\$__josh_root" ]; then
    if __josh_git_root; then
      __josh_root=\$JOSH_GIT_ROOT
    fi
    JOSH_GIT_CACHE_ROOT=\$__josh_root
  fi

  if [ -z "\$__josh_root" ]; then
    __josh_git_reset
    return 1
  fi

  __josh_status=\$(command git status --porcelain=v2 --branch 2>/dev/null)
  if [ -z "\$__josh_status" ]; then
    __josh_git_reset
    return 1
  fi

  __josh_git_parse <<< "\$__josh_status"
}
`;

  /**
   * The non-clobbering alias installer for zsh and bash.
   *
   * This is the rule the packs depend on: an alias is only ever defined when
   * nothing already answers to the name.
   */
  const POSIX_ALIAS = `
# Define an alias only when the name is free.
#
# "command -v" resolves aliases, functions, builtins, keywords and binaries on
# PATH alike, so this one test is what stops a two-letter alias shadowing a
# real program the user has installed. An explicit alias lookup runs first,
# because a non-interactive shell does not always report aliases through
# command -v.
#
# Names are [A-Za-z_][A-Za-z0-9_-]* with a single exception: two to four dots,
# so that .. and ... can navigate upward. Nothing else non-alphanumeric is
# ever defined.
__josh_alias() {
  __josh_name=\$1
  __josh_body=\$2

  case "\$__josh_name" in
    ..|...|....)
      :
      ;;
    [A-Za-z_]*)
      case "\$__josh_name" in
        *[!A-Za-z0-9_-]*) return 1 ;;
      esac
      ;;
    *)
      return 1
      ;;
  esac

  if alias -- "\$__josh_name" >/dev/null 2>&1; then
    return 1
  fi

  if command -v "\$__josh_name" >/dev/null 2>&1; then
    return 1
  fi

  alias "\$__josh_name=\$__josh_body"
}
`;

  /**
   * Git state for PowerShell 7. Windows PowerShell 5.1 is out of scope.
   *
   * Deliberate gap: these have no unit test, because exercising them needs
   * pwsh and only the Windows CI runner guarantees it. The end-to-end task
   * covers them and skips when pwsh is absent.
   */
  const PWSH_GIT = `
function global:__josh_git_root {
  \$dir = (Get-Location).ProviderPath
  while (\$dir) {
    if (Test-Path -LiteralPath (Join-Path \$dir '.git')) { return \$dir }
    \$parent = Split-Path -Parent \$dir
    if (\$parent -eq \$dir -or -not \$parent) { return \$null }
    \$dir = \$parent
  }
  return \$null
}

function global:__josh_git_parse {
  param([string[]] \$Lines)

  \$state = @{
    Branch = ''
    Detached = \$false
    Ahead = 0
    Behind = 0
    Staged = 0
    Unstaged = 0
    Untracked = 0
    Conflicts = 0
  }
  \$oid = ''

  foreach (\$line in \$Lines) {
    if (\$line.StartsWith('# branch.oid ')) {
      \$oid = \$line.Substring(13)
    } elseif (\$line.StartsWith('# branch.head ')) {
      \$head = \$line.Substring(14)
      if (\$head -eq '(detached)') { \$state.Detached = \$true } else { \$state.Branch = \$head }
    } elseif (\$line.StartsWith('# branch.ab ')) {
      \$parts = \$line.Substring(12).Split(' ')
      if (\$parts.Length -ge 2) {
        \$state.Ahead = [int] \$parts[0].TrimStart('+')
        \$state.Behind = [int] \$parts[1].TrimStart('-')
      }
    } elseif (\$line.StartsWith('1 ') -or \$line.StartsWith('2 ')) {
      \$xy = \$line.Substring(2, 2)
      if (\$xy[0] -ne '.') { \$state.Staged += 1 }
      if (\$xy[1] -ne '.') { \$state.Unstaged += 1 }
    } elseif (\$line.StartsWith('u ')) {
      \$state.Conflicts += 1
    } elseif (\$line.StartsWith('? ')) {
      \$state.Untracked += 1
    }
  }

  if (\$state.Detached -and \$oid -and -not \$oid.StartsWith('(')) {
    \$state.Branch = \$oid.Substring(0, [Math]::Min(7, \$oid.Length))
  }

  return \$state
}

function global:__josh_git_collect {
  \$root = __josh_git_root
  if (-not \$root) { return \$null }

  \$out = & git status --porcelain=v2 --branch 2>\$null
  if (\$LASTEXITCODE -ne 0 -or -not \$out) { return \$null }

  return __josh_git_parse -Lines @(\$out)
}
`;

  /**
   * The non-clobbering installer for PowerShell 7.
   *
   * A PowerShell alias cannot carry arguments, so an alias body becomes a
   * function that forwards whatever it is given. The dot names are accepted by
   * the same rule as POSIX, since PowerShell will take them as function names.
   */
  const PWSH_ALIAS = `
function global:__josh_alias {
  param([string] \$Name, [string] \$Body)

  if (\$Name -notmatch '^([A-Za-z_][A-Za-z0-9_-]*|[.][.][.]?[.]?)\$') { return }
  if (Get-Command -Name \$Name -ErrorAction SilentlyContinue) { return }

  \$forward = 'param([Parameter(ValueFromRemainingArguments = \$true)] \$JoshArgs) '
  \$body = \$forward + \$Body + ' @JoshArgs'
  Set-Item -Path ('function:global:' + \$Name) -Value ([ScriptBlock]::Create(\$body))
}
`;

  return { POSIX_GIT, POSIX_ALIAS, PWSH_GIT, PWSH_ALIAS };
});
