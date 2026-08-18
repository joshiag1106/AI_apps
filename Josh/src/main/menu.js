'use strict';

/**
 * The native application menu.
 *
 * Menu items do not act on the terminal directly. They send a named action to
 * the focused window and the renderer decides what it means, which keeps a
 * single implementation of each command shared by the menu, the keyboard
 * shortcuts and the command palette.
 */

const { Menu, app, shell } = require('electron');

const isMac = process.platform === 'darwin';
const HOMEPAGE = 'https://github.com/joshiag1106/AI_apps';

/**
 * Application shortcuts must not steal keys the shell needs.
 *
 * On Windows and Linux, Ctrl+C/D/A/K/W/T/F are core terminal bindings —
 * SIGINT, end-of-file, beginning-of-line, kill-line, kill-word, transpose and
 * forward-search. Binding app commands to them would break the shell, so those
 * platforms use Ctrl+Shift, which is what every other cross-platform terminal
 * does. macOS has a separate Command key and needs no such workaround.
 */
const MOD = isMac ? 'Cmd+' : 'Ctrl+Shift+';
const SPLIT_DOWN = isMac ? 'Cmd+Shift+D' : 'Ctrl+Shift+E';

/** Send a menu action to whichever window has focus. */
function emit(action) {
  return (_item, focusedWindow) => {
    if (focusedWindow && !focusedWindow.isDestroyed()) {
      focusedWindow.webContents.send('menu:action', action);
    }
  };
}

function buildMenu({ onNewWindow, openSettingsFile }) {
  const settingsItem = {
    label: 'Settings...',
    accelerator: 'CmdOrCtrl+,', // comma is not a shell binding on any platform
    click: () => openSettingsFile(),
  };

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              settingsItem,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'Shell',
      submenu: [
        { label: 'New Tab', accelerator: MOD + 'T', click: emit('tab:new') },
        { label: 'New Window', accelerator: MOD + 'N', click: () => onNewWindow() },
        { type: 'separator' },
        { label: 'Split Right', accelerator: MOD + 'D', click: emit('split:right') },
        { label: 'Split Down', accelerator: SPLIT_DOWN, click: emit('split:down') },
        { type: 'separator' },
        { label: 'Close Pane', accelerator: MOD + 'W', click: emit('pane:close') },
        ...(isMac ? [] : [{ type: 'separator' }, settingsItem, { role: 'quit' }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Copy', accelerator: MOD + 'C', click: emit('edit:copy') },
        { label: 'Paste', accelerator: MOD + 'V', click: emit('edit:paste') },
        { type: 'separator' },
        { label: 'Select All', accelerator: MOD + 'A', click: emit('edit:selectAll') },
        { label: 'Clear', accelerator: MOD + 'K', click: emit('edit:clear') },
        { type: 'separator' },
        { label: 'Find...', accelerator: MOD + 'F', click: emit('find:open') },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Command Palette...',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: emit('palette:open'),
        },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: emit('zoom:in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: emit('zoom:out') },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: emit('zoom:reset') },
        { type: 'separator' },
        { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: emit('tab:next') },
        { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: emit('tab:prev') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(isMac ? [{ role: 'zoom' }, { type: 'separator' }, { role: 'front' }] : []),
      ],
    },
    {
      role: 'help',
      submenu: [
        { label: 'Open Settings File...', click: () => openSettingsFile() },
        { label: 'Learn More', click: () => shell.openExternal(HOMEPAGE) },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function installMenu(options) {
  Menu.setApplicationMenu(buildMenu(options));
}

module.exports = { installMenu, buildMenu, MOD, SPLIT_DOWN };
