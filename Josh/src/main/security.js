'use strict';

/**
 * Every process-wide security control lives here, so the posture of the app
 * can be reviewed in one file rather than inferred from scattered options.
 *
 * The threat model: terminal output is fully attacker-controlled. Running
 * `cat` on a hostile file, or a compromised dependency printing escape
 * sequences, must not be able to escalate into code execution, navigation,
 * network access, or the OS opening something dangerous.
 */

const { shell } = require('electron');
const { isSafeExternalUrl } = require('./validate');

/**
 * `default-src 'none'` denies everything, then we re-enable the minimum.
 * Note `connect-src 'none'`: the renderer cannot make a network request of any
 * kind — no fetch, no XHR, no WebSocket, no telemetry, no exfiltration path
 * even if a dependency were compromised. Everything is loaded from disk.
 * `style-src` needs 'unsafe-inline' because xterm.js sets inline styles for
 * cell rendering; that is a styling primitive only and cannot execute script.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Security-relevant webPreferences, kept in one place so no window can drift. */
const SECURE_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
  spellcheck: false,
});

/**
 * Applies the CSP and denies every optional capability for a session.
 * Camera, microphone, geolocation, notifications, USB, MIDI and friends are
 * all refused outright — a terminal needs none of them.
 */
function applySessionPolicy(session) {
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
        'X-Content-Type-Options': ['nosniff'],
      },
    });
  });

  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  if (typeof session.setDevicePermissionHandler === 'function') {
    session.setDevicePermissionHandler(() => false);
  }

  // Block any outbound request that somehow bypasses CSP. Only local resources.
  session.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url || '';
    const local =
      url.startsWith('file://') || url.startsWith('devtools://') || url.startsWith('data:');
    callback({ cancel: !local });
  });
}

/**
 * Locks down a single webContents: no popups, no navigation away from the
 * bundled page, no webviews. External links are handed to the OS only after
 * passing the protocol allowlist in validate.js.
 */
function hardenWebContents(contents, allowedUrl) {
  contents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (url !== allowedUrl) {
      event.preventDefault();
      openExternalSafely(url);
    }
  });
  contents.on('will-frame-navigate', (event) => {
    if (event.url !== allowedUrl) event.preventDefault();
  });

  contents.on('will-attach-webview', (event) => event.preventDefault());
}

/**
 * The only path from the app to the operating system's URL handler.
 * Returns whether the URL was accepted, so callers can report failures.
 */
function openExternalSafely(url) {
  if (!isSafeExternalUrl(url)) return false;
  shell.openExternal(url).catch(() => {});
  return true;
}

module.exports = {
  CONTENT_SECURITY_POLICY,
  SECURE_WEB_PREFERENCES,
  applySessionPolicy,
  hardenWebContents,
  openExternalSafely,
};
