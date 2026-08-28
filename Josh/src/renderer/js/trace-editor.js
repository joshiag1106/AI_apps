'use strict';

/**
 * The Trace code pane: a transparent textarea over a coloured layer.
 *
 * Colouring uses the interpreter's own lexer, so what a learner sees marked as
 * a keyword is exactly what the parser will treat as one. Keeping `raw` on
 * every token is what makes the reconstruction exact, including whitespace,
 * comments, and characters that are not valid C at all.
 *
 * `highlight` is pure and unit-tested. The DOM half below has no test harness
 * in this project and is exercised by hand in Task 18.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TraceEditor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const Lex = (typeof module === 'object' && module.exports)
    ? require('./trace-lex.js')
    : (typeof self !== 'undefined' ? self : this).TraceLex;

  const BUILTINS = Object.freeze([
    'printf', 'puts', 'putchar', 'scanf', 'getchar',
    'malloc', 'calloc', 'realloc', 'free', 'exit', 'abs', 'rand', 'srand',
    'strlen', 'strcpy', 'strncpy', 'strcmp', 'strcat', 'memset', 'memcpy',
  ]);

  const CLASSES = Object.freeze({
    keyword: 'tok-keyword',
    ident: 'tok-ident',
    int: 'tok-number',
    double: 'tok-number',
    char: 'tok-string',
    string: 'tok-string',
    punct: 'tok-punct',
    comment: 'tok-comment',
    space: 'tok-space',
    stray: 'tok-error',
  });

  const NEWLINE = String.fromCharCode(10);

  /** Pure, so it is testable in Node without a DOM. */
  function highlight(source) {
    const tokens = Lex.tokenize(source, { includeTrivia: true }).tokens;
    const spans = [];
    for (const token of tokens) {
      if (token.type === 'eof') continue;
      const cls = token.type === 'ident' && BUILTINS.includes(token.value)
        ? 'tok-builtin'
        : (CLASSES[token.type] || 'tok-ident');
      spans.push({ text: token.raw, cls: cls });
    }
    return spans;
  }

  function createEditor(options) {
    const container = options.container;
    const onChange = options.onChange || function () {};

    container.classList.add('trace-editor');
    const gutter = document.createElement('div');
    gutter.className = 'trace-gutter';
    const layer = document.createElement('pre');
    layer.className = 'trace-layer';
    layer.setAttribute('aria-hidden', 'true'); // the textarea is what is read
    const input = document.createElement('textarea');
    input.className = 'trace-input';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'C program');
    container.append(gutter, layer, input);

    let currentLine = null;
    let errorLocation = null;

    function render() {
      const source = input.value;

      layer.textContent = '';
      for (const span of highlight(source)) {
        const element = document.createElement('span');
        element.className = span.cls;
        element.textContent = span.text;
        layer.appendChild(element);
      }

      const lineCount = source.split(NEWLINE).length;
      gutter.textContent = '';
      for (let n = 1; n <= lineCount; n += 1) {
        const element = document.createElement('div');
        element.textContent = String(n);
        if (errorLocation && n === errorLocation.line) element.className = 'is-error';
        else if (n === currentLine) element.className = 'is-current';
        gutter.appendChild(element);
      }
    }

    input.addEventListener('input', function () {
      render();
      onChange(input.value);
    });
    // Keep the coloured layer aligned with the textarea while scrolling.
    input.addEventListener('scroll', function () {
      layer.scrollTop = input.scrollTop;
      layer.scrollLeft = input.scrollLeft;
      gutter.scrollTop = input.scrollTop;
    });

    render();

    return {
      getValue: function () { return input.value; },
      setValue: function (text) { input.value = text; render(); },
      setCurrentLine: function (line) { currentLine = line; render(); },
      markError: function (location) { errorLocation = location; render(); },
      focus: function () { input.focus(); },
      destroy: function () { container.textContent = ''; },
    };
  }

  return { highlight, createEditor, BUILTINS, CLASSES };
});
