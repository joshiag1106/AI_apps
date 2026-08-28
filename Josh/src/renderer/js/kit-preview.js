/**
 * The prompt theme preview panel.
 *
 * Split the way Trace's memory diagram was: the model is pure and tested, the
 * DOM half is thin and checked by hand. Everything interesting about what a
 * theme looks like is decided in previewModel, which is a function of data.
 *
 * What is real here: the working directory the renderer already receives on
 * the pty:cwd event, the active colour theme, the configured font, and the
 * actual render function the shell will be emitted from.
 *
 * What is sampled: the git state. That is deliberate. Rendering live git would
 * mean the renderer running git, which needs a new IPC channel and makes Josh
 * spawn processes of its own -- a larger trust boundary than a preview is
 * worth. The sample is labelled as one in the UI rather than passed off.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../shared/kit-themes.js'), require('../../shared/kit-render.js'));
  } else {
    root.KitPreview = factory(root.KitThemes, root.KitRender);
  }
})(typeof self !== 'undefined' ? self : this, function (KitThemes, KitRender) {
  'use strict';

  /** Branch main, one staged, two modified, one ahead. */
  const SAMPLE_GIT = Object.freeze({
    branch: 'main',
    detached: false,
    ahead: 1,
    behind: 0,
    staged: 1,
    unstaged: 2,
    untracked: 0,
    conflicts: 0,
  });

  const SAMPLE_LABEL = 'Sample repository state, not your own';

  const EXIT_STATES = Object.freeze([
    { exit: 0, label: 'after a command that worked' },
    { exit: 127, label: 'after one that did not' },
  ]);

  const GLYPH_MODES = Object.freeze(['plain', 'rich']);

  /**
   * One row per theme, each carrying the spans renderPreview produced for both
   * exit states and both glyph modes.
   *
   * @param cwd       the pane's real working directory
   * @param home      the user's home, so the tilde collapses as it will live
   * @param ui,xterm  the active colour theme's tables
   * @param selected  the theme name currently chosen
   * @param glyphs    the detected mode, so the panel can lead with it
   */
  function previewModel(options) {
    const config = options && typeof options === 'object' ? options : {};
    const detected = config.glyphs === 'rich' ? 'rich' : 'plain';

    const base = {
      user: config.user || '',
      host: config.host || '',
      cwd: config.cwd || '',
      home: config.home || '',
      durationMs: 4200,
      jobs: 0,
      time: '',
      venv: '',
      git: SAMPLE_GIT,
    };

    const rows = KitThemes.themeNames().map((name) => {
      const theme = KitThemes.THEMES[name];
      const previews = [];

      for (const glyphs of GLYPH_MODES) {
        for (const state of EXIT_STATES) {
          const rendered = KitRender.renderPreview(
            theme,
            Object.assign({}, base, { exit: state.exit }),
            { ui: config.ui, xterm: config.xterm, glyphs: glyphs }
          );
          previews.push({
            glyphs: glyphs,
            exit: state.exit,
            label: state.label,
            lines: rendered.lines,
          });
        }
      }

      return {
        name: name,
        multiline: theme.multiline === true,
        selected: name === config.selected,
        previews: previews,
      };
    });

    return {
      rows: rows,
      detected: detected,
      sampleLabel: SAMPLE_LABEL,
      sampleGit: SAMPLE_GIT,
      cwd: base.cwd,
    };
  }

  /** The previews a row should lead with, given the mode actually detected. */
  function previewsFor(row, glyphs) {
    const wanted = glyphs === 'rich' ? 'rich' : 'plain';
    return row.previews.filter((preview) => preview.glyphs === wanted);
  }

  /* ------------------------------------------------------------ the DOM half */

  /**
   * A listbox of themes, keyboard-navigable like the command palette, whose
   * rows are drawn from the model above. Selecting one goes through the
   * existing settings:set; no new channel is involved.
   */
  class KitPreviewPanel {
    constructor({ backdrop, list, note, onChoose }) {
      this.backdrop = backdrop;
      this.list = list;
      this.note = note;
      this.onChoose = onChoose || (() => {});
      this.model = null;
      this.index = 0;

      this.backdrop.addEventListener('mousedown', (event) => {
        if (event.target === this.backdrop) this.close();
      });
      this.list.addEventListener('keydown', (event) => this._onKeyDown(event));
    }

    isOpen() {
      return !this.backdrop.hidden;
    }

    open(model) {
      this.model = model;
      this.index = Math.max(0, model.rows.findIndex((row) => row.selected));
      this.note.textContent = model.sampleLabel;
      this._render();
      this.backdrop.hidden = false;
      this.list.focus();
    }

    close() {
      this.backdrop.hidden = true;
    }

    _onKeyDown(event) {
      if (!this.model) return;
      if (event.key === 'Escape') {
        this.close();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const count = this.model.rows.length;
        this.index = (this.index + step + count) % count;
        this._render();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const row = this.model.rows[this.index];
        if (row) this.onChoose(row.name);
        this.close();
      }
    }

    _render() {
      const doc = this.list.ownerDocument;
      this.list.textContent = '';

      this.model.rows.forEach((row, position) => {
        const item = doc.createElement('li');
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', position === this.index ? 'true' : 'false');

        const name = doc.createElement('span');
        name.className = 'kit-preview-name';
        name.textContent = row.name + (row.selected ? ' (current)' : '');
        item.appendChild(name);

        for (const preview of previewsFor(row, this.model.detected)) {
          const sample = doc.createElement('div');
          sample.className = 'kit-preview-sample';
          sample.title = preview.label;

          for (const line of preview.lines) {
            const lineElement = doc.createElement('div');
            for (const span of line) {
              const piece = doc.createElement('span');
              piece.style.color = span.colour;
              piece.textContent = span.text;
              lineElement.appendChild(piece);
            }
            sample.appendChild(lineElement);
          }
          item.appendChild(sample);
        }

        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
          this.onChoose(row.name);
          this.close();
        });

        this.list.appendChild(item);
      });
    }
  }

  return {
    SAMPLE_GIT, SAMPLE_LABEL, EXIT_STATES, GLYPH_MODES,
    previewModel, previewsFor, KitPreviewPanel,
  };
});
