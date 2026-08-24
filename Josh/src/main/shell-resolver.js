'use strict';

/**
 * Works out which shell to launch.
 *
 * The shell path is never accepted from the renderer. It is derived here, in
 * the main process, from the OS plus an optional value the user typed into
 * their own settings file. A user-supplied shell must still exist on disk
 * before we will spawn it — otherwise we fall back down a known-good list.
 */

const fsDefault = require('node:fs');
const path = require('node:path');

/** Ordered fallbacks per platform. First one that exists on disk wins. */
const FALLBACKS = Object.freeze({
  darwin: ['/bin/zsh', '/bin/bash', '/bin/sh'],
  linux: ['/bin/bash', '/usr/bin/bash', '/bin/zsh', '/bin/sh'],
  win32: [
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    'C:\\Windows\\System32\\cmd.exe',
  ],
});

/**
 * Login-shell flags. On macOS especially, a non-login shell misses everything
 * in /etc/paths and ~/.zprofile, so PATH comes out wrong and users report
 * "my tools are missing". POSIX shells get -l; Windows shells take no flag.
 */
function loginArgsFor(shellPath, platform) {
  if (platform === 'win32') return [];
  const base = shellPath.split(/[\\/]/).pop().toLowerCase();
  if (base === 'zsh' || base === 'bash' || base === 'sh' || base === 'fish') return ['-l'];
  return [];
}

/**
 * Environment hygiene before we hand control to a shell.
 *
 * Electron injects variables that confuse child processes — most importantly
 * ELECTRON_RUN_AS_NODE, which makes a re-exec of our own binary behave as a
 * bare Node interpreter. Leaving these in the shell environment is both a
 * correctness bug and a privilege-escalation foothold, so they are stripped.
 */
function sanitizeEnv(sourceEnv, { platform, binDir, exists } = {}) {
  const env = { ...sourceEnv };
  const strip = [
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_NO_ATTACH_CONSOLE',
    'ELECTRON_NO_ASAR',
    'ELECTRON_FORCE_IS_PACKAGED',
    'ELECTRON_ENABLE_LOGGING',
    'ELECTRON_ENABLE_STACK_DUMPING',
    'NODE_OPTIONS',
    'GDK_BACKEND',
  ];
  for (const key of strip) delete env[key];

  // Announce ourselves honestly so programs can adapt (and so `clear` works).
  env.TERM = env.TERM && env.TERM !== 'dumb' ? env.TERM : 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.TERM_PROGRAM = 'Josh';

  // Windows ships neither sed nor awk. If a bundled fallback was packaged and
  // actually landed on disk, make it reachable — but only *after* whatever the
  // user already has on PATH, so their own tools (Git Bash, WSL, Chocolatey)
  // always win over the copy we ship.
  if (platform === 'win32' && binDir) {
    const dirExists = exists || fsDefault.existsSync;
    if (dirExists(binDir)) appendToPathEnv(env, binDir, ';');
  }

  return env;
}

/**
 * Appends to whichever PATH-like key already exists, matched case-insensitively.
 * Windows environments commonly spell it `Path`; blindly setting `env.PATH`
 * there would create a second, ignored key and silently do nothing.
 */
function appendToPathEnv(env, dir, separator) {
  const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') || 'PATH';
  env[key] = env[key] ? env[key] + separator + dir : dir;
}

/**
 * Where the bundled Windows fallback tools (sed, awk) live, if anywhere.
 *
 * A dev run reads the copy `npm run predist:win` vendored into the repo; a
 * packaged app reads the copy electron-builder placed under `resources/`.
 * Returning a path says nothing about whether it exists — sanitizeEnv checks
 * that before putting it on PATH.
 */
function resolveWinBinDir({ isPackaged, resourcesPath, appRoot }) {
  return isPackaged ? path.join(resourcesPath, 'bin-win') : path.join(appRoot, 'vendor', 'win');
}

/**
 * @param {object} options
 * @param {string} options.platform   process.platform
 * @param {object} options.env        process.env
 * @param {string|null} options.explicit  user's configured shell, if any
 * @param {(p: string) => boolean} [options.exists]  injected for testing
 * @returns {{file: string, args: string[]}}
 */
function resolveShell({ platform, env = {}, explicit = null, exists } = {}) {
  const fileExists =
    exists ||
    ((p) => {
      try {
        return fsDefault.statSync(p).isFile();
      } catch {
        return false;
      }
    });

  const candidates = [];
  if (typeof explicit === 'string' && explicit.trim() && !explicit.includes('\u0000')) {
    candidates.push(explicit.trim());
  }
  // $SHELL reflects the user's real login shell on Unix. Ignored on Windows,
  // where it is usually a leftover from a Git-Bash style environment.
  if (platform !== 'win32' && typeof env.SHELL === 'string' && env.SHELL.trim()) {
    candidates.push(env.SHELL.trim());
  }
  candidates.push(...(FALLBACKS[platform] || FALLBACKS.linux));

  // COMSPEC is checked *after* the fallback list, not before it. Windows always
  // sets COMSPEC to cmd.exe, so consulting it first would silently defeat the
  // PowerShell preference above and hand every Windows user cmd.exe. It stays
  // only as a last resort for a system with no shell at any known path.
  if (platform === 'win32' && typeof env.COMSPEC === 'string' && env.COMSPEC.trim()) {
    candidates.push(env.COMSPEC.trim());
  }

  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return { file: candidate, args: loginArgsFor(candidate, platform) };
    }
  }

  // Nothing on the list exists. Return the last resort unvalidated rather than
  // throwing: spawn will produce a far clearer error than we can here.
  const last = platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  return { file: last, args: [] };
}

module.exports = { resolveShell, sanitizeEnv, loginArgsFor, FALLBACKS, resolveWinBinDir };
