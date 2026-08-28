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
    }

    /** Offer a suggestion. Anything falsy or non-string clears instead. */
    show(text) {
      if (typeof text !== 'string' || text === '') {
        this.clear();
        return;
      }
      // A new suggestion lifts a previous dismissal: Esc means "not now",
      // never "not again this session".
      this.dismissed = false;
      this.value = text;
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
    }
  }

  return { Suggestion, ACCEPT_KEYS };
});
