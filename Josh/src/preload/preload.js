'use strict';

/**
 * The only channel between the renderer and Node.
 *
 * The renderer gets `window.josh` and nothing else — no `require`, no
 * `process`, no `ipcRenderer`. Both directions are restricted to fixed channel
 * lists declared here, so renderer code cannot reach a channel that was not
 * deliberately published, and cannot receive events it was not meant to see.
 *
 * Raw IpcRendererEvent objects are never forwarded to renderer callbacks:
 * they carry a reference to the sender, which would hand privileged objects
 * to page code and defeat context isolation.
 */

const { contextBridge, ipcRenderer } = require('electron');

const INVOKE_CHANNELS = new Set([
  'pty:create',
  'pty:write',
  'pty:resize',
  'pty:kill',
  'pty:cwd',
  'pty:title',
  'settings:get',
  'settings:set',
  'shell:openExternal',
  'clipboard:read',
  'clipboard:write',
  'app:info',
  'window:minimize',
  'window:toggleMaximize',
  'window:close',
]);

const EVENT_CHANNELS = new Set([
  'pty:data',
  'pty:exit',
  'pty:cwd',
  'menu:action',
  'theme:changed',
  'settings:changed',
]);

/**
 * Main returns `{ ok, value } | { ok: false, error }` so validation failures
 * cross the boundary as data. Convert that back into a normal promise
 * rejection for callers.
 */
async function invoke(channel, ...args) {
  if (!INVOKE_CHANNELS.has(channel)) {
    throw new Error('blocked channel: ' + channel);
  }
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result || result.ok !== true) {
    throw new Error((result && result.error) || 'request failed');
  }
  return result.value;
}

/** Subscribe to a main-process event. Returns an unsubscribe function. */
function on(channel, listener) {
  if (!EVENT_CHANNELS.has(channel)) {
    throw new Error('blocked event: ' + channel);
  }
  if (typeof listener !== 'function') {
    throw new Error('listener must be a function');
  }
  // Drop the event object; forward only the plain payload.
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('josh', {
  pty: {
    create: (options) => invoke('pty:create', options),
    write: (id, data) => invoke('pty:write', id, data),
    resize: (id, cols, rows) => invoke('pty:resize', id, cols, rows),
    kill: (id) => invoke('pty:kill', id),
    cwd: (id) => invoke('pty:cwd', id),
    setTitle: (id, title) => invoke('pty:title', id, title),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (partial) => invoke('settings:set', partial),
  },
  clipboard: {
    read: () => invoke('clipboard:read'),
    write: (text) => invoke('clipboard:write', text),
  },
  os: {
    openExternal: (url) => invoke('shell:openExternal', url),
    info: () => invoke('app:info'),
  },
  win: {
    minimize: () => invoke('window:minimize'),
    toggleMaximize: () => invoke('window:toggleMaximize'),
    close: () => invoke('window:close'),
  },
  on,
});
