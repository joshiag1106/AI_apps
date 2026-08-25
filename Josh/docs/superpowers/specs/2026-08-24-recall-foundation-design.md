# Recall: semantic shell integration + inline suggestion — design

## The idea in one paragraph

Josh learns which commands actually **worked**, and **where**. Every finished
command yields a directory, an exit code, a duration, and its neighbours in
time. From that signal Josh suggests what to run next — inline, as you type.
No cloud model (Josh has no network access and never will), no hand-maintained
corpus of per-CLI completion specs, no shell plugins installed into your
dotfiles. The whole thing bootstraps from your own observed history.

This document specifies the **foundation** plus **one thin feature** proving it
works end to end. Auto-indent and the context palette are deliberately out of
scope; see [Deferred](#deferred-to-later-specs).

## Why not just ship oh-my-zsh-style shell config

oh-my-zsh is a zsh plugin framework: it installs into your dotfiles, works only
with zsh, and delivers value through aliases, prompt themes and completion
definitions. Three problems for Josh:

1. **It is not Josh's.** Josh would be a delivery mechanism for someone else's
   framework, with no distinct identity.
2. **It is zsh-only.** Josh supports zsh, bash, fish, PowerShell and cmd. A
   zsh-only feature is a feature most Windows users never see.
3. **It pollutes.** Josh's whole posture is that it does not modify your system
   (see `SECURITY.md`). Writing into `~/.zshrc` breaks that promise.

So the features live in the **terminal**, not the shell. That is the whole
architectural bet of this document.

## Prior art, honestly

- **fish** and `zsh-autosuggestions` pioneered inline ghost-text suggestion from
  history. Josh's suggestion UI is the same well-known interaction; that part is
  not novel and is not claimed to be.
- **[McFly](https://github.com/cantino/mcfly)** already ranks shell history using
  working directory and exit status. The core ranking insight is therefore *not*
  original to Josh, and this document does not pretend otherwise.
- **Warp** and **Fig / Amazon Q** do terminal-side completion backed by a large,
  hand-maintained corpus of per-CLI completion specs.
- **OSC 133** semantic prompt marking is a published de-facto convention
  originating with FinalTerm, implemented by iTerm2, kitty, WezTerm, VS Code and
  Windows Terminal. Implementing a published protocol is not copying anyone.

Where Josh goes past all of the above:

- **Repair-pair learning** — a failed command followed shortly by a successful
  one teaches a correction, with no typo dictionary and no static rules.
- **Project-fingerprint transfer** — knowledge moves between directories that
  look alike, so a freshly cloned Rust repo suggests `cargo test` on first visit.
- **Nonce-authenticated shell integration** — Josh ignores OSC 133 sequences it
  did not provoke, so hostile terminal output cannot spoof prompt state or poison
  the history store. No other terminal appears to do this.
- **Zero corpus, zero network, zero dotfile writes** — the integration exists only
  inside the shell process Josh spawned.

On copyright: nothing here reuses oh-my-zsh's, Warp's or Fig's code or data.
OSC 133 is a protocol, and protocols are not copyrightable subject matter.

## Goals

- Josh knows, reliably, where a prompt begins, where user input begins, when a
  command starts running, and what exit code it returned.
- That knowledge is **authenticated** — untrusted terminal output cannot forge it.
- A local, privacy-respecting store of command provenance, with secret redaction.
- Inline ghost-text suggestion that is *right often enough to trust*, and silent
  whenever Josh is not confident.
- Nothing written to the user's dotfiles, ever. No network access, ever.
- Graceful, honest degradation on shells where integration is impossible.

## Non-goals

- Replacing the shell's own Tab completion. Tab stays the shell's key.
- Defending against malicious code the user *executes* (see
  [Threat model](#threat-model-and-its-limits)).
- Supporting `cmd.exe` fully — see [Per-shell support](#per-shell-support).
- Auto-indent, the context palette, block-based UI. All deferred.

---

## Architecture

Six new modules. Five are in the main process; one is renderer-side.

```
 shell spawn ──> shell-integration.js   builds a per-session rc, sets env, mints a nonce
                          │
 PTY output ────> semantic-parser.js    parses OSC 133, rejects unauthenticated sequences
                          │
                          ├──────────> recall-store.js    append-only JSONL, redacted, 0600
                          │                    │
 keystrokes ────> input-tracker.js              │   tracks the in-progress line, or gives up
                          │                    │
                          └────> recall-rank.js ◄┘   pure scoring function, no I/O
                                       │
                                  IPC event
                                       │
                          renderer: suggestion.js   dim ghost text after the cursor
```

### 1. `src/main/shell-integration.js`

Produces, per PTY session: a nonce, a set of environment variables, and
(for some shells) a temporary directory holding a generated rc file.

The rc file **sources the user's real configuration first**, then installs
hooks. The user's own setup always wins; Josh only appends behaviour.

The temp directory is created mode `0700` under the OS temp dir, owned by the
session, and removed when the session exits.

Hooks emit four sequences, each carrying the session nonce:

| Sequence | Meaning | Payload |
| --- | --- | --- |
| `OSC 133 ; A ; nonce=<hex> ST` | prompt starts | — |
| `OSC 133 ; B ; nonce=<hex> ST` | user input starts | — |
| `OSC 133 ; C ; nonce=<hex> ; cmd=<pct-encoded> ST` | command begins running | the command line |
| `OSC 133 ; D ; nonce=<hex> ; <exitcode> ST` | command finished | exit status |

The command text travels in `C` rather than being reconstructed from
keystrokes, because the shell knows it exactly and Josh does not (history
recall, the shell's own Tab completion, and `Ctrl+R` all mutate the line
without Josh seeing meaningful keystrokes).

### 2. `src/main/semantic-parser.js`

Extends the OSC scanning already present in `pty-manager.js` (`OSC7` /
`OSC7_HINT`), following the same shape: a cheap substring guard before running
any regex, because this runs on every output chunk.

Rules:

- A sequence whose `nonce` is absent or does not match the session's nonce is
  **ignored entirely** — not logged as an error, not partially applied.
- State is a small machine per session: `idle → prompt(A) → input(B) →
  running(C) → idle(D)`. Out-of-order transitions reset to `idle` rather than
  throwing; a shell can always be interrupted mid-sequence.
- Sequences are left in the stream forwarded to the renderer. xterm.js ignores
  OSC codes it does not implement, and rewriting the stream risks corrupting
  multi-byte or split chunks for no benefit.

### 3. `src/main/input-tracker.js`

Between `B` and `C`, Josh needs the *partially typed* line to offer a
suggestion — and here it genuinely must infer, since no sequence fires per
keystroke.

The tracker consumes what Josh writes to the PTY (the existing `pty:write`
path) and models only what it can model with certainty: printable characters
and backspace. **Anything else invalidates it** — arrow keys, any control
sequence, Tab, paste. While invalidated, Josh emits no suggestions at all. The
next `B` resyncs it.

This is deliberately pessimistic. A wrong suggestion is worse than no
suggestion, and an honest "I don't know" costs nothing.

### 4. `src/main/recall-store.js`

Append-only JSONL at `~/.config/josh/recall.jsonl`, written with the same
atomic-`0600` discipline `settings.js` already uses.

One record per completed command:

```json
{"v":1,"ts":1756022400,"cmd":"cargo test","cwd":"/home/u/proj","fp":["cargo","git"],"exit":0,"ms":8421}
```

- `v` — schema version, so the format can change without breaking old stores.
- `fp` — the directory fingerprint: which marker files were present
  (`package.json` → `npm`, `Cargo.toml` → `cargo`, `.git` → `git`, and so on).
  This is what lets knowledge transfer between similar projects.
- An in-memory index is built at startup and updated incrementally.
- The file is compacted when it exceeds `recallMaxEntries`, keeping the most
  recent and the most-used records.

**Redaction is mandatory and happens before anything touches disk.** A command
is dropped entirely — never truncated, never partially stored — if it matches
any of: an assignment to a variable whose name looks secret-ish
(`*_TOKEN`, `*_KEY`, `*_SECRET`, `*PASSWORD*`), a flag like `--password`,
`--token`, `--api-key`, a long high-entropy base64/hex literal, or any pattern
in the user's `recallExcludePatterns` setting. Recording a shell history is a
genuinely sensitive act and the default must be conservative.

### 5. `src/main/recall-rank.js`

A **pure function** — no filesystem, no Electron, no clock (time is passed in).
This is where the interesting behaviour lives, and purity is what makes it
properly testable, matching how `validate.js`, `split-tree.js` and
`shell-resolver.js` are already structured in this codebase.

```js
rank(candidates, { prefix, cwd, fingerprint, now }) -> ranked[]
```

Scoring combines:

- **Locality** — exact `cwd` match ranks above a fingerprint match, which ranks
  above a global match.
- **Outcome** — `exit === 0` is boosted; a non-zero exit is heavily demoted.
- **Recency** — exponential decay on `ts`.
- **Frequency** — repetition counts, sublinearly, so one habit does not drown
  everything else.
- **Repair pairs** — when a failed command is followed within a short window by
  a similar successful one, the pair is recorded. Typing the failing form then
  suggests the form that actually worked.

### 6. `src/renderer/js/suggestion.js`

Dim ghost text rendered after the cursor, as an absolutely-positioned overlay
aligned to the cursor cell (the WebGL renderer draws to a canvas, so the
suggestion cannot be a terminal cell).

- **Right Arrow** or **End** accepts, matching fish and `zsh-autosuggestions`.
- **Esc** dismisses until the next keystroke.
- **Tab is untouched** — it belongs to the shell's own completion, and stealing
  it would break every existing muscle memory.

Accepting writes the remaining text through the existing `pty:write` channel.
No new privileged capability is involved.

## IPC and the trust boundary

The renderer stays hostile-by-assumption. Because the main process already owns
every input (it sees PTY output *and* the writes the renderer requests), the
renderer never needs to *ask* for a suggestion — main pushes one.

That means:

- **One new event channel: `recall:suggestion`.** Payload `{sessionId, text}`.
- **Zero new invoke channels.**

The payload is sanitised in main before being sent — control characters
stripped and length clamped, exactly as `sanitizeTitle` in
`src/main/validate.js` already does for OSC-supplied titles. Suggestion text
derives from previously executed commands, so it must be treated as data, not
as something safe to hand a renderer verbatim.

## Per-shell support

| Shell | Mechanism | Support |
| --- | --- | --- |
| zsh | `ZDOTDIR` pointing at a generated `.zshrc` that sources the user's, plus `precmd`/`preexec` hooks | Full |
| bash | inherited `PROMPT_COMMAND`, which installs a `DEBUG` trap on first run | Full |
| fish | `--init-command`, plus `fish_preexec` / `fish_postexec` events | Full |
| PowerShell | a wrapped `prompt` function installed via `-Command` | Full |
| cmd.exe | `PROMPT` with `$E` embedded escapes | Prompt marking only — no exit code, no command text |

Two constraints worth calling out, because both are easy to get wrong:

- **bash cannot use `--rcfile` here.** Josh starts POSIX shells as *login*
  shells (`loginArgsFor` in `src/main/shell-resolver.js`), and `--rcfile` is
  ignored for login shells. `PROMPT_COMMAND` is inherited through the
  environment and works regardless, which is why it is the chosen mechanism.
- **zsh's generated `.zshrc` must restore `ZDOTDIR`** before sourcing the user's
  configuration, or every nested zsh the user launches inherits Josh's
  directory and re-runs the integration.

Where integration cannot be established, Josh **disables Recall for that
session** rather than falling back to heuristic prompt detection. Guessing
prompt boundaries from raw output is exactly the kind of fragile inference that
produces confidently wrong suggestions.

## Settings

Extends the existing settings file; unknown keys are ignored and out-of-range
values clamped, per the coercion rules already in `settings.js`.

| Key | Default | Meaning |
| --- | --- | --- |
| `recall` | `true` | Master switch for shell integration and history recording |
| `recallInlineSuggest` | `true` | Ghost-text suggestions while typing |
| `recallExcludePatterns` | `[]` | Extra regexes; matching commands are never recorded |
| `recallMaxEntries` | `50000` | Store is compacted beyond this |

## Threat model, and its limits

Josh's stated posture is that terminal output is fully attacker-controlled — a
hostile file, log, or HTTP response chooses what Josh receives. Semantic prompt
marking makes that worse in an interesting way: output that can *forge prompt
state* could make Josh record fabricated history, or suggest an attacker's
command at a moment the user is likely to accept it.

The nonce closes that hole. Josh mints a fresh random nonce per session and
ignores any OSC 133 sequence not carrying it. `cat`-ing a file full of crafted
sequences achieves nothing.

**What the nonce does not defend against**, stated plainly: any program the user
actually *runs* inherits the shell's environment and can therefore read the
nonce and forge sequences. That is not a defect unique to Josh — a process
running in your shell can already read your keystrokes' effects, your files and
your environment, and no terminal emulator can prevent it. The nonce defends
against untrusted **output**, which is the realistic and stated threat; it does
not defend against untrusted **execution**, which is out of scope for any
terminal.

Two further mitigations:

- The store is `0600`, and redaction runs before any write, so a leaked store
  is bounded in what it can contain.
- Suggestions are sanitised before crossing to the renderer, so a malformed
  historical command cannot inject control sequences into the UI.

## Testing

The design is deliberately shaped so the interesting logic is pure and testable
on any platform without booting Electron — the same approach that lets
`shell-resolver.test.js` exercise Windows behaviour from a Mac.

- `recall-rank.js` — pure. Ranking, decay, locality ordering, repair pairs, all
  unit tested with injected `now`.
- `semantic-parser.js` — pure over a string. Correct sequences parse; **wrong
  and missing nonces are rejected**; split-across-chunks sequences reassemble;
  out-of-order transitions reset cleanly.
- `input-tracker.js` — pure. Printable characters accumulate, backspace removes,
  and every control sequence invalidates.
- `recall-store.js` — redaction is the critical path and gets its own tests:
  each secret-shaped command class is dropped, and ordinary commands survive.
- `shell-integration.js` — the generated rc text is asserted as a string
  (sources user config first, restores `ZDOTDIR`); actually launching each of
  five shells is a CI concern, not a unit-test one.

## Deferred to later specs

Recorded here so the decisions already made are not lost:

- **Auto-indent** — structural indentation of multi-line command composition,
  tracking unbalanced `do`/`if`/`case`/quotes/heredocs and dedenting on `done`,
  `fi`, `esac`, `}`. Decided: **conservative, enabled by default** — active only
  at an authenticated prompt, never inside a heredoc, never while a foreground
  program is running. Needs the foundation in this document first.
- **Context palette** — extending the existing command palette
  (`src/renderer/js/command-palette.js`) from app commands into a
  "what do I run here" launcher fed by the same ranking function. This is the
  surface that replaces oh-my-zsh's aliases-and-plugins role.
- **Block UI** — with `A`/`D` boundaries known, per-command exit code and
  duration in a gutter, and collapsible output, become possible.

## Open question

Suggestion latency budget is unmeasured. Ranking runs per keystroke against an
in-memory index of up to `recallMaxEntries` records; if that proves too slow at
the top of the range, the index needs a prefix trie rather than a linear scan.
Worth measuring during implementation rather than designing speculatively now.
