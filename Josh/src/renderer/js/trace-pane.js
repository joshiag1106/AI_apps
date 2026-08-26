'use strict';

/**
 * A Trace pane: the editor, the controls, the diagram and the output, wired to
 * one runner.
 *
 * Josh has no DOM test harness, so the parts most likely to be wrong -- which
 * control is live when, and what the status area says -- are pure functions
 * with tests, and the DOM below is thin glue over them. That keeps the
 * untested surface to element creation and event plumbing.
 *
 * The pane implements the same contract app.js expects of a TerminalPane:
 * id, element, fit, focus, dispose, setTheme, applySettings. It has no start,
 * because it owns no PTY and must never be given one.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TracePane = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const inNode = typeof module === 'object' && module.exports;
  const globals = typeof self !== 'undefined' ? self : this;

  const Interp = inNode ? require('./trace-interp.js') : globals.TraceInterp;
  const Editor = inNode ? require('./trace-editor.js') : globals.TraceEditor;
  const Panel = inNode ? require('./trace-panel.js') : globals.TracePanel;
  const Examples = inNode ? require('./trace-examples.js') : globals.TraceExamples;

  const FRAME_BUDGET_MS = 12; // stay inside one frame so Stop stays responsive
  const SAVE_DEBOUNCE_MS = 600;

  // --- the pure parts, which is where the mistakes would be ----------------

  /**
   * Which controls are live. A program that will not parse offers only Reset;
   * a halted one can still be walked backwards, because "what just happened?"
   * is the question a learner asks after it stops.
   */
  function controlsFor(input) {
    const state = input.state;
    const broken = input.errors.length > 0;
    const running = Boolean(input.running);

    if (running) {
      return { run: false, stop: true, step: false, stepBack: false, reset: true };
    }
    return {
      run: !broken && !state.halted,
      stop: false,
      step: !broken && !state.halted,
      stepBack: !broken && state.stepsAvailable > 0,
      reset: true,
    };
  }

  /**
   * What the status area says. Parse errors outrank everything, since nothing
   * ran; then a runtime diagnostic; then the ordinary states.
   */
  function statusFor(input) {
    const state = input.state;

    if (input.errors.length > 0) {
      const first = input.errors[0];
      return {
        kind: 'error',
        terse: first.terse,
        plain: first.plain,
        line: first.locations.length ? first.locations[0].line : null,
      };
    }

    if (input.diagnostic) {
      const where = input.diagnostic.locations;
      return {
        kind: 'error',
        terse: input.diagnostic.terse,
        plain: input.diagnostic.plain,
        line: where && where.length ? where[0].line : null,
      };
    }

    if (state.halted) {
      const code = state.exitCode === null ? 0 : state.exitCode;
      return {
        kind: 'done',
        terse: 'Finished, returning ' + code + '.',
        plain: '',
        line: null,
      };
    }

    if (state.line !== null) {
      return { kind: 'running', terse: 'About to run line ' + state.line + '.',
        plain: '', line: state.line };
    }

    return {
      kind: 'idle',
      terse: 'Press Step to begin, or Run to go to the end.',
      plain: '',
      line: null,
    };
  }

  // --- the DOM half --------------------------------------------------------

  function button(label, title) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'trace-button';
    element.textContent = label;
    element.title = title;
    return element;
  }

  function createTracePane(options) {
    const api = options.api || (typeof window !== 'undefined' ? window.josh : null);
    const element = document.createElement('div');
    element.className = 'pane trace-pane';
    element.tabIndex = -1;

    const editorHost = document.createElement('div');
    const controls = document.createElement('div');
    controls.className = 'trace-controls';
    const lower = document.createElement('div');
    lower.className = 'trace-lower';
    const diagramHost = document.createElement('div');
    const right = document.createElement('div');
    right.className = 'trace-right';
    const outputBox = document.createElement('pre');
    outputBox.className = 'trace-output';
    outputBox.setAttribute('aria-label', 'Program output');
    const statusBox = document.createElement('div');
    statusBox.className = 'trace-status';
    statusBox.setAttribute('role', 'status');
    const stdinBox = document.createElement('textarea');
    stdinBox.className = 'trace-stdin';
    stdinBox.setAttribute('aria-label', 'Input for scanf and getchar');
    stdinBox.placeholder = 'Input the program can read';

    right.append(statusBox, outputBox, stdinBox);
    lower.append(diagramHost, right);

    const buttons = {
      run: button('Run', 'Run to the end'),
      stop: button('Stop', 'Stop the running program'),
      step: button('Step', 'Run one line'),
      stepBack: button('Step Back', 'Undo one line'),
      reset: button('Reset', 'Start again from the top'),
    };
    const examplePicker = document.createElement('select');
    examplePicker.className = 'trace-examples';
    examplePicker.setAttribute('aria-label', 'Worked examples');
    const placeholder = document.createElement('option');
    placeholder.textContent = 'Examples...';
    placeholder.value = '';
    examplePicker.appendChild(placeholder);
    for (const example of Examples.EXAMPLES) {
      const option = document.createElement('option');
      option.value = example.name;
      option.textContent = example.name;
      examplePicker.appendChild(option);
    }
    controls.append(buttons.run, buttons.stop, buttons.step, buttons.stepBack,
      buttons.reset, examplePicker);

    element.append(editorHost, controls, lower);

    const editor = Editor.createEditor({
      container: editorHost,
      onChange: function () {
        rebuild();
        scheduleSave();
      },
    });
    const diagram = Panel.createPanel({ container: diagramHost });

    let runner = null;
    let diagnostic = null;
    let running = false;
    let rafHandle = null;
    let saveHandle = null;

    function rebuild() {
      stopRunning();
      diagnostic = null;
      runner = Interp.createRunner({
        source: editor.getValue(),
        stdin: stdinBox.value,
      });
      update();
    }

    function update() {
      const state = runner ? runner.state() : null;
      if (!state) return;

      const live = controlsFor({ state: state, errors: runner.errors, running: running });
      for (const name of Object.keys(buttons)) buttons[name].disabled = !live[name];
      buttons.stop.hidden = !live.stop;
      buttons.run.hidden = live.stop;

      const status = statusFor({
        state: state, errors: runner.errors, diagnostic: diagnostic, running: running,
      });
      statusBox.className = 'trace-status is-' + status.kind;
      statusBox.textContent = status.plain
        ? status.terse + ' ' + status.plain
        : status.terse;

      editor.setCurrentLine(status.kind === 'error' ? null : state.line);
      editor.markError(status.kind === 'error' && status.line
        ? { line: status.line } : null);

      outputBox.textContent = state.output.join('');
      diagram.update(state, runner.machine);
    }

    function takeStep() {
      const result = runner.step();
      if (result.diagnostic) diagnostic = result.diagnostic;
      return result;
    }

    function runLoop() {
      const deadline = Date.now() + FRAME_BUDGET_MS;
      for (;;) {
        const result = takeStep();
        if (result.done || result.diagnostic) {
          stopRunning();
          update();
          return;
        }
        if (Date.now() > deadline) break;
      }
      update();
      rafHandle = window.requestAnimationFrame(runLoop);
    }

    function stopRunning() {
      running = false;
      if (rafHandle !== null) {
        window.cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
    }

    function scheduleSave() {
      if (!api) return;
      if (saveHandle !== null) clearTimeout(saveHandle);
      saveHandle = setTimeout(function () {
        saveHandle = null;
        api.settings.set({
          traceProgram: editor.getValue(),
          traceStdin: stdinBox.value,
        }).catch(function () { /* a failed save must never break the pane */ });
      }, SAVE_DEBOUNCE_MS);
    }

    buttons.run.addEventListener('click', function () {
      running = true;
      update();
      runLoop();
    });
    buttons.stop.addEventListener('click', function () {
      stopRunning();
      update();
    });
    buttons.step.addEventListener('click', function () {
      takeStep();
      update();
    });
    buttons.stepBack.addEventListener('click', function () {
      runner.undo();
      diagnostic = null;
      update();
    });
    buttons.reset.addEventListener('click', function () {
      stopRunning();
      runner.reset();
      diagnostic = null;
      update();
    });
    examplePicker.addEventListener('change', function () {
      const chosen = Examples.EXAMPLES.find((e) => e.name === examplePicker.value);
      if (!chosen) return;
      editor.setValue(chosen.source);
      stdinBox.value = chosen.stdin || '';
      examplePicker.value = '';
      rebuild();
      scheduleSave();
    });
    stdinBox.addEventListener('input', function () {
      rebuild();
      scheduleSave();
    });
    element.addEventListener('focusin', function () {
      if (options.onFocus) options.onFocus(options.id);
    });

    // The program from last time, or the first example on a fresh install.
    const saved = options.settings && options.settings.traceProgram;
    editor.setValue(saved || Examples.EXAMPLES[0].source);
    stdinBox.value = (options.settings && options.settings.traceStdin) || '';
    rebuild();

    return {
      id: options.id,
      element: element,
      kind: 'trace',
      fit: function () { update(); },
      focus: function () { editor.focus(); },
      setTheme: function () { update(); },
      applySettings: function () { update(); },
      dispose: function () {
        stopRunning();
        if (saveHandle !== null) clearTimeout(saveHandle);
        editor.destroy();
        diagram.destroy();
        element.remove();
      },
      // Exposed for the palette commands in app.js.
      run: function () { buttons.run.click(); },
      step: function () { buttons.step.click(); },
      stepBack: function () { buttons.stepBack.click(); },
      reset: function () { buttons.reset.click(); },
    };
  }

  return { controlsFor, statusFor, createTracePane, FRAME_BUDGET_MS };
});
