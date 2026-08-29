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

const { menuTemplate, modifiers } = require('./menu-template.js');

const isMac = process.platform === 'darwin';
const { MOD, SPLIT_DOWN } = modifiers(isMac);

/** Send a menu action to whichever window has focus. */
function emit(action) {
  return (_item, focusedWindow) => {
    if (focusedWindow && !focusedWindow.isDestroyed()) {
      focusedWindow.webContents.send('menu:action', action);
    }
  };
}

function buildMenu({ onNewWindow, openSettingsFile }) {
  return Menu.buildFromTemplate(menuTemplate({
    isMac,
    appName: app.name,
    packaged: app.isPackaged,
    emit,
    onNewWindow,
    openSettingsFile,
    openExternal: (url) => shell.openExternal(url),
  }));
}

function installMenu(options) {
  Menu.setApplicationMenu(buildMenu(options));
}

module.exports = { installMenu, buildMenu, MOD, SPLIT_DOWN };
