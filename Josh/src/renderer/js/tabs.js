/**
 * The tab strip.
 *
 * Purely presentational: it renders buttons from a list of {id, title} and
 * reports clicks. It holds no terminal state, so tab ordering and lifecycle
 * stay in one place (app.js) rather than being split across two owners.
 */
(function () {
  'use strict';

  class TabStrip {
    constructor(element, handlers) {
      this.element = element;
      this.onSelect = handlers.onSelect || function () {};
      this.onClose = handlers.onClose || function () {};
    }

    render(tabs, activeId) {
      this.element.replaceChildren();

      for (const tab of tabs) {
        const button = document.createElement('div');
        button.className = 'tab';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', tab.id === activeId ? 'true' : 'false');
        button.dataset.tabId = tab.id;

        const label = document.createElement('span');
        label.className = 'label';
        // textContent, never innerHTML: titles come from the shell via OSC
        // sequences and must never be parsed as markup.
        label.textContent = tab.title || 'Terminal';
        label.title = tab.title || 'Terminal';
        button.appendChild(label);

        const close = document.createElement('span');
        close.className = 'close';
        close.textContent = '×';
        close.title = 'Close tab';
        close.addEventListener('mousedown', (event) => {
          event.stopPropagation();
          event.preventDefault();
          this.onClose(tab.id);
        });
        button.appendChild(close);

        button.addEventListener('mousedown', () => this.onSelect(tab.id));
        this.element.appendChild(button);
      }
    }
  }

  window.TabStrip = TabStrip;
})();
