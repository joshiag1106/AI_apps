/**
 * Command palette.
 *
 * Filtering is subsequence matching — typing "sr" finds "Split Right" — with
 * matches scored so tighter, earlier hits float to the top. That is enough to
 * feel fast without pulling in a fuzzy-search dependency.
 *
 * UMD-wrapped so the scoring functions can be unit-tested in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CommandPalette = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @returns {number|null} score (lower is better), or null when no match
   */
  function score(needle, haystack) {
    if (!needle) return 0;
    const lowerNeedle = needle.toLowerCase();
    const lowerHay = haystack.toLowerCase();

    let hayIndex = 0;
    let total = 0;
    let previous = -1;

    for (const character of lowerNeedle) {
      const found = lowerHay.indexOf(character, hayIndex);
      if (found === -1) return null;
      // Penalise gaps, so contiguous runs rank above scattered letters.
      total += previous === -1 ? found : found - previous - 1;
      previous = found;
      hayIndex = found + 1;
    }
    return total;
  }

  function filter(commands, query) {
    if (!query) return commands.slice(0, 60);
    return commands
      .map((command) => {
        const value = score(query, command.label);
        return value === null ? null : { command: command, value: value };
      })
      .filter(Boolean)
      .sort((a, b) => a.value - b.value || a.command.label.localeCompare(b.command.label))
      .slice(0, 60)
      .map((entry) => entry.command);
  }

  class CommandPalette {
    constructor(elements) {
      this.backdrop = elements.backdrop;
      this.input = elements.input;
      this.list = elements.list;
      this.commands = [];
      this.matches = [];
      this.index = 0;
      this.onDismiss = function () {};

      this.input.addEventListener('input', () => this._refresh());
      this.input.addEventListener('keydown', (event) => this._onKeyDown(event));
      this.backdrop.addEventListener('mousedown', (event) => {
        if (event.target === this.backdrop) this.close();
      });
    }

    open(commands) {
      this.commands = commands;
      this.input.value = '';
      this.backdrop.hidden = false;
      this._refresh();
      this.input.focus();
    }

    close() {
      if (this.backdrop.hidden) return;
      this.backdrop.hidden = true;
      this.onDismiss();
    }

    get isOpen() {
      return !this.backdrop.hidden;
    }

    _refresh() {
      this.matches = filter(this.commands, this.input.value.trim());
      this.index = 0;
      this._renderList();
    }

    _renderList() {
      this.list.replaceChildren();

      if (this.matches.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No matching commands';
        this.list.appendChild(empty);
        return;
      }

      this.matches.forEach((command, position) => {
        const item = document.createElement('li');
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', position === this.index ? 'true' : 'false');

        const label = document.createElement('span');
        label.textContent = command.label;
        item.appendChild(label);

        if (command.hint) {
          const hint = document.createElement('span');
          hint.className = 'hint';
          hint.textContent = command.hint;
          item.appendChild(hint);
        }

        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
          this._run(command);
        });
        this.list.appendChild(item);
      });
    }

    _move(delta) {
      if (this.matches.length === 0) return;
      this.index = (this.index + delta + this.matches.length) % this.matches.length;
      this._renderList();
      const selected = this.list.children[this.index];
      if (selected && selected.scrollIntoView) selected.scrollIntoView({ block: 'nearest' });
    }

    _run(command) {
      this.close();
      try {
        command.run();
      } catch {
        /* a failing command must not take the palette down with it */
      }
    }

    _onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        this._move(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this._move(-1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const command = this.matches[this.index];
        if (command) this._run(command);
      }
    }
  }

  CommandPalette.score = score;
  CommandPalette.filter = filter;
  return CommandPalette;
});
