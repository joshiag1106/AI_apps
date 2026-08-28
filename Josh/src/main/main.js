'use strict';

/**
 * Application entry point: wires the pieces together and owns app lifecycle.
 *
 * Deliberately thin. Policy lives in security.js, terminal behaviour in
 * pty-manager.js, and the trust boundary in ipc.js, so this file stays short
 * enough to audit at a glance.
 */

const path = require('node:path');
const { app, nativeTheme, shell, dialog, session } = require('electron');

const { PtyManager } = require('./pty-manager');
const { resolveWinBinDir } = require('./shell-resolver');
const { Settings } = require('./settings');
const RecallStore = require('./recall-store.js');
const { applySessionPolicy, hardenWebContents } = require('./security');
const windowManager = require('./window-manager');
const { registerIpc } = require('./ipc');
const { installMenu } = require('./menu');

// Sandbox every renderer at the process level, before any window exists.
app.enableSandbox();

const settings = new Settings();

/**
 * The Recall store, built once for the process and injected into the PTY
 * manager, which must stay free of Electron. Loading is best-effort: a store
 * Josh cannot read is an empty history, never a failure to start.
 */
const recallStore = new RecallStore.RecallStore({
  file: path.join(path.dirname(settings.filePath), 'recall.jsonl'),
  maxEntries: settings.values.recallMaxEntries,
  excludePatterns: settings.values.recallExcludePatterns,
});
recallStore.load();
let ptyManager = null;

// Bundled fallback tools (Windows sed/awk). Resolved once here, where
// app.isPackaged is available, and handed to PtyManager — which stays free of
// Electron imports so it can be reasoned about on its own. On macOS and Linux
// the directory never exists and sanitizeEnv ignores it.
const BUNDLED_BIN_DIR = resolveWinBinDir({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  appRoot: path.join(__dirname, '..', '..'),
});

/**
 * Route PTY traffic to the window that owns the session. `resolveOwned` has
 * already proved ownership, so this only has to find the live webContents.
 */
function sendToWindow(windowId, channel, payload) {
  const win = windowManager.allWindows().find((w) => w.id === windowId);
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createPtyManager() {
  return new PtyManager({
    onData: (windowId, sessionId, data) =>
      sendToWindow(windowId, 'pty:data', { sessionId, data }),
    onExit: (windowId, sessionId, info) =>
      sendToWindow(windowId, 'pty:exit', { sessionId, ...info }),
    onCwd: (windowId, sessionId, cwd) => sendToWindow(windowId, 'pty:cwd', { sessionId, cwd }),
    onSuggestion: (windowId, sessionId, text) =>
      sendToWindow(windowId, 'recall:suggestion', { sessionId, text }),
    recallStore: recallStore,
    binDir: BUNDLED_BIN_DIR,
  });
}

/**
 * Headless self-test used by `npm test` and CI.
 *
 * This is the check that actually matters for cross-platform confidence: it
 * proves the native PTY binding loads under Electron's ABI and that a real
 * shell round-trips a command. Runs without creating a window.
 */
function runSmokeTest() {
  // 11111 * 11111 = 123454321. The result never appears in the command text,
  // so a match proves we read the shell's *output* rather than its echo of
  // what we typed. Each shell needs its own arithmetic syntax.
  const EXPECTED = '123454321';
  let output = '';
  let finished = false;

  const finish = (code, message) => {
    if (finished) return;
    finished = true;
    process.stdout.write(message + '\n');
    // Deliberately no disposeAll() here. Tearing down the native pty handle
    // and calling app.exit() in the same tick races the binding's own exit
    // callback, which aborts the process with an uncaught Napi::Error - a C++
    // abort that no JavaScript try/catch can intercept. The run then reports
    // failure even after the test itself printed SMOKE PASS. Exiting closes
    // the pty file descriptors, so the shell gets SIGHUP and the OS reaps it.
    //
    // The exit is deferred for the same reason, by a different route.
    // finish() is reached from inside onData, a callback the native binding
    // invokes from C++. Exiting there destroys the process while that C++
    // frame is still on the stack, and the binding's own callback then fires
    // into a torn-down context - producing the identical Napi abort. It is
    // intermittent, which is what the race looks like from CI: SMOKE PASS on
    // stdout, Napi::Error on stderr, and a null exit code from the signal.
    // setImmediate lets the native frame unwind before the process goes away.
    setImmediate(() => app.exit(code));
  };

  const manager = new PtyManager({
    onData: (_w, _s, data) => {
      output += data;
      if (output.includes(EXPECTED)) {
        finish(0, 'SMOKE PASS: pty spawned, command executed, output round-tripped');
      }
    },
    onExit: () => {},
    binDir: BUNDLED_BIN_DIR,
  });

  let sessionInfo;
  try {
    sessionInfo = manager.create({ windowId: 1, cols: 80, rows: 24 });
  } catch (error) {
    process.stdout.write('SMOKE FAIL: could not spawn pty: ' + error.message + '\n');
    app.exit(1);
    return;
  }
  process.stdout.write(
    'smoke: shell=' + sessionInfo.shell + ' pid=' + sessionInfo.pid + '\n'
  );

  const command = smokeCommandFor(sessionInfo.shell);
  setTimeout(() => manager.write(1, sessionInfo.sessionId, command), 800);
  setTimeout(() => finish(1, 'SMOKE FAIL: timed out waiting for marker'), 20000);
}

/**
 * The arithmetic command for a given shell. cmd.exe needs `set /a`, PowerShell
 * evaluates a bare expression, and POSIX shells need `$(( ))`. An earlier
 * version used a quoting trick that only worked in POSIX shells, so the
 * Windows smoke test could never pass.
 */
function smokeCommandFor(shellPath) {
  const shell = String(shellPath || '')
    .split(/[\\/]/)
    .pop()
    .toLowerCase();
  if (shell === 'cmd.exe' || shell === 'cmd') return 'set /a 11111*11111\r';
  if (shell === 'pwsh.exe' || shell === 'powershell.exe') return '11111*11111\r';
  return 'echo $((11111*11111))\r';
}

function openSettingsFile() {
  try {
    settings.save({}); // materialise the file with defaults if absent
    shell.openPath(settings.filePath);
  } catch {
    dialog.showErrorBox('Josh', 'Could not open the settings file.');
  }
}

/**
 * Ask before closing a window that holds more than one shell.
 *
 * A single-shell window closes without a prompt on purpose: nagging on every
 * close trains people to dismiss the dialog unread, which defeats the point.
 * The prompt earns its place only when something would actually be lost.
 */
function attachCloseGuard(win) {
  win.on('close', (event) => {
    if (!settings.get().confirmOnClose) return;
    if (!ptyManager) return;
    const count = ptyManager.sessionCount(win.id);
    if (count <= 1) return;

    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Close', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Close window',
      message: 'Close this window?',
      detail: count + ' shells are running here. Closing the window ends them.',
    });
    if (choice !== 0) event.preventDefault();
  });
}

function newWindow() {
  const win = windowManager.createWindow({
    isPackaged: app.isPackaged,
    settings: settings.get(),
  });
  attachCloseGuard(win);
  return win;
}

function bootstrap() {
  settings.load();
  ptyManager = createPtyManager();

  applySessionPolicy(session.defaultSession);
  registerIpc({ ptyManager, settings, windowManager });
  installMenu({
    onNewWindow: () =>
      newWindow(),
    openSettingsFile,
  });

  newWindow();

  nativeTheme.on('updated', () => {
    windowManager.refreshChrome();
    windowManager.broadcast('theme:changed', { dark: nativeTheme.shouldUseDarkColors });
  });
}

// The headless self-test must not take part in single-instance arbitration.
// Otherwise `npm test` fails whenever the user happens to have the app open:
// the test instance loses the lock, quits with status 0 and prints nothing, so
// the failure looks nothing like its actual cause.
const isSmokeTest = process.env.JOSH_SMOKE === '1';

// A second launch should focus the existing window rather than start a rival
// instance that would fight over the same settings file.
if (!isSmokeTest && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = windowManager.allWindows();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    } else {
      newWindow();
    }
  });

  // Belt and braces: harden any webContents created anywhere in the app,
  // including one a future change might add without going through
  // window-manager.
  app.on('web-contents-created', (_event, contents) => {
    hardenWebContents(contents, contents.getURL());
  });

  app.whenReady().then(() => {
    if (process.env.JOSH_SMOKE === '1') {
      runSmokeTest();
      return;
    }
    bootstrap();

    app.on('activate', () => {
      if (windowManager.allWindows().length === 0) {
        newWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // Shells must not outlive the app and become orphaned processes.
  app.on('before-quit', () => {
    if (ptyManager) ptyManager.disposeAll();
  });
}
