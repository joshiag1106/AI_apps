'use strict';

/**
 * Creates and tracks application windows.
 *
 * Window chrome is chosen per platform rather than forced to one look:
 * macOS gets inset traffic lights plus background vibrancy, Windows gets a
 * colour-matched title-bar overlay, and Linux keeps its native frame because
 * frameless windows behave inconsistently across window managers. Being
 * "fancy" should never cost a user the ability to move their own window.
 */

const path = require('node:path');
const { BrowserWindow, nativeTheme } = require('electron');
const { SECURE_WEB_PREFERENCES, hardenWebContents } = require('./security');

const RENDERER_HTML = path.join(__dirname, '..', 'renderer', 'index.html');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');

const BACKGROUND = { dark: '#1a1b26', light: '#ffffff' };

const windows = new Set();

function backgroundColor() {
  return nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light;
}

function overlayColors() {
  return {
    color: backgroundColor(),
    symbolColor: nativeTheme.shouldUseDarkColors ? '#c0caf5' : '#24292f',
    height: 40,
  };
}

function platformChrome() {
  if (process.platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 16 },
      // Translucent background behind the terminal. Purely cosmetic, and
      // ignored gracefully by macOS versions that do not support it.
      vibrancy: 'under-window',
      visualEffectState: 'active',
    };
  }
  if (process.platform === 'win32') {
    return { titleBarStyle: 'hidden', titleBarOverlay: overlayColors() };
  }
  // Linux: keep the native frame. Some window managers mishandle frameless
  // windows, and a user who cannot close their terminal is a worse outcome
  // than plain chrome.
  return { frame: true };
}

function createWindow({ isPackaged = true, settings = {} } = {}) {
  const useVibrancy = process.platform === 'darwin' && settings.vibrancy !== false;
  const chrome = platformChrome();
  if (!useVibrancy) {
    delete chrome.vibrancy;
    delete chrome.visualEffectState;
  }

  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 420,
    minHeight: 260,
    show: false, // avoid a white flash; revealed on ready-to-show
    backgroundColor: useVibrancy ? '#00000000' : backgroundColor(),
    ...chrome,
    webPreferences: {
      ...SECURE_WEB_PREFERENCES,
      preload: PRELOAD,
      devTools: !isPackaged,
      backgroundThrottling: false, // keep long-running output smooth when hidden
    },
  });

  hardenWebContents(win.webContents, pathToFileUrl(RENDERER_HTML));

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => windows.delete(win));

  // Stop the taskbar flashing from a bell once the user actually looks.
  win.on('focus', () => {
    if (typeof win.flashFrame === 'function') win.flashFrame(false);
  });
  windows.add(win);

  win.loadFile(RENDERER_HTML);
  return win;
}

/** file:// URL for the bundled page, used as the sole allowed navigation target. */
function pathToFileUrl(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const withSlash = normalized.startsWith('/') ? normalized : '/' + normalized;
  return 'file://' + withSlash;
}

function allWindows() {
  return [...windows];
}

function isKnownWindow(win) {
  return Boolean(win) && windows.has(win);
}

/** Push an event to every open window (theme changes, settings updates). */
function broadcast(channel, payload) {
  for (const win of windows) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/** Repaint native chrome when the OS switches between light and dark. */
function refreshChrome() {
  for (const win of windows) {
    if (win.isDestroyed()) continue;
    if (process.platform === 'win32' && typeof win.setTitleBarOverlay === 'function') {
      try {
        win.setTitleBarOverlay(overlayColors());
      } catch {
        /* overlay unsupported on this Windows build */
      }
    }
  }
}

module.exports = {
  createWindow,
  allWindows,
  isKnownWindow,
  broadcast,
  refreshChrome,
  pathToFileUrl,
};
