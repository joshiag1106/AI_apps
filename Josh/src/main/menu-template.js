'use strict';

/**
 * The application menu as plain data.
 *
 * Separate from menu.js, which owns the Electron calls, so the template can be
 * required and asserted without an Electron runtime. That matters here: an
 * accelerator is a string nothing executes until a user presses the key, so a
 * wrong one is invisible to every other kind of test. `CmdOrCtrl+Plus` shipped
 * in a documented shortcut table and never fired once.
 *
 * Everything Electron-shaped arrives as a parameter -- the app name, whether
 * the build is packaged, and the three callbacks -- so this file imports
 * nothing.
 */

const HOMEPAGE = 'https://github.com/joshiag1106/AI_apps';

/**
 * Windows and Linux take Ctrl+Shift, because Ctrl+C, Ctrl+D, Ctrl+A, Ctrl+K
 * and Ctrl+W belong to the shell. Taking those would break the terminal.
 */
function modifiers(isMac) {
  return {
    MOD: isMac ? 'Cmd+' : 'Ctrl+Shift+',
    SPLIT_DOWN: isMac ? 'Cmd+Shift+D' : 'Ctrl+Shift+E',
  };
}

function menuTemplate({
  isMac, appName, packaged, emit, onNewWindow, openSettingsFile, openExternal,
}) {
  const { MOD, SPLIT_DOWN } = modifiers(isMac);

  const settingsItem = {
    label: 'Settings...',
    accelerator: 'CmdOrCtrl+,', // comma is not a shell binding on any platform
    click: () => openSettingsFile(),
  };

  return [
    ...(isMac
      ? [
          {
            label: appName,
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

        // '=', not 'Plus': an accelerator has to match the character the key
        // produces, and '+' on the main row needs Shift. 'Plus' was bound here
        // before and never fired once, on any platform, which is the whole bug.
        //
        // There is deliberately no second binding for the shifted '+'. Both a
        // hidden alias and acceleratorWorksWhenHidden were tried and neither
        // fired when tested against a running app, and a shortcut that is
        // documented but dead is the failure being fixed here, not a bonus.
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: emit('zoom:in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: emit('zoom:out') },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: emit('zoom:reset') },
        { type: 'separator' },

        // Alt keeps line height clear of the font size row above, so the two
        // cannot be pressed for each other.
        { label: 'Taller Lines', accelerator: 'CmdOrCtrl+Alt+=', click: emit('lineHeight:in') },
        { label: 'Tighter Lines', accelerator: 'CmdOrCtrl+Alt+-', click: emit('lineHeight:out') },
        { label: 'Default Line Height', accelerator: 'CmdOrCtrl+Alt+0', click: emit('lineHeight:reset') },
        { type: 'separator' },
        { label: 'Next Theme', accelerator: 'CmdOrCtrl+Alt+]', click: emit('theme:next') },
        { label: 'Previous Theme', accelerator: 'CmdOrCtrl+Alt+[', click: emit('theme:prev') },
        { type: 'separator' },
        { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: emit('tab:next') },
        { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: emit('tab:prev') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(packaged ? [] : [{ role: 'toggleDevTools' }]),
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
        { label: 'Learn More', click: () => openExternal(HOMEPAGE) },
      ],
    },
  ];
}

module.exports = { menuTemplate, modifiers, HOMEPAGE };
