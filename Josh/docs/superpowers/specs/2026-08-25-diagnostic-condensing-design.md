# Diagnostic condensing — design

## The idea in one paragraph

Compilers and runtimes bury the one line you need under hundreds you do not.
A C++ template error is 200 lines of instantiation stack around a single
mistake; a Java stack trace is 80 frames of which 3 are yours. Josh renders the
terminal, so Josh can condense that as it streams — showing the error, the
frame that belongs to *your* code, and a count of what was hidden — while
keeping the original bytes one keystroke away.

This document specifies the **engine**, which is language-agnostic, plus the
**first matcher** (C++). Further matchers get their own, much smaller specs.

## The unifying insight

Every language has the same problem in a different dialect: *which frame is
mine, and which belongs to the library?*

| Language | "Not mine" means |
| --- | --- |
| C++ | `/usr/include`, `/bits/`, `.../c++/…` |
| Java / Scala | `java.base`, `org.springframework`, `jakarta.*` |
| Python | `site-packages` |
| Node / TypeScript | `node_modules`, `node:internal` |
| Go | `runtime/`, `$GOROOT` |

Answering that question once, and expressing it per ecosystem, is the whole
feature. Line-count reduction is a side effect; finding the user's frame is the
value.

## Goals

- Condense verbose diagnostics inline, automatically, with no change to any
  build command — it must work inside `make`, `cmake`, `cargo`, and over `ssh`.
- **Never lose output.** The original is always recoverable, and any uncertainty
  results in the untouched bytes being displayed.
- **Never corrupt a full-screen program.** `vim`, `htop`, `less` and `tmux` must
  be untouched.
- Make adding a language a small, self-contained change.

## Non-goals

- Editing, authoring, compiling, or any language-server behaviour. Josh is a
  terminal; `vim` and `clangd` already run inside it.
- Any network access, consistent with the app-wide CSP.
- **A Rust matcher.** Rust's diagnostics are already condensed, coloured, and
  carry inline suggestions. Condensing them would degrade output that is better
  than anything this feature produces. This is a deliberate omission, not a gap
  to be filled later.
- Warning storms, user-supplied matchers, and Assembly (assembler diagnostics
  are already one-liners).

## Architecture

Four new files, following the flat, UMD-wrapped convention already used by
`command-palette.js` and `split-tree.js` — `module.exports` in Node, a global in
the renderer — so the pure logic is unit-testable without a browser.

| File | Responsibility | Pure |
| --- | --- | --- |
| `src/renderer/js/diagnostics.js` | Streaming state machine and safety guards | yes |
| `src/renderer/js/diagnostic-matchers.js` | Registry plus the C++ matcher | yes |
| `src/renderer/js/demangle.js` | Itanium ABI demangler subset | yes |
| `src/renderer/js/diagnostic-overlay.js` | Expand UI, xterm decorations | no |

Integration is one hook in `terminal-pane.js`, where `write()` currently calls
`this.term.write(data)` directly.

**No IPC changes and no main-process changes.** The trust boundary stays at 16
channels. The renderer already holds this data; processing it there grants no
capability it did not have, and a compromised renderer could already lie about
what it displays.

## The matcher interface

The registry is what makes "all languages" incremental. A matcher is a plain
object with no I/O:

```js
{
  id: 'cxx-template',
  starts: [/\bin instantiation of\b/i, /\brequired from here\b/],
  isEnd: (lines) => boolean,
  isVendorPath: (path) => boolean,
  condense: (lines, { cwd }) => ({ headline, location, hiddenCount }) | null,
}
```

Matchers are consulted in registration order; the first whose `starts` matches
an incoming line claims the block. `condense` returning `null` means "I opened
this block but cannot summarise it confidently" and fails open like any other
uncertainty.

`cwd` comes from the pane, which already tracks it via the OSC 7 parsing in
`pty-manager.js`. Preferring paths under the working directory sharpens the
"is this frame mine" judgement considerably.

## The streaming state machine

The naive design breaks interactive prompts: buffering everything while
deciding whether a block is a diagnostic means `Enter your name: ` — which has
no trailing newline — never appears, and the terminal looks hung.

**Only complete lines are ever buffered. Partial lines always pass straight
through.**

```
PASSTHROUGH
  partial line   -> emit immediately
  complete line  -> queue; flush on a 16ms timer or 64 lines
                    if it matches a matcher's `starts` -> BUFFERING

BUFFERING
  suspend the flush timer and accumulate
  caps: 500 lines or 200ms
  block end      -> if the block is shorter than condenseDiagnosticsMinLines,
                      flush verbatim (it was already readable)
                    else condense, emit the summary, retain the original
  cap or anomaly -> flush verbatim
```

The length check happens at block end rather than at block start, because the
length is not known until the block closes — a diagnostic cannot be measured
before it has finished arriving.

The 16ms line-queue latency sits on top of the 8ms output batching
`pty-manager.js` already performs deliberately. It is consistent with the
existing design and below perception.

**Why buffer rather than retract.** Recently written lines can be erased with
cursor-up plus erase-display, but only while they remain on screen. A 200-line
error has already scrolled into scrollback, which ANSI cannot reach. Deciding
before writing is the only correct option.

## Safety guards

Losing output is unacceptable; failing to condense is merely disappointing.
Every guard resolves toward displaying the original bytes.

| Guard | Rule |
| --- | --- |
| Alternate screen | Track `ESC[?1049h/l` and legacy `?47`, `?1047`. Inside it, pure passthrough with no line assembly at all |
| Escape sequences | Permit only SGR colour (`ESC[…m`). Diagnostics colour text; they never move the cursor. Anything else fails open |
| Partial line while buffering | Fails open — compilers do not split diagnostics mid-line |
| Caps | 500 lines or 200ms |
| Confidence | `condense` returning `null` fails open |

## Condensed output

```
error: no matching function for call to 'push_back'
  your code: src/widget.cpp:42:15
  ↳ 178 lines of instantiation stack hidden — ⌥↵ to expand
```

```
link error: undefined reference to std::vector<int>::push_back(int const&)
  referenced from: main() at main.cpp
  ↳ 3 lines hidden — ⌥↵ to expand
```

The `your code:` line is the product. It is the first frame whose path
`isVendorPath` rejects, preferring paths under `cwd`. When no such frame exists
— an error genuinely inside a library — the matcher returns `null` and the
original is shown, because a summary that cannot point at the user's code is
not worth the transformation.

## The first matcher: C++

Two families, per the scoping decision.

**Template instantiation.** Keys off both compilers' vocabulary: GCC's
`In instantiation of`, `required from`, `required from here`; Clang's
`in instantiation of … requested here`; and the shared
`^(.+):(\d+):(\d+):\s+(error|note|warning):` line shape.

**Linker.** Keys off `undefined reference to`, `duplicate symbol`, `ld: `, and
`collect2: error:`.

## Demangling

A pure-JS subset of the Itanium ABI: length-prefixed nested names (`_ZN…E`),
builtin type codes, `RK` and `P` qualifiers, template arguments (`I…E`), and
the common abbreviations (`St`, `Ss`, `Sa`).

Back-references (`S_`, `S0_`, …) are the genuinely hard part and are not fully
supported. **Any unsupported construct or parse failure returns the mangled
name unchanged.** A mangled name is exactly what the user sees today, so the
floor is "no worse than now".

This keeps the trust boundary intact; the alternative was a new IPC channel to
shell out to `c++filt`.

## Interaction

xterm.js decorations attach a DOM element to a buffer marker, and DOM overlays
work under the WebGL renderer. The `↳` line carries a decoration with a click
handler; `⌥↵` and a command-palette entry ("Expand last diagnostic") cover the
keyboard.

Expanding opens a scrollable overlay containing the **untouched original
bytes**, with a copy button. Originals are held per pane in a bounded map of
the most recent 50, so memory cannot grow without limit.

## Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `condenseDiagnostics` | `true` | Master switch |
| `condenseDiagnosticsMinLines` | `20` | Leave short diagnostics alone; they are already readable |

Both follow the existing coercion rules — unknown keys ignored, out-of-range
values clamped.

## Testing

**The lossless-passthrough invariant is the gate.** For any input containing no
diagnostic, the concatenation of everything emitted must be byte-identical to
the input. Fixtures must include a `vim` session, colour output, progress bars
that rewrite lines, and chunks split mid-escape-sequence. If this cannot hold,
the feature does not ship.

Beyond that:

- Real captured `gcc` and `clang` output in `test/fixtures/`, asserted end to
  end through the state machine.
- Demangler: a table of known mangled/demangled pairs, plus deliberate garbage
  that must round-trip unchanged.
- Fail-open cases, each asserted individually: cursor sequences mid-block, cap
  overflow, alternate-screen entry mid-block, partial line mid-block.
- Chunk-boundary fuzzing: the same fixture fed in randomly sized chunks must
  produce identical output every time.

## Decomposition

This spec covers the engine and the C++ matcher only. Each further language is
its own spec and its own small change: a grammar, an `isVendorPath` rule,
fixtures of real captured output, and a value judgement about whether
condensing that language helps at all.

Priority order, by observed value: TypeScript, Java/Scala, Python, Node/JS, Go.
Rust is excluded by design (see Non-goals).

## Open question

`condenseDiagnosticsMinLines` defaults to 20 on instinct, not evidence. The
right threshold is whatever avoids transforming errors that were already
readable, and that needs real usage to determine rather than a guess now.
