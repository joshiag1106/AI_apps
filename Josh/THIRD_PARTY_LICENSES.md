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
