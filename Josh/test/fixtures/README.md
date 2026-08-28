# Diagnostic fixtures

Provenance matters here: a fixture that claims to be real compiler output, and
is not, tests the author's idea of a compiler rather than the compiler.

| File | Provenance |
| --- | --- |
| `clang-template.txt` | **Captured.** Apple clang 17.0.0, `c++ -std=c++17 -fcolor-diagnostics` over a `std::sort` of a type with no `operator<`. Run under `script` with `TERM=xterm-256color`, so the 1056 SGR sequences are real. |
| `ld-undefined.txt` | **Captured.** Apple `ld` via the same clang, a method declared but never defined. Note Apple's linker prints `Undefined symbols for architecture` and demangles the symbol itself, where GNU `ld` prints `undefined reference to` and leaves it mangled. |
| `altscreen-session.txt` | **Captured.** `tput smcup` / `rmcup` under `script` with `TERM=xterm-256color`, so the sequences come from the real terminfo database rather than being written by hand. |
| `vim-session.txt` | **Captured.** A real `vim` session under a real pty. Contains genuine cursor movement; this build of vim did not switch to the alternate screen, which is why `altscreen-session.txt` exists separately. |
| `progress-bar.txt` | **Captured.** A shell loop rewriting one line with bare CR under `script`. |
| `gcc-template-reconstructed.txt` | **NOT captured — reconstructed.** No GNU GCC exists on the machine this was written on: `gcc` and `g++` are both Apple clang shims. This file follows GCC's documented output grammar (`In file included from`, `In instantiation of`, `required from here`) because that vocabulary differs from clang's and is what `cxx-template` keys on. It is labelled in its filename so nobody mistakes it for a capture. **Replace it with a genuine `g++` capture on a machine that has one.** |

To recapture, run the compiler under `script` — a pipe makes clang drop colour,
and `TERM` is `dumb` inside `script` unless you set it explicitly.
