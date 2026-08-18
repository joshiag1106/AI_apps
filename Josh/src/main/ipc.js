'use strict';

/**
 * The trust boundary. Every message from a renderer lands in exactly one of
 * these handlers.
 *
 * Three rules hold for all of them:
 *   1. The window id comes from `event.sender`, never from the payload — a
 *      renderer cannot claim to be a different window.
 *   2. The sender must be a window we created.
 *   3. Arguments are validated before use, and a validation failure returns a
 *      benign error rather than throwing across the IPC boundary.
 */

const { ipcMain, BrowserWindow, clipboard, nativeTheme, app } = require('electron');
const {
  assertSessionId,
  assertWriteData,
  assertDimensions,
  assertCwd,
  sanitizeTitle,
  LIMITS,
} = require('./validate');
const { openExternalSafely } = require('./security');

/** Wrap a handler so the sender is resolved and verified before it runs. */
function guarded(isKnownWindow, handler) {
  return (event, ...args) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!isKnownWindow(win)) return { ok: false, error: 'unknown sender' };
    try {
      return { ok: true, value: handler(win, ...args) };
    } catch (error) {
      // Never leak stack traces or filesystem paths back into the renderer.
      const message =
        error && error.name === 'ValidationError' ? error.message : 'request failed';
      return { ok: false, error: message };
    }
  };
}

function registerIpc({ ptyManager, settings, windowManager }) {
  const { isKnownWindow, broadcast } = windowManager;
  const g = (handler) => guarded(isKnownWindow, handler);

  // ---- PTY lifecycle -------------------------------------------------------

  ipcMain.handle(
    'pty:create',
    g((win, options) => {
      const opts = options && typeof options === 'object' ? options : {};
      const { cols, rows } = assertDimensions(opts.cols, opts.rows);
      const cwd = assertCwd(opts.cwd === undefined ? null : opts.cwd);
      return ptyManager.create({
        windowId: win.id,
        cols,
        rows,
        cwd,
        settings: settings.get(),
      });
    })
  );

  ipcMain.handle(
    'pty:write',
    g((win, sessionId, data) => {
      assertSessionId(sessionId);
      assertWriteData(data);
      return ptyManager.write(win.id, sessionId, data);
    })
  );

  ipcMain.handle(
    'pty:resize',
    g((win, sessionId, cols, rows) => {
      assertSessionId(sessionId);
      assertDimensions(cols, rows);
      return ptyManager.resize(win.id, sessionId, cols, rows);
    })
  );

  ipcMain.handle(
    'pty:kill',
    g((win, sessionId) => {
      assertSessionId(sessionId);
      return ptyManager.kill(win.id, sessionId);
    })
  );

  ipcMain.handle(
    'pty:cwd',
    g((win, sessionId) => {
      assertSessionId(sessionId);
      return ptyManager.getCwd(win.id, sessionId);
    })
  );

  ipcMain.handle(
    'pty:title',
    g((win, sessionId, title) => {
      assertSessionId(sessionId);
      return ptyManager.setTitle(win.id, sessionId, sanitizeTitle(title));
    })
  );

  // ---- Settings ------------------------------------------------------------

  ipcMain.handle(
    'settings:get',
    g(() => settings.get())
  );

  ipcMain.handle(
    'settings:set',
    g((_win, partial) => {
      const saved = settings.save(partial && typeof partial === 'object' ? partial : {});
      broadcast('settings:changed', saved);
      return saved;
    })
  );

  // ---- OS integration ------------------------------------------------------

  ipcMain.handle(
    'shell:openExternal',
    g((_win, url) => openExternalSafely(url))
  );

  ipcMain.handle(
    'clipboard:write',
    g((_win, text) => {
      if (typeof text !== 'string') return false;
      clipboard.writeText(text.slice(0, LIMITS.MAX_WRITE_BYTES));
      return true;
    })
  );

  ipcMain.handle(
    'clipboard:read',
    g(() => clipboard.readText().slice(0, LIMITS.MAX_WRITE_BYTES))
  );

  ipcMain.handle(
    'app:info',
    g(() => ({
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      darkMode: nativeTheme.shouldUseDarkColors,
    }))
  );

  // ---- Window controls -----------------------------------------------------

  ipcMain.handle(
    'window:minimize',
    g((win) => {
      win.minimize();
      return true;
    })
  );

  ipcMain.handle(
    'window:toggleMaximize',
    g((win) => {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
      return win.isMaximized();
    })
  );

  ipcMain.handle(
    'window:close',
    g((win) => {
      win.close();
      return true;
    })
  );

  /**
   * The terminal bell, expressed the way each OS expects: a bouncing Dock icon
   * on macOS, a flashing taskbar button elsewhere. Suppressed when the window
   * already has focus, since the user is looking straight at it.
   */
  ipcMain.handle(
    'window:attention',
    g((win) => {
      if (win.isFocused()) return false;
      if (process.platform === 'darwin') {
        if (app.dock && typeof app.dock.bounce === 'function') app.dock.bounce('informational');
      } else if (typeof win.flashFrame === 'function') {
        win.flashFrame(true);
      }
      return true;
    })
  );
}

module.exports = { registerIpc, guarded };
