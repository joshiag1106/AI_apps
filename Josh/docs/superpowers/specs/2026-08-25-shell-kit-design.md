# Shell Kit — design

## The idea in one paragraph

Josh spawns your real shell and, today, tells it nothing. The Shell Kit gives
that shell a git-aware prompt, opt-in alias packs and configured completions —
the value people install oh-my-zsh for — without writing a single byte into
your dotfiles. Everything lives in a per-session temporary directory that
sources your own configuration first and is deleted when the session exits.
Because Josh is a GUI application, the kit can do two things a shell framework
structurally cannot: colour the prompt from the terminal's own active theme,
and detect whether your font actually has powerline glyphs before using them.

## Relationship to the Recall spec

[`2026-08-24-recall-foundation-design.md`](2026-08-24-recall-foundation-design.md)
contains a section titled "Why not just ship oh-my-zsh-style shell config"
which rejects this class of feature on three grounds. Two of those grounds are
answered here and one is accepted:

| Recall's objection | Resolution |
| --- | --- |
| "It pollutes — writing into `~/.zshrc` breaks that promise" | **Answered.** Nothing is written to any dotfile. The kit lives in a per-session `0700` temp directory, and the optional export writes to `~/.config/josh/`, which the *user* chooses to source. |
| "It is zsh-only" | **Answered.** zsh, bash and PowerShell 7, from one theme definition, via per-dialect emitters. |
| "It is not Josh's" | **Accepted, and inverted.** This is an original implementation, not a delivery mechanism for someone else's framework — and theme-linked colours plus glyph detection are capabilities oh-my-zsh cannot have. |

Recall's `shell-integration.js` and this document's `shell-integration.js` are
**the same module**. This spec builds it; Recall later adds OSC 133 hooks and a
nonce to the files it already generates. Building it twice would be the error.

The two features stay disjoint in scope. Inline history suggestion belongs to
Recall and is explicitly **not** in this spec, even though it is the fourth
thing people associate with oh-my-zsh.

## Prior art, honestly

- **oh-my-zsh** established the shape: a prompt theme setting, a list of opt-in
  plugins, a completion configuration. That shape is a user-interface
  convention, not code, and this implementation shares none of its source.
- **starship** demonstrated one cross-shell prompt driven from a single
  configuration. Josh reaches the same goal without starship's helper binary,
  because Josh's install promise is "no toolchain".
- **Powerlevel10k** popularised measuring and defending prompt latency. The
  concern is borrowed; the mitigation here is different and much simpler.
- **Powerline** established the filled-separator prompt aesthetic and the
  U+E0Bx private-use codepoints. Using published codepoints is not copying.

On copyright: no oh-my-zsh file, theme, function, variable name or curated
alias list is reused. Theme names are plain descriptive English words with no
oh-my-zsh lineage. Josh does not use `ZSH_THEME`, `plugins=()`, `ZSH_CUSTOM`,
or any `omz_`-prefixed identifier. Alias sets are derived mechanically from
each tool's own `--help` output under the documented rule in
[Packs](#5-srcsharedkit-packsjs). The kit ships under Josh's existing MIT licence.

## Goals

- A git-aware prompt that reflects branch, working-tree state, upstream
  divergence, last exit code and command duration.
- Opt-in alias packs that **never** shadow a command the user already has.
- Completion configured with sane defaults, using the shell's own system.
- Zero writes to the user's dotfiles, and zero new IPC channels.
- One theme definition renders identically in zsh, bash, PowerShell 7 and the
  in-app preview panel.
- Honest degradation: where the kit cannot install cleanly, it disables itself
  for that session rather than half-applying.

## Non-goals

- **Inline history suggestion.** Recall's, not this spec's.
- **Live reload into a running pane.** See [No live reload](#no-live-reload).
- **fish and cmd.exe.** fish is a later emitter; cmd.exe cannot support this.
- **Windows PowerShell 5.1.** VT processing is off by default there, so the
  prompt would render as visible escape codes. Deliberately excluded.
- **Replacing Tab.** Completion is configured, not reimplemented.
- **A plugin registry, or fetching anything.** Josh has no network access and
  this feature adds none. Packs ship in the app; user packs are local files.

---

## Architecture

Six new files. Four are pure and shared between the main process and the
renderer; one is main-process only; one is renderer-only.

```
 settings ──> kit-themes.js   theme + pack definitions as data, coerced
                    │
                    v
              kit-render.js   segments -> styled string   (pure, shared)
                 │       │
                 │       └──────────> kit-preview.js      renderer: the panel
                 v
              kit-emit.js     one theme -> zsh | bash | pwsh script text
                    │
                    v
        shell-integration.js  per-session 0700 temp dir, env, cleanup
                    │
                    v
             pty-manager.js   spawn with the generated env and args
```

| File | Responsibility | Pure |
| --- | --- | --- |
| `src/shared/kit-themes.js` | Theme definitions and coercion | yes |
| `src/shared/kit-render.js` | Segment assembly, colour and glyph resolution | yes |
| `src/shared/kit-emit.js` | Per-dialect script emitters | yes |
| `src/shared/kit-packs.js` | Alias and function pack definitions | yes |
| `src/main/shell-integration.js` | Temp rc files, env, lifecycle | no |
| `src/renderer/js/kit-preview.js` | Theme preview panel | no |

`src/shared/` is a new directory. It exists because the render function must
run in **both** processes — `require()` in main to generate the script,
`<script src>` in the renderer to draw the preview. The UMD wrapper already
used by `split-tree.js`, `themes.js` and `command-palette.js` handles both, and
the renderer's CSP (`script-src 'self'`) already permits loading from outside
`src/renderer/`, as the existing `../../node_modules/` script tags demonstrate.

Preview and reality cannot disagree, because they are one function.

### Files modified

| File | Change |
| --- | --- |
| `src/main/pty-manager.js` | Build integration on `create`, dispose on exit |
| `src/main/shell-resolver.js` | PowerShell 7 `-NoExit -Command` args when the kit is on |
| `src/main/settings.js` | New keys and their coercion |
| `src/main/validate.js` | Validate the glyph enum arriving on `pty:create` |
| `src/renderer/js/app.js` | Palette entries, panel wiring |
| `src/renderer/index.html` | Script tags for the shared modules and the panel |

---

## 1. `src/shared/kit-themes.js`

A theme is data, never code:

```js
{
  name: 'classic',
  multiline: false,
  segments: [
    { type: 'cwd',  slot: 'accent', opts: { truncate: 3 } },
    { type: 'git',  slot: 'muted' },
    { type: 'exit', slot: 'error',  opts: { onlyOnFailure: true } },
    { type: 'char', slot: 'accent', text: '❯', fallback: '>' },
  ],
}
```

Segment types: `user`, `host`, `cwd`, `git`, `exit`, `duration`, `jobs`,
`time`, `venv`, `char`.

`slot` names a **semantic colour**, not a hex value: `accent`, `ok`, `warn`,
`error`, `muted`, `fg`. Slots resolve against Josh's active colour theme, whose
`ui.accent` and `ui.muted` tokens already exist in `themes.js`, with `ok`,
`warn` and `error` mapping onto the theme's ANSI green, yellow and red.

The consequence is the feature's clearest differentiator: **your prompt is
coloured by your terminal theme**, and follows the automatic OS light/dark
switch already wired through the `theme:changed` event. A framework that lives
only in the shell cannot know what your terminal looks like.

### The five themes

| Name | Shape |
| --- | --- |
| `plain` | `cwd` + branch + char. One line, minimum ink, no colour beyond the prompt character |
| `classic` | `cwd` + git with dirty marker + exit code on failure + `❯` |
| `rail` | Filled separators between segments using U+E0B0; falls back to bracketed ASCII |
| `stack` | Two lines — context above, input below — so a long path never squeezes what you type |
| `context` | `user@host` + `cwd` + git + duration. For ssh and remote work |

Names are descriptive English words chosen to carry no lineage from any
existing framework's theme catalogue.

User themes are read from `~/.config/josh/shell-kit/themes/*.json` and coerced
by exactly the same function, so a malformed user theme degrades to the default
rather than producing broken shell script.

## 2. `src/shared/kit-render.js`

The pure core. Signature:

```js
render(theme, state, capabilities) -> { text: string, spans: Span[] }
```

`state` carries `{ cwd, home, user, host, git, exit, durationMs, jobs, venv,
time }`; `capabilities` carries `{ glyphs: 'rich'|'plain', colours, width }`.

Responsibilities: ordering segments, dropping empty ones, applying `cwd`
truncation and `~` substitution, resolving each `slot` to a concrete colour,
and choosing `text` or `fallback` per the glyph capability.

It returns **structured spans**, not escape codes. The renderer draws spans as
DOM; `kit-emit.js` converts spans to per-dialect escape sequences. Keeping
escaping out of the pure core is what makes the escaping testable in isolation,
and escaping is where prompts break.

## 3. `src/shared/kit-emit.js`

Turns spans into script text for one dialect. Three emitters behind one
interface: `emit(theme, dialect, options) -> string`.

Zero-width marking is the whole reason this module is separate:

| Dialect | Non-printing sequences must be wrapped in | Consequence if wrong |
| --- | --- | --- |
| zsh | `%{` … `%}` | Line wrapping and `Ctrl+A` compute the wrong column |
| bash | `\[` … `\]` | Same, plus corrupted redraw on history recall |
| PowerShell 7 | nothing — PSReadLine measures VT itself | Stray markers print literally |

Each emitter has golden-string tests, and a shared test asserts that no zsh or
bash marker ever leaks into PowerShell output.

The emitted script defines a prompt function and installs it via the dialect's
own hook: `add-zsh-hook precmd` in zsh, `PROMPT_COMMAND` in bash, a wrapped
`prompt` function in PowerShell.

## 4. Git status, and its cost

One call per prompt, at most:

```
git status --porcelain=v2 --branch
```

`--porcelain=v2` is a documented, stability-guaranteed machine format, so the
parser is pure and driven by fixtures. It yields branch name from
`# branch.head`, divergence from `# branch.ab +N -M`, and staged / unstaged /
untracked counts from the `1`, `2`, `u` and `?` record types.

**On latency, accurately.** An earlier draft of this design promised a hard
timeout on the git call. That is not portably achievable: macOS ships no
`timeout(1)`, and a background-subshell-plus-`kill` costs more than the call it
is meant to guard. The real mitigations are:

- **Cache per session**, keyed on `cwd` plus the mtime of `.git`. Repeated
  prompts in an unchanged repository cost nothing.
- **`shellKitGitUntracked`** (default `true`). Untracked-file scanning is the
  expensive part in large working trees; turning it off swaps
  `--untracked-files=no` in and keeps everything else.
- **Per-path opt-out** via `shellKitGitSkip`, a list of path prefixes where the
  git segment is not rendered at all.

Outside a repository, no `git` process is spawned — the kit walks up for a
`.git` entry itself, which is cheaper than letting git fail.

## 5. `src/shared/kit-packs.js`

Four packs, roughly 115 aliases in total, each a data object of
`{ name, aliases, functions, requires }`.

| Pack | Size | Covers |
| --- | --- | --- |
| `git` | ~30 | status, add, commit, branch, checkout, diff, log, push/pull, stash, rebase, plus helper functions for current branch and pruning merged branches |
| `core` | ~25 | listing variants, `..`/`...`, `mkcd`, history helpers, `path` printer, archive extractor |
| `dev` | ~35 | npm and node, python/pip/venv, docker and compose |
| `systems` | ~25 | make, gcc/clang with useful warning flags, gdb/lldb, cargo, `objdump`/`nm`/`readelf` helpers |

**Derivation rule.** Each alias is generated from its tool's own `--help`
subcommand list under a stated mnemonic: the tool's initial, then the
subcommand's initials, disambiguated by appending the next consonant. This is
mechanical and reproducible from primary sources, which is both the reason the
sets are defensible and the reason they are predictable to learn.

**Packs never clobber.** Before defining any name, the emitted script checks
whether it is already an alias, a shell function, or **an executable on
`PATH`**, and skips it if so. This directly fixes a known oh-my-zsh complaint —
its `gs` alias shadows Ghostscript — and guarantees your own definitions win.
`command -v` is a builtin, so the check costs no process spawns.

`requires` names the underlying binary. A pack whose tool is not installed
defines nothing.

Interactive `rm -i` / `cp -i` / `mv -i` are **not** in `core`. Aliasing `rm` is
contentious enough to deserve its own opt-in flag, `shellKitSafeRemove`.

User packs load from `~/.config/josh/shell-kit/packs/*.json`, coerced by the
same function, subject to the same non-clobbering rule.

## 6. `src/main/shell-integration.js`

Per session: create a `0700` directory under `os.tmpdir()` with an unpredictable
name, write the generated files, return `{ env, args, dispose }`. `dispose`
removes the directory and is called from `pty-manager.js` on exit, alongside the
existing `_destroy` path.

### Per-shell support

| Shell | Mechanism | Support |
| --- | --- | --- |
| zsh | `ZDOTDIR` at a generated directory | Full |
| bash | inherited `PROMPT_COMMAND`, self-disarming | Full, with one caveat |
| PowerShell 7 | `-NoExit -Command` after profile load | Full |
| Windows PowerShell 5.1 | — | Excluded; VT off by default |
| fish, cmd.exe | — | Not in this spec |

**zsh, and the subtlety that matters.** Setting `ZDOTDIR` redirects *all four*
startup files, not just `.zshrc`. Forwarding only `.zshrc` silently loses the
user's `.zshenv` and `.zprofile` — which on macOS is where `PATH` usually comes
from. Josh generates:

- `.zshenv` — record the real `ZDOTDIR` (or `$HOME`), source the user's
- `.zprofile` — source the user's
- `.zshrc` — source the user's, **then** install the kit, **then**
  `export ZDOTDIR` back to the real value
- no `.zlogin` — `ZDOTDIR` is restored by then, so zsh finds the user's

Restoring `ZDOTDIR` inside `.zshrc` is what stops every nested zsh from
re-running the integration. It has a dedicated test.

**bash, and its honest caveat.** `--rcfile` is ignored for login shells, and
Josh starts login shells deliberately (`loginArgsFor` in `shell-resolver.js`).
`PROMPT_COMMAND` is inherited through the environment and runs before the first
prompt, so the kit installs from there and then removes itself from
`PROMPT_COMMAND`. A `.bashrc` that *assigns* `PROMPT_COMMAND` rather than
appending to it wipes the hook; Josh then does nothing at all rather than
partially applying. This is exactly the case the optional export covers, so
bash is automatic in the common case and manual in the guaranteed one.

**PowerShell 7.** Profiles load before `-Command`, so the user's profile wins
and Josh appends after it.

**Disabled paths.** The kit takes no action, for that session, when: the user
has set `shellArgs` (Josh must not silently override an explicit choice); the
resolved shell is not one of the three supported; the temp directory cannot be
created; or the resolved shell is PowerShell 5.1.

### The optional export

`~/.config/josh/shell-kit/init.zsh` (and `.bash`, `.ps1`) is written when
`shellKit` is enabled, so the kit can be used in other terminals. Josh writes
**only** inside its own config directory and **never** edits a dotfile; adding
the `source` line is the user's action, shown in the palette and the README.

## 7. Glyph detection

The renderer measures, in a canvas using the configured terminal font, the
advance width of U+E0B0 (powerline right separator) against U+10FFFD, a plane-16
private-use codepoint no font defines. Equal widths mean both fell back to the
same missing-glyph box, so the font has no powerline coverage.

The result travels as a validated `'rich' | 'plain'` enum inside the **existing**
`pty:create` payload. No new IPC channel; the trust boundary stays at 16.
`shellKitGlyphs` overrides it to `rich` or `plain` if detection is ever wrong.

## 8. `src/renderer/js/kit-preview.js`

A panel reusing the palette's existing backdrop and dialog styling, listing the
themes with each rendered live.

**What is real and what is sampled.** Real: your cwd (the renderer already
receives it on `pty:cwd`), your colour theme, your font, and the actual
`kit-render` function. Sampled: git state — branch `main`, 1 staged, 2 modified,
1 ahead — and both exit states, shown side by side, in both glyph modes.

Git state is sampled deliberately. Rendering *live* git would require the
renderer to run `git`, which means a new IPC channel and Josh spawning
processes of its own — expanding the trust boundary for a preview. The sample
is labelled as a sample in the UI. Selecting a theme calls the existing
`settings:set`.

The panel follows the palette's keyboard and `role="listbox"` pattern, so it is
navigable without a mouse.

## No live reload

Applying a theme to an already-running pane means writing `source …` into a live
PTY. That is only safe if the shell is sitting at a prompt — and without
Recall's OSC 133 marking, Josh cannot know whether it is. If the pane is inside
`vim`, those keystrokes are typed into the user's file.

So changes apply to new tabs and panes. The palette offers "New Tab with Kit"
rather than injecting into a running shell. When Recall lands and prompt state
becomes authenticated, safe live reload becomes possible and gets its own spec.

## Settings

Extending `settings.js`; unknown keys ignored and bad values replaced, per the
coercion rules already in place.

| Key | Default | Meaning |
| --- | --- | --- |
| `shellKit` | `false` | Master switch |
| `shellKitPrompt` | `"classic"` | Theme name, built-in or user |
| `shellKitPacks` | `["git","core"]` | Enabled packs, allowlisted names |
| `shellKitGlyphs` | `"auto"` | `auto`, `rich` or `plain` |
| `shellKitGitUntracked` | `true` | Scan untracked files in the git segment |
| `shellKitGitSkip` | `[]` | Path prefixes where the git segment is skipped |
| `shellKitSafeRemove` | `false` | Interactive `rm`/`cp`/`mv` aliases |

**Why the master switch defaults off.** Silently replacing the prompt of a user
running starship, Powerlevel10k or oh-my-zsh on a version upgrade would be
hostile. Enabling it detects a known framework in the environment and reports
the conflict in the palette rather than fighting it. Discovery comes from the
palette and the README, not from surprise.

## Threat model

The kit generates shell script, so its inputs deserve the same suspicion
`settings.js` already applies to its file.

- **No renderer input reaches generated script.** Theme and pack names arrive
  through `settings:set` and are checked against an allowlist of known names
  before use; free-form strings are never interpolated into script text.
- **User themes and packs are data, not code.** They are JSON, parsed with
  `JSON.parse`, coerced field by field. Alias *values* are single-quoted with
  embedded quotes escaped per dialect, and alias *names* must match
  `^[A-Za-z_][A-Za-z0-9_-]*$`. A pack cannot smuggle a command substitution.
- **The temp directory is `0700`** with an unpredictable name under the OS temp
  directory, and is removed on session exit.
- **Shell paths still never come from the renderer**; `shell-resolver.js` is
  unchanged in that respect.
- **No dotfile is read for execution** — the generated files `source` the
  user's own configuration, which is the user's own code running as it already
  would.

This adds no network access, no new IPC channel, and no new privilege.

## Testing

Roughly 45–55 tests on top of the existing 81.

| Area | What is asserted |
| --- | --- |
| `kit-render` | Segment ordering, empty-segment dropping, `cwd` truncation and `~`, slot resolution, glyph fallback |
| `kit-emit` | Golden strings per dialect; **zero-width markers correct in zsh and bash and absent in pwsh** |
| Escaping | Alias values containing quotes, `$`, backticks and newlines round-trip inertly |
| Git parser | Fixtures: clean, dirty, staged-only, untracked, detached HEAD, no upstream, ahead/behind, merge conflict |
| `kit-packs` | Non-clobbering against existing alias / function / `PATH` binary; `requires` gating; name-pattern rejection |
| `shell-integration` | File contents per shell, `ZDOTDIR` restore, temp cleanup on exit, every disabled path |
| `settings` | Coercion and clamping of all seven new keys |
| E2E | Boot real zsh with the kit on; assert a rendered prompt, a working alias, and clean stderr |
| Budget | Kit adds under 40 ms to shell startup, measured on the E2E shell |

The escaping and zero-width tests matter most. A prompt that miscounts its own
width corrupts every wrapped line, and it is the most common defect in this
entire category of software.

## Deferred

- **fish emitter.** One new emitter against the existing theme data.
- **Live reload**, once Recall's OSC 133 marking makes prompt state knowable.
- **Live git in the preview**, if the extra IPC channel is ever judged worth it.
- **Right-hand prompt** (`RPROMPT`) and transient prompts.
- **Completion definitions for individual tools.** This spec configures the
  shell's completion system; it writes no per-CLI completion specs.
