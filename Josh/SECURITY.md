# Security

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/joshiag1106/AI_apps/security/advisories/new)
rather than opening a public issue. Include the version, your operating system,
and the steps to reproduce.

## Threat model

A terminal emulator displays output that the user does not control. Running
`cat` on a downloaded file, or a compromised build tool printing escape
sequences, means arbitrary bytes reach the renderer. The security design
assumes this is hostile input.

**What we defend against**

| Threat | Defence |
| --- | --- |
| Escape sequences in output escalating to code execution | Renderer has no Node access: `contextIsolation`, `sandbox`, `nodeIntegration: false` |
| A compromised renderer reading another window's shell | Per-window session ownership; a session id is only resolvable by its owning window |
| A compromised renderer exfiltrating data | CSP `connect-src 'none'`, plus non-local requests cancelled in the main process. No network path exists |
| Malicious hyperlinks (`file://`, `javascript:`, `smb://`) in output | Protocol allowlist: only `http`, `https`, `mailto` reach the OS |
| A crafted OSC title smuggling escapes back into the UI | Titles are stripped of control characters and rendered with `textContent`, never `innerHTML` |
| Renderer flooding or memory exhaustion via IPC | Writes capped at 1 MiB per message and rate-limited to 16 MiB/s per session; sessions capped per window |
| The app binary being re-used as a Node interpreter | `ELECTRON_RUN_AS_NODE` and related variables stripped before the shell starts |
| A hostile or corrupt settings file | Parsed with `JSON.parse` (never `eval`/`require`), every field schema-coerced, unknown keys dropped |
| Local disclosure of the settings file | Written atomically with `0600` permissions |
| Navigation away from the bundled page | `will-navigate` and `window.open` blocked; webviews refused |
| Unexpected device access | All permission requests denied — camera, microphone, geolocation, notifications, USB, MIDI |

**What is explicitly out of scope**

- **The commands you run.** A terminal's job is to execute what you type. This
  app does not sandbox your shell, and cannot protect you from a command you
  chose to run.
- **Shells and programs you configure.** If you set `shell` to a malicious
  binary, it runs.
- **Your operating system's own security boundaries.** The app runs with your
  user's privileges and does not attempt to escalate or restrict them.

## Recall, and what its nonce does not defend

Semantic prompt marking makes attacker-controlled output more dangerous in an
interesting way: output able to forge prompt state could make Josh record
fabricated history, or offer an attacker's command at the moment a user is
most likely to accept it.

Josh mints a random nonce per session and ignores any OSC 133 sequence not
carrying it, so `cat`-ing a file full of crafted sequences achieves nothing.

Recall is off by default and records nothing until a user turns it on.

**Stated plainly: the nonce does not defend against untrusted execution.** Any
program you actually run inherits the shell's environment and can therefore
read the nonce and forge sequences. That is not specific to Josh — a process
running in your shell can already read your files, your environment and the
effects of your keystrokes, and no terminal emulator can prevent it. The nonce
defends against untrusted *output*, which is the realistic and stated threat.

Two further mitigations bound what a leak can contain:

- The store is written `0600`, and redaction runs **before** any write, so a
  command carrying a token, password, API key or long high-entropy literal is
  dropped entirely rather than truncated. Redaction lives in its own module
  with no filesystem access, so it can be reviewed in isolation.
- Suggestion text derives from previously executed commands, so it is treated
  as data: control characters are stripped and the length clamped in the main
  process before it crosses to the renderer, exactly as OSC-supplied titles
  already are.

Recall adds **one event channel** and **no invoke channel**. The renderer never
asks for a suggestion; the main process, which already sees both PTY output and
every write the renderer requests, pushes one.

## Supply chain

The application has seven runtime dependencies: six xterm.js packages and one
PTY binding. Every one is pinned in `package-lock.json`.

`@lydell/node-pty` was chosen specifically because it ships prebuilt Node-API
binaries with **no install scripts**, so a normal `npm install` executes no
third-party code and needs no compiler toolchain.

There is no network access at runtime, so a compromised dependency has no
built-in channel to exfiltrate data.
