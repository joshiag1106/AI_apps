/**
 * The expand affordance for a condensed diagnostic.
 *
 * Holds the untouched original bytes of recent condensed blocks and, in the
 * browser, renders them in a scrollable overlay with a copy button. The store
 * is bounded: a long build can emit hundreds of diagnostics and memory must
 * not grow with the length of the build.
 *
 * The store half is pure and tested directly; the DOM half is inert when no
 * document is supplied, which is how the test suite loads this file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DiagnosticOverlay = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_ORIGINALS = 50;

  class DiagnosticOverlay {
    constructor(options) {
      const o = options || {};
      this.document = o.document || null;
      this.onCopy = o.onCopy || function () {};
      this.records = new Map();
      this.element = null;
    }

    /** Keep the original, evicting the oldest once past the cap. */
    remember(record) {
      this.records.set(record.id, record);
      while (this.records.size > MAX_ORIGINALS) {
        const oldest = this.records.keys().next().value;
        this.records.delete(oldest);
      }
    }

    get(id) {
      return this.records.has(id) ? this.records.get(id) : null;
    }

    last() {
      let found = null;
      for (const record of this.records.values()) found = record;
      return found;
    }

    size() {
      return this.records.size;
    }

    isOpen() {
      return this.element !== null;
    }

    /** Show the original. Returns false when there is nothing to show. */
    open(id) {
      const record = this.get(id);
      if (!record) return false;
      if (!this.document) return true; // headless: the store is the contract

      this.close();

      const overlay = this.document.createElement('div');
      overlay.className = 'diagnostic-overlay';

      const pre = this.document.createElement('pre');
      pre.className = 'diagnostic-original';
      pre.textContent = record.original;
      overlay.appendChild(pre);

      const copy = this.document.createElement('button');
      copy.className = 'diagnostic-copy';
      copy.textContent = 'Copy';
      copy.addEventListener('click', () => this.onCopy(record.original));
      overlay.appendChild(copy);

      const close = this.document.createElement('button');
      close.className = 'diagnostic-close';
      close.textContent = 'Close';
      close.addEventListener('click', () => this.close());
      overlay.appendChild(close);

      this.element = overlay;
      return true;
    }

    /** Open the most recent diagnostic, for the palette entry and the key. */
    openLast() {
      const record = this.last();
      return record ? this.open(record.id) : false;
    }

    close() {
      if (!this.element) return;
      if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
      this.element = null;
    }

    dispose() {
      this.close();
      this.records.clear();
    }
  }

  return { DiagnosticOverlay, MAX_ORIGINALS };
});
