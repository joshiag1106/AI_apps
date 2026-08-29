/**
 * Inline ghost text: what Josh thinks you are about to type, shown dimly
 * after the cursor.
 *
 * The WebGL renderer draws to a canvas, so the suggestion cannot be a terminal
 * cell -- it is an absolutely positioned overlay aligned to the cursor, with
 * pointer-events off so it can never intercept a click.
 *
 * Right Arrow and End accept, matching fish and zsh-autosuggestions. Esc
 * dismisses until the next suggestion arrives. **Tab is deliberately absent**:
 * it belongs to the shell's own completion, and taking it would break every
 * piece of muscle memory a shell user has.
 *
 * Written as a UMD module so the browser can load it as a plain script while
 * the test suite can require() the exact same file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Suggestion = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Tab is not here, and must not be added. */
  const ACCEPT_KEYS = Object.freeze(['ArrowRight', 'End']);

  class Suggestion {
    constructor(options) {
      const o = options || {};
      this.document = o.document || null;
      this.onAccept = o.onAccept || function () {};
      this.value = '';
      this.dismissed = false;
      this.element = null;
      // Where the ghost is drawn, and where the caller last said the cursor
      // was. Both are null until the pane has a terminal to measure.
      this.host = o.host || null;
      this.position = null;
      this.font = null;
    }

    /**
     * The terminal's font, which the ghost must share.
     *
     * It draws over a canvas the terminal rendered, so anything else is the
     * wrong width per character: it would neither line up nor read as a
     * continuation of the typed line. Inheriting is not enough -- the CSS
     * ancestor here is the app chrome, whose font is a sans-serif.
     */
    setFont(font) {
      this.font = font || null;
      if (this.element) this._applyFont();
    }

    _applyFont() {
      if (!this.element || !this.font) return;
      this.element.style.fontFamily = this.font.family;
      this.element.style.fontSize = this.font.size + 'px';
      this.element.style.letterSpacing = this.font.letterSpacing + 'px';
    }

    /**
     * The element to draw into: the terminal screen, whose own box is what
     * the cursor coordinates are relative to. Set after the terminal opens,
     * which is later than this object is constructed.
     */
    mount(host) {
      this.host = host || null;
    }

    /**
     * Offer a suggestion. Anything falsy or non-string clears instead.
     *
     * The position is the caller's: only the pane knows where the cursor is,
     * and with the WebGL renderer there is no DOM cursor to hang this off.
     */
    show(text, position) {
      if (typeof text !== 'string' || text === '') {
        this.clear();
        return;
      }
      if (position) this.position = position;
      // A new suggestion lifts a previous dismissal: Esc means "not now",
      // never "not again this session".
      this.dismissed = false;
      this.value = text;
      this._render();
    }

    /**
     * Move a ghost that is already showing, without offering a new one.
     *
     * The suggestion is known before the terminal has echoed the keystroke it
     * follows, so the cursor is still a cell behind when show() runs. The pane
     * calls this once the cursor has actually moved.
     */
    place(position) {
      if (!position || this.value === '') return;
      this.position = position;
      this._render();
    }

    text() {
      return this.value;
    }

    /** Take the suggestion, returning what should be written to the shell. */
    accept() {
      const taken = this.value;
      this.clear();
      if (taken) this.onAccept(taken);
      return taken;
    }

    /** Esc: hide this one, but stay available for the next. */
    dismiss() {
      this.dismissed = true;
      this.clear();
    }

    clear() {
      this.value = '';
      if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      this.element = null;
    }

    dispose() {
      this.clear();
      this.dismissed = false;
    }

    _render() {
      if (!this.document || this.dismissed) return;
      if (!this.element) {
        this.element = this.document.createElement('span');
        this.element.className = 'suggestion-ghost';
      }
      this.element.textContent = this.value;
      this._applyFont();
      if (this.position) {
        this.element.style.left = this.position.left + 'px';
        this.element.style.top = this.position.top + 'px';
      }
      // The whole point, and what was missing: a span that is never appended
      // renders nowhere, however correct its text.
      if (this.host && this.element.parentNode !== this.host) {
        this.host.appendChild(this.element);
      }
    }
  }

  return { Suggestion, ACCEPT_KEYS };
});
