# Trace: a C execution visualiser — design

## The idea in one paragraph

Josh renders a terminal, so Josh can render a second kind of pane beside it: one
that runs a C program a step at a time and *draws* what is happening. Stack
frames as boxes, variables with their real byte values, heap blocks, and
pointers as arrows to the thing they point at. It runs on a simulator built into
the app, so it needs no compiler, no debugger and no network, and it works
identically on macOS, Windows and Linux. Because the simulator knows the extent
and type of every object, it catches the mistakes that real hardware answers
with silence or garbage, and explains them at the moment they happen.

## Scope: this is cycle one of three

The full ambition is C, C++ and Assembly. Those are not one subsystem, and a
C++ subset in particular is a multiple of the C work rather than an increment.

| Cycle | Contents | Status |
| --- | --- | --- |
| **1** | C subset interpreter, memory model, visualiser pane, editor | **This document** |
| **2** | RISC-V RV32I simulator reusing this pane, plus source-to-assembly mapping | Own spec, later |
| **3** | C++ subset on top of the C interpreter: classes, references, basic STL | Own spec, later |

Cycle 2 reuses the **pane**, not the engine. Nothing in this document is shaped
by speculation about the later cycles, except where noted in
[Deferred](#deferred).

The intended reader of the finished feature is someone with **no programming
experience at all**. Every design decision below resolves in that person's
favour.

## Relationship to the diagnostic-condensing spec

[`2026-08-25-diagnostic-condensing-design.md`](2026-08-25-diagnostic-condensing-design.md)
condenses verbose compiler output streaming through a terminal pane, and lists
as non-goals "editing, authoring, compiling, or any language-server behaviour".

The two do not overlap. That feature makes a real toolchain's output readable in
a terminal pane; this one runs a simulator in a pane of its own and never sees a
real compiler's output. They share no code and no state. A learner would
plausibly use Trace first and the condenser later, when they graduate to a real
compiler.

## Prior art, honestly

- **Python Tutor** (Philip Guo) established this exact interaction: step through
  a program, watch a stack-and-heap diagram, follow pointer arrows. It supports
  C and C++ through Valgrind. The interaction is not original to Josh and this
  document does not claim it is.
- **Valgrind** and the **AddressSanitizer** family established detecting memory
  errors by shadowing allocation metadata. Trace applies the same idea; the
  implementation is its own.
- **Compiler Explorer** established side-by-side source and assembly, which is
  cycle 2's territory, not this one's.

Where Trace differs: it is **offline and toolchain-free**, so it works on a
machine with no compiler, no debugger and no network; it lives **beside a real
terminal** rather than in a browser tab; and its memory checks are built for
*teaching* rather than auditing, so every one carries a plain-language
explanation and a diagram, not a stack trace.

No code, content or data from any of the above is reused. All of it is original.

## Goals

- A complete beginner can open a Trace pane, type C, press Step, and see what
  the machine does, without installing anything.
- Mistakes are caught at the moment they are made and explained in plain
  language, with the relevant memory highlighted.
- The visualisation is honest: real byte-addressed memory, real addresses, real
  `sizeof`, real pointer arithmetic. Nothing is faked for convenience.
- Determinism. The same program produces the same output and the same execution
  journal on every run and every platform.
- No new IPC channel, no main-process change, no filesystem access, no network.
- A runaway program cannot hang or crash the application.

## Non-goals

- **Being a C compiler.** Trace runs a documented subset and says so clearly
  when a program leaves it.
- **Running real-world C.** No multiple translation units, no real preprocessor,
  no system headers, no libraries beyond the built-in set.
- **Replacing a debugger.** Trace runs its own simulator; it never attaches to a
  real process.
- **C++ and Assembly.** Cycles 3 and 2.
- **Being an IDE.** The editor is the smallest thing that lets a beginner type
  and read code. No project management, no file tree, no refactoring.

---

## Architecture

Trace is a **pane type**, not a floating panel. `split-tree.js` already manages
panes, dividers, focus and resizing, and today every pane is a terminal. Adding
a second kind means splitting beside a shell gives a Trace pane, and splitting,
dragging, focusing and closing all work without new machinery.

```
 trace-editor.js  ──text──>  trace-lex.js ──tokens──> trace-parse.js
      ^  (also colours from the same tokens)                │
      │                                                     v
      │                                                    AST
      │                                                     │
      │                                                     v
 trace-panel.js  <──state──  trace-interp.js  <──steps──────┘
                                   │    ^
                                   v    │
                            trace-machine.js   memory + shadow map + UB checks
                                   ^
                                   │
                            trace-stdlib.js    printf, malloc, string funcs
```

| File | Responsibility | Pure |
| --- | --- | --- |
| `src/renderer/js/trace-lex.js` | Source to tokens | yes |
| `src/renderer/js/trace-parse.js` | Tokens to AST, with real error messages | yes |
| `src/renderer/js/trace-machine.js` | Byte memory, shadow map, UB checks, journal | yes |
| `src/renderer/js/trace-interp.js` | The step evaluator | yes |
| `src/renderer/js/trace-stdlib.js` | Built-in library functions | yes |
| `src/renderer/js/trace-examples.js` | Shipped worked programs (data only) | yes |
| `src/renderer/js/trace-editor.js` | Editable code pane | no |
| `src/renderer/js/trace-panel.js` | Diagram, controls, output | no |

Six of the eight are pure and unit-testable under `node --test`, matching how
`split-tree.js`, `validate.js` and `command-palette.js` are already structured.

### Files modified

| File | Change |
| --- | --- |
| `src/renderer/js/split-tree.js` | Panes carry a `kind` of `terminal` or `trace` |
| `src/renderer/js/app.js` | Construct Trace panes; palette entries |
| `src/renderer/index.html` | Script tags |
| `src/renderer/css/app.css` | Pane, diagram and editor styles |
| `src/main/settings.js` | Two new keys |

**No main-process logic changes and no IPC changes.** The trust boundary stays
at 16 channels. The interpreter is pure computation, so it runs inside the
sandboxed renderer with no Node, no filesystem and no network, exactly as the
diagnostic-condensing engine does.

---

## 1. The C subset

Chosen to reach pointers, arrays and structs, because those are what a beginner
most needs to *see*, and to stop there.

**Types.** `int`, `char`, `double`, `void`; pointers to any of these; arrays;
`struct`; `enum`.

**Declarations.** With and without initialisers, including array and struct
initialiser lists.

**Operators.** Arithmetic, comparison, logical, assignment, compound assignment,
prefix and postfix increment and decrement, address-of, dereference, member
access by value and through a pointer, array subscript, `sizeof`, and casts
between the supported scalar types.

**Statements.** `if`/`else`, `while`, `for`, `do`/`while`, `switch`/`case`/
`default`, `break`, `continue`, `return`, blocks, expression statements.

**Functions.** Definition, call, recursion, value parameters, pointer
parameters, array parameters decaying to pointers.

**Other.** String and character literals with the standard escapes, comments in
both forms, object-like `#define`, and `#include` of `<stdio.h>`, `<stdlib.h>`
and `<string.h>`, which are recognised and ignored because the library is built
in.

### Built-in library

| Header | Functions |
| --- | --- |
| `stdio.h` | `printf`, `puts`, `putchar`, `scanf`, `getchar` |
| `stdlib.h` | `malloc`, `calloc`, `realloc`, `free`, `exit`, `abs`, `rand`, `srand` |
| `string.h` | `strlen`, `strcpy`, `strncpy`, `strcmp`, `strcat`, `memset`, `memcpy` |

`printf` supports `%d`, `%i`, `%c`, `%s`, `%f`, `%p` and `%%`, with width and
precision. `rand` is seeded deterministically unless `srand` is called with a
literal, because a beginner comparing two runs must see the same numbers.

**Input comes from a pre-filled stdin box** in the pane rather than blocking.
`scanf` and `getchar` read from that buffer and report end-of-input normally
when it is exhausted. This keeps the interpreter a pure step machine with no
suspension or re-entry, which is worth more than interactive input is.

### Deliberately excluded

`union`, function pointers, `goto`, varargs other than `printf`, `long`,
`short`, `unsigned`, `float`, bitfields, multiple translation units, a real
preprocessor (conditionals, function-like macros, actual header inclusion),
file I/O, threads, signals, `setjmp`.

Every one of these produces a diagnostic of its own class:

> Trace does not support `goto`. It supports `if`, `while`, `for`, `do`,
> `switch`, `break`, `continue` and `return`.

A crash or a confusing parse error here is a defect, not a limitation.

## 2. The machine model

Memory is a flat `Uint8Array`, little-endian, with real sizes: `int` 4, `char`
1, `double` 8, pointer 8. Addresses are real numbers a learner can print with
`%p` and reason about.

The layout mirrors a real process, because that layout is itself one of the
things being taught:

```
  low   0x00000000  +----------------------+
                    |  globals             |
                    +----------------------+
                    |  heap  (grows up)    |
                    |          v           |
                    :                      :
                    |          ^           |
                    |  stack (grows down)  |
  high  0x00100000  +----------------------+
```

The address space is 1 MiB. That is not a real process size, and it is chosen
so that addresses stay short enough to read on screen and so exhausting memory
is reachable as a teaching moment rather than a theoretical one.

### The shadow map

Alongside the bytes, every live object records:

```js
{ address, size, type, kind: 'global'|'local'|'heap', initialisedBits, birthFrame }
```

This is the load-bearing structure of the whole design, and it does two jobs at
once:

1. **It is what the diagram draws.** Boxes, names, types, values and the arrows
   between them all come from here. The panel never parses memory itself.
2. **It is what makes undefined behaviour detectable.** Raw bytes cannot tell
   you that an address is one past the end of `arr`. The shadow map can, because
   it knows where `arr` starts, how long it is, and which bytes have ever been
   written.

`initialisedBits` is a per-byte bitmap, not a per-object flag, so a partially
initialised struct reports precisely which member was never written.

## 3. Undefined behaviour, caught and explained

The reason a simulator beats real execution for a beginner. On real hardware,
`int a[5]; a[7] = 1;` produces silence, or garbage, or a crash three functions
later in unrelated code. Here it stops immediately and says what happened.

| # | Check | Detected by |
| --- | --- | --- |
| 1 | Read of uninitialised memory | `initialisedBits` |
| 2 | Out-of-bounds read | Shadow extent |
| 3 | Out-of-bounds write | Shadow extent |
| 4 | Use after free | Freed heap record retained |
| 5 | Double free | Freed heap record retained |
| 6 | `free` of a non-heap pointer | Shadow `kind` |
| 7 | Null dereference | Address zero |
| 8 | Dereference into a dead stack frame | `birthFrame` versus live frames |
| 9 | Memory leak at exit | Live heap records at halt |
| 10 | Division or modulo by zero | Operand check |
| 11 | Signed integer overflow | Range check before store |
| 12 | Negative array index | Index check |
| 13 | `strcpy` into a too-small buffer | Destination shadow size |
| 14 | Missing `return` from a non-void function | Control-flow exit |

Two limits are reported the same way, though they are not undefined behaviour:

- **Step budget exceeded** — "this program may never finish", with the loop
  highlighted.
- **Recursion depth exceeded** — "every call adds a frame; here are 200 of
  them", with the frame stack shown.

Every check yields:

```js
{ code, terse, plain, locations: [{line, col, length}], highlight: [address ranges] }
```

## 4. The interpreter as a step machine

`step()` performs one evaluation step and returns. There is no loop inside the
interpreter; the **UI** drives it.

That single decision is what makes the safety guarantees hold. An infinite loop
in the interpreted program cannot hang Josh, because there is no loop inside
Josh to hang in. "Run" is repeated `step()` calls with periodic yields to the
event loop, and the user can stop at any point.

Caps, each producing a teaching diagnostic rather than a failure:

| Limit | Value |
| --- | --- |
| Total steps | 5,000,000 |
| Address space | 1 MiB |
| Stack frames | 200 |
| Journal entries | 200,000 |

## 5. Step Back

Every memory write and every structural change (frame pushed or popped,
allocation made or freed) is journalled with its previous value. Stepping back
replays the inverses.

Journalling rather than snapshotting is what makes this affordable: a snapshot
of a 1 MiB address space per step is unusable, while a journal entry is a few
bytes and most steps write almost nothing.

Beyond 200,000 entries the journal drops its oldest records, and Step Back
covers the most recent window and says so plainly rather than silently doing
something different.

Step Back earns its cost because "wait, what just happened?" is the single most
common thing a beginner needs, and it is precisely the thing a real debugger
handles worst.

## 6. The pane

Top to bottom:

- **Editor.** Line numbers, the executing line highlighted, C syntax colouring.
  The colouring is nearly free: `trace-lex.js` already produces the tokens, so
  the lexer written for the interpreter also drives the editor. A transparent
  `textarea` over a rendered layer, which is the standard technique.
- **Controls.** Run, Step, Step Over, Step Back, Reset, and a speed control.
- **Diagram and output**, side by side. The diagram is DOM boxes for frames,
  variables and heap blocks, with an SVG overlay for pointer arrows. DOM rather
  than a canvas so values stay selectable and reachable by a screen reader.
- **Output and diagnostics**, showing what the program printed and any
  diagnostic raised.
- **Stdin box**, pre-filled by the user before running.

A **"state as text"** toggle renders identical information as plain text, for
screen-reader users and for anyone who would rather read than look at boxes.
The diagram is a presentation of the shadow map, so the text view is a second
presentation of the same data rather than a reimplementation.

## 7. Diagnostics

Parse errors, semantic errors, unsupported-construct errors and runtime errors
all render through one path, and every diagnostic carries **two** messages:

```
terse:  expected ';' before 'return'
plain:  Every statement in C ends with a semicolon. The line above this one
        is missing its ';'.
```

Both matter. The plain message teaches now; the terse one means that when this
learner later runs real `gcc`, its output looks familiar rather than alien.
Producing only the friendly message would make the eventual transition harder,
which would be a strange thing for a teaching tool to do.

## 8. Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `traceProgram` | `""` | The current program text, capped at 64 KiB |
| `traceStdin` | `""` | The stdin buffer, capped at 8 KiB |

Both are coerced by the existing rules in `settings.js` and travel on the
existing `settings:set` channel. Storing program text in a settings file is
slightly unusual; it is done because it is the only persistence Josh has, and
using it costs nothing, whereas adding a file-writing channel would widen the
trust boundary for a convenience. Saving programs as real files is deferred.

## 9. Security

Trace runs untrusted-by-construction input: the user's own half-written C. The
threat is a defect that hangs or crashes the app, not an attacker.

- **No new capability.** No IPC channel, no Node, no filesystem, no network, no
  subprocess. Everything runs inside the existing sandboxed renderer.
- **No `eval`, no `Function`, no dynamic code.** The interpreter walks an AST.
  The CSP forbids it regardless, but the design does not want it.
- **Bounded by construction.** Every loop the user can write is driven by the
  UI, and every resource has a hard cap listed in section 4.
- **Program text never reaches the shell.** A Trace pane has no PTY. Nothing
  typed into the editor can be executed by anything except the interpreter.

## 10. Testing

Roughly 150 to 200 new tests, on top of the existing 81.

| Area | What is asserted |
| --- | --- |
| Lexer | Token streams, string and char escapes, both comment forms, numeric literals |
| Parser | Golden ASTs per construct; the exact text of each parse-error message |
| Machine | Byte layout, endianness, `sizeof`, pointer arithmetic, struct member offsets |
| UB | One test per check in section 3, asserting code and locations |
| Programs | A table-driven corpus of 60 to 80 small C programs with expected output and expected diagnostics |
| Library | `printf` format cases, allocator behaviour, each string function |
| Unsupported | Each excluded construct produces its own clear message, never a parse error |

Two invariants get property tests, and they are the ones most likely to catch a
real defect:

- **Step forward N, step back N, and the machine is byte-identical**, including
  the shadow map. This is the strongest single check on both the journal and
  the evaluator.
- **The same program run twice produces an identical journal.** Determinism is a
  stated goal, so it is tested rather than assumed.

## Deferred

- **RISC-V RV32I assembly** (cycle 2), reusing this pane. The instruction set is
  already chosen; the engine is not shared, so nothing here is generalised in
  advance for it.
- **C++ subset** (cycle 3).
- Real preprocessor, multiple translation units, file I/O.
- Blocking or interactive stdin.
- Breakpoints and watch expressions.
- Saving programs to real files.
- `union`, function pointers, `goto`, `float`, `long`, `short`, `unsigned`.
