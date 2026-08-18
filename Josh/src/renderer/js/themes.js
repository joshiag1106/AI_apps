/**
 * Colour themes.
 *
 * Each theme carries both an xterm palette (the 16 ANSI colours plus
 * foreground/background/cursor/selection) and the handful of UI tokens the
 * surrounding chrome needs, so a theme switch repaints the terminal and the
 * app together instead of leaving a mismatched frame around the text.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Themes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const THEMES = {
    'Tokyo Night': {
      dark: true,
      ui: { chrome: '#16161e', border: '#292e42', accent: '#7aa2f7', muted: '#565f89' },
      xterm: {
        background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5',
        cursorAccent: '#1a1b26', selectionBackground: '#33467c',
        black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
        blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
        brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a',
        brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff', brightWhite: '#c0caf5',
      },
    },
    Dracula: {
      dark: true,
      ui: { chrome: '#21222c', border: '#343746', accent: '#bd93f9', muted: '#6272a4' },
      xterm: {
        background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2',
        cursorAccent: '#282a36', selectionBackground: '#44475a',
        black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
        blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
        brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94',
        brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df',
        brightCyan: '#a4ffff', brightWhite: '#ffffff',
      },
    },
    Nord: {
      dark: true,
      ui: { chrome: '#292e39', border: '#3b4252', accent: '#88c0d0', muted: '#616e88' },
      xterm: {
        background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9',
        cursorAccent: '#2e3440', selectionBackground: '#434c5e',
        black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
        blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
        brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c',
        brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead',
        brightCyan: '#8fbcbb', brightWhite: '#eceff4',
      },
    },
    'One Dark': {
      dark: true,
      ui: { chrome: '#21252b', border: '#3e4451', accent: '#61afef', muted: '#5c6370' },
      xterm: {
        background: '#282c34', foreground: '#abb2bf', cursor: '#528bff',
        cursorAccent: '#282c34', selectionBackground: '#3e4451',
        black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
        blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
        brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379',
        brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
        brightCyan: '#56b6c2', brightWhite: '#ffffff',
      },
    },
    'Solarized Dark': {
      dark: true,
      ui: { chrome: '#00252e', border: '#0b3844', accent: '#268bd2', muted: '#586e75' },
      xterm: {
        background: '#002b36', foreground: '#839496', cursor: '#93a1a1',
        cursorAccent: '#002b36', selectionBackground: '#073642',
        black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
        blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
        brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#586e75',
        brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
        brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
      },
    },
    'GitHub Light': {
      dark: false,
      ui: { chrome: '#f6f8fa', border: '#d0d7de', accent: '#0969da', muted: '#57606a' },
      xterm: {
        background: '#ffffff', foreground: '#24292f', cursor: '#24292f',
        cursorAccent: '#ffffff', selectionBackground: '#b6d7ff',
        black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#4d2d00',
        blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
        brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37',
        brightYellow: '#633c01', brightBlue: '#218bff', brightMagenta: '#a475f9',
        brightCyan: '#3192aa', brightWhite: '#8c959f',
      },
    },
    'Solarized Light': {
      dark: false,
      ui: { chrome: '#eee8d5', border: '#ddd6c1', accent: '#268bd2', muted: '#93a1a1' },
      xterm: {
        background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75',
        cursorAccent: '#fdf6e3', selectionBackground: '#eee8d5',
        black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
        blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
        brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75',
        brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
        brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
      },
    },
  };

  const NAMES = Object.keys(THEMES);

  /**
   * Resolve the configured theme to a concrete one.
   * `theme: 'auto'` follows the OS, picking the user's chosen light or dark
   * variant rather than a hardcoded pair.
   */
  function resolve(settings, prefersDark) {
    const wanted =
      !settings || settings.theme === 'auto'
        ? prefersDark
          ? (settings && settings.darkTheme) || 'Tokyo Night'
          : (settings && settings.lightTheme) || 'GitHub Light'
        : settings.theme;
    return THEMES[wanted] ? wanted : prefersDark ? 'Tokyo Night' : 'GitHub Light';
  }

  /** Push a theme's UI tokens into CSS custom properties. */
  function applyToDocument(name, doc) {
    const theme = THEMES[name];
    if (!theme) return null;
    const target = doc || document;
    const style = target.documentElement.style;
    style.setProperty('--bg', theme.xterm.background);
    style.setProperty('--fg', theme.xterm.foreground);
    style.setProperty('--chrome', theme.ui.chrome);
    style.setProperty('--border', theme.ui.border);
    style.setProperty('--accent', theme.ui.accent);
    style.setProperty('--muted', theme.ui.muted);
    style.setProperty('--selection', theme.xterm.selectionBackground);
    target.documentElement.dataset.dark = theme.dark ? 'true' : 'false';
    return theme;
  }

  return { THEMES, NAMES, resolve, applyToDocument };
});
