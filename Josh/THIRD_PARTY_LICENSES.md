# Third-Party Licenses

Josh itself is MIT-licensed — see [LICENSE](LICENSE). Windows builds also bundle
one separately-licensed executable.

## busybox-w32 (`sed.exe`, `awk.exe`)

**What ships.** `sed.exe` and `awk.exe`, which are byte-identical copies of a
single busybox-w32 executable. busybox dispatches on the name it was invoked
as, so each copy runs the corresponding applet.

They exist because Windows ships neither tool, while macOS and Linux both have
them system-wide. Josh appends their directory to the end of `PATH`, after
everything already there, so a `sed` or `awk` you installed yourself — Git Bash,
WSL, MSYS2, Chocolatey — always takes priority. See
`src/main/shell-resolver.js`.

They run as ordinary subprocesses of your shell. Nothing from busybox-w32 is
linked into, or statically combined with, Josh's own code.

**License.** GPL-2.0. Full text:
<https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt>

**Source.** <https://github.com/rmyorston/busybox-w32>, a Windows port of
BusyBox (<https://busybox.net>). The exact build Josh packages is pinned by URL
and SHA256 in `scripts/fetch-win-tools.js`, and that pin is what the Windows
build verifies before packaging anything.

**Modifications.** None. The binary is used exactly as published upstream; the
build only copies it under the names `sed.exe` and `awk.exe`.

## NOTICE: the Shell Kit is an independent implementation

Josh's Shell Kit provides the kind of thing people install oh-my-zsh for. It
contains none of it.

**No oh-my-zsh code, file, theme, curated alias list, or identifier** was
copied, adapted, or referenced. The kit uses none of `ZSH_THEME`, `plugins=()`,
`ZSH_CUSTOM`, or any `omz_` prefix; every identifier it defines is prefixed
`__josh_` or `JOSH_`, and a test asserts it.

**The alias sets are derived, not borrowed.** Each name is generated from its
tool's own help output under a stated rule — the tool's initial, then the
subcommand's initials, extended until the name is free. The derivation is a
function in `src/shared/kit-packs.js` that runs at load time, and a test
replays it over every shipped name. The subcommand lists were read from
`git help -a`, `npm help` and `pip3 --help`; docker's and cargo's come from
their documented subcommand sets.

That the rule never produces `gs` is a consequence of the rule, not a
coincidence: the leading consonant cluster of "status" is `st`.

The kit ships under Josh's own MIT licence — see [LICENSE](LICENSE). Nothing in
it imposes any further obligation on redistributors.
