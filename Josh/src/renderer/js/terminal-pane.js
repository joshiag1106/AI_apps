/**
 * One terminal pane: an xterm.js instance bound to one PTY session.
 *
 * The pane owns its DOM element, its addons and its session id, and exposes a
 * small surface (start / write / fit / focus / dispose) so the tab and split
 * logic never has to reach into xterm internals.
 */
(function () {
  'use strict';

  const api = window.josh;

  class TerminalPane {
    constructor(options) {
      this.id = options.id;
      this.settings = options.settings;
      this.theme = options.theme;
      this.onTitle = options.onTitle || function () {};
      this.onFocus = options.onFocus || function () {};

      this.sessionId = null;
      this.cwd = null;
      this.shell = null;
      this.disposed = false;

      // Diagnostic condensing sits between the PTY and xterm. It is built
      // unconditionally and consulted per write, so toggling the setting takes
      // effect on the next line rather than needing a new pane.
      this.overlay = new window.DiagnosticOverlay.DiagnosticOverlay({
        document: document,
        onCopy: (text) => api.clipboard.write(text).catch(function () {}),
      });
      // Ghost text for what Recall thinks you are about to type. Accepting
      // writes through the existing pty:write path, so no new capability is
      // involved.
      this.suggestion = new window.Suggestion.Suggestion({
        document: document,
        onAccept: (text) => {
          if (this.sessionId) api.pty.write(this.sessionId, text).catch(function () {});
        },
      });

      this.condenser = new window.Diagnostics.Condenser({
        emit: (text) => { if (!this.disposed && this.term) this.term.write(text); },
        onCondensed: (record) => this.overlay.remember(record),
        matchers: window.DiagnosticMatchers.ALL,
        cwd: () => this.cwd,
        enabled: () => this.settings.condenseDiagnostics !== false,
        minLines: () => this.settings.condenseDiagnosticsMinLines || 20,
      });

      this.element = document.createElement('div');
      this.element.className = 'pane';
      this.element.dataset.paneId = this.id;

      this.host = document.createElement('div');
      this.host.className = 'term-host';
      this.element.appendChild(this.host);

      this.element.addEventListener('mousedown', () => this.onFocus(this.id));
    }

    /** Build the xterm instance, attach addons, and spawn the shell. */
    async start(cwd) {
      const s = this.settings;
      this.term = new window.Terminal({
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        cursorStyle: s.cursorStyle,
        cursorBlink: s.cursorBlink,
        scrollback: s.scrollback,
        theme: this.theme.xterm,
        allowProposedApi: true,
        macOptionIsMeta: true,
        rightClickSelectsWord: true,
      });

      this.fitAddon = new window.FitAddon.FitAddon();
      this.searchAddon = new window.SearchAddon.SearchAddon();
      this.term.loadAddon(this.fitAddon);
      this.term.loadAddon(this.searchAddon);

      // Links are opened by the main process, and only after the protocol
      // allowlist accepts them — terminal output is untrusted.
      this.term.loadAddon(
        new window.WebLinksAddon.WebLinksAddon((_event, uri) => {
          api.os.openExternal(uri).catch(function () {});
        })
      );

      this.term.open(this.host);

      // The ghost is drawn into the screen element, whose box is the one the
      // cursor coordinates below are relative to. It only exists once the
      // terminal has opened, which is why this is not done at construction.
      if (this.suggestion && this.term.element) {
        this.suggestion.mount(this.term.element.querySelector('.xterm-screen'));
        this.suggestion.setFont(this._ghostFont());
        // The suggestion is known before the terminal has echoed the keystroke
        // it follows, so where the cursor will be is only settled here.
        this.term.onCursorMove(() => this.suggestion.place(this._cursorPoint()));
      }

      // Wide/emoji character widths. Proposed API, so failure is non-fatal.
      try {
        const unicode = new window.Unicode11Addon.Unicode11Addon();
        this.term.loadAddon(unicode);
        this.term.unicode.activeVersion = '11';
      } catch {
        /* fall back to the built-in width table */
      }

      this._enableWebgl();
      this._fitOnly();

      const dims = this._dimensions();
      // Measure the configured font, not a guess: the pane already holds the
      // real font stack, and whether it has powerline glyphs is something only
      // the process that owns the window can answer.
      const glyphs = window.KitGlyphs
        ? window.KitGlyphs.resolveGlyphs(
          this.settings,
          window.KitGlyphs.measureWithCanvas(this.settings.fontFamily, this.settings.fontSize)
        )
        : 'plain';

      const session = await api.pty.create({
        cols: dims.cols,
        rows: dims.rows,
        cwd: cwd || null,
        glyphs,
      });
      this.sessionId = session.sessionId;
      this.shell = session.shell;
      this.cwd = session.cwd;

      this.term.onData((data) => {
        if (this.sessionId) api.pty.write(this.sessionId, data).catch(function () {});
      });
      this.term.onTitleChange((title) => this.onTitle(this.id, title));
      this.term.onSelectionChange(() => {
        if (this.settings.copyOnSelect) {
          const text = this.term.getSelection();
          if (text) api.clipboard.write(text).catch(function () {});
        }
      });

      this.term.onBell(() => this._bell());

      // Right Arrow / End accept the ghost text, Esc dismisses it. Tab is
      // untouched: it belongs to the shell's own completion. Returning false
      // stops xterm forwarding the key to the shell.
      this.term.attachCustomKeyEventHandler((event) => {
        if (event.type !== 'keydown' || !this.suggestion || !this.suggestion.text()) return true;
        if (window.Suggestion.ACCEPT_KEYS.includes(event.key)) {
          this.suggestion.accept();
          return false;
        }
        if (event.key === 'Escape') {
          this.suggestion.dismiss();
          return false;
        }
        return true;
      });

      // One observer per pane handles every source of size change — window
      // resize, split drag, tab switch — so there is a single resize path.
      this._observer = new ResizeObserver(() => this.fit());
      this._observer.observe(this.element);

      return session;
    }

    /**
     * WebGL gives a large throughput win, but a lost GL context (driver
     * update, GPU reset, some VMs) must degrade to the DOM renderer instead of
     * leaving a blank terminal.
     */
    _enableWebgl() {
      if (this.settings.renderer !== 'webgl') return;
      try {
        const webgl = new window.WebglAddon.WebglAddon();
        webgl.onContextLoss(() => {
          try {
            webgl.dispose();
          } catch {
            /* already gone */
          }
        });
        this.term.loadAddon(webgl);
        this.webgl = webgl;
      } catch {
        /* no GPU path available; xterm falls back on its own */
      }
    }

    /**
     * The terminal bell. Visual rather than audible: shipping an audio file
     * would mean loosening the content-security policy for media, and a
     * flash plus a Dock bounce carries the same information without that.
     */
    _bell() {
      if (!this.settings.bell) return;
      this.element.classList.remove('bell');
      // Force a reflow so rapid consecutive bells each restart the animation.
      void this.element.offsetWidth;
      this.element.classList.add('bell');
      setTimeout(() => this.element.classList.remove('bell'), 420);
      api.win.attention().catch(function () {});
    }

    _dimensions() {
      const cols = this.term && this.term.cols ? this.term.cols : 80;
      const rows = this.term && this.term.rows ? this.term.rows : 24;
      return { cols: cols, rows: rows };
    }

    _fitOnly() {
      if (this.disposed || !this.term) return false;
      if (this.element.clientWidth === 0 || this.element.clientHeight === 0) return false;
      try {
        this.fitAddon.fit();
        return true;
      } catch {
        return false; // element mid-layout; the observer will fire again
      }
    }

    /** Re-measure, then tell the PTY its new size so programs reflow correctly. */
    fit() {
      if (!this._fitOnly()) return null;
      const dims = this._dimensions();
      if (this.sessionId) {
        api.pty.resize(this.sessionId, dims.cols, dims.rows).catch(function () {});
      }
      return dims;
    }

    write(data) {
      if (this.disposed || !this.term) return;
      this.condenser.write(data);
    }

    /** Offer, or clear, the inline suggestion for this pane. */
    showSuggestion(text) {
      if (this.suggestion) this.suggestion.show(text, this._cursorPoint());
    }

    /** The terminal font, so the ghost is the same width per character. */
    _ghostFont() {
      const s = this.settings || {};
      return {
        family: s.fontFamily,
        size: s.fontSize,
        letterSpacing: s.letterSpacing || 0,
      };
    }

    /**
     * Where the cursor is, in pixels within the screen element.
     *
     * The WebGL renderer draws the cursor into a canvas, so there is no DOM
     * node for it. xterm does keep one element at the cursor -- the hidden
     * textarea it needs there for IME -- so its box is the cursor box, exact
     * and free of arithmetic.
     *
     * Deriving a cell width instead, by dividing the screen box by cols, is
     * off by a fraction of a pixel per cell, and a prompt is long enough for
     * that to accumulate into a visible error: it measured 16px adrift.
     */
    _cursorPoint() {
      if (!this.term || !this.term.element) return null;
      const screen = this.term.element.querySelector('.xterm-screen');
      const cursor = this.term.element.querySelector('.xterm-helper-textarea');
      if (!screen || !cursor) return null;
      const box = screen.getBoundingClientRect();
      const at = cursor.getBoundingClientRect();
      return { left: at.left - box.left, top: at.top - box.top };
    }

    /** Show the original bytes of the most recent condensed diagnostic. */
    expandLastDiagnostic() {
      return this.overlay ? this.overlay.openLast() : false;
    }

    focus() {
      if (this.term) this.term.focus();
    }

    clear() {
      if (this.term) this.term.clear();
    }

    selectAll() {
      if (this.term) this.term.selectAll();
    }

    getSelection() {
      return this.term ? this.term.getSelection() : '';
    }

    paste(text) {
      if (this.term && typeof text === 'string' && text.length) this.term.paste(text);
    }

    setTheme(theme) {
      this.theme = theme;
      if (this.term) this.term.options.theme = theme.xterm;
    }

    applySettings(settings) {
      this.settings = settings;
      if (!this.term) return;
      this.term.options.fontFamily = settings.fontFamily;
      this.term.options.fontSize = settings.fontSize;
      this.term.options.lineHeight = settings.lineHeight;
      this.term.options.letterSpacing = settings.letterSpacing;
      if (this.suggestion) this.suggestion.setFont(this._ghostFont());
      this.term.options.cursorStyle = settings.cursorStyle;
      this.term.options.cursorBlink = settings.cursorBlink;
      this.term.options.scrollback = settings.scrollback;
      this.fit();
    }

    findNext(query) {
      return this.searchAddon ? this.searchAddon.findNext(query) : false;
    }

    findPrevious(query) {
      return this.searchAddon ? this.searchAddon.findPrevious(query) : false;
    }

    dispose() {
      if (this.disposed) return;
      // Released before `disposed` is set, so anything the condenser is still
      // holding reaches the terminal rather than being emitted into a no-op.
      if (this.suggestion) this.suggestion.dispose();
      if (this.condenser) this.condenser.dispose();
      if (this.overlay) this.overlay.dispose();
      this.disposed = true;
      if (this._observer) this._observer.disconnect();
      if (this.sessionId) api.pty.kill(this.sessionId).catch(function () {});
      try {
        if (this.term) this.term.dispose();
      } catch {
        /* already torn down */
      }
      this.element.remove();
    }
  }

  window.TerminalPane = TerminalPane;
})();
