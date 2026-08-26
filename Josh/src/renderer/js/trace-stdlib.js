'use strict';

/**
 * Trace's built-in library.
 *
 * Every function here receives arguments the evaluator has already computed
 * and decayed, so none of them is a generator and none of them sees the AST.
 *
 * Reads go through the machine's checks exactly as the interpreter's do. A
 * printf("%s") on an unterminated array must produce the same out-of-bounds
 * diagnostic a hand-written loop would; a library that quietly read past the
 * end would be teaching the wrong lesson at the worst moment.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TraceStdlib = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const Interp = (typeof module === 'object' && module.exports)
    ? require('./trace-interp.js')
    : (typeof self !== 'undefined' ? self : this).TraceInterp;

  const INT = { k: 'int' };
  const CHAR = { k: 'char' };
  const VOID = { k: 'void' };

  const MAX_STRING = 65536;
  const NEWLINE = String.fromCharCode(10);

  function fail(code, terse, plain, node) {
    Interp.halt(
      { code: code, terse: terse, plain: plain, locations: [], highlight: [] },
      node
    );
  }

  /** Walks to the terminating zero, checking every byte on the way. */
  function readCString(address, ctx, node) {
    let out = '';
    let cursor = address;
    for (let i = 0; i < MAX_STRING; i += 1) {
      const problem = ctx.machine.checkRead(cursor, 1);
      if (problem) Interp.halt(problem, node);
      const byte = ctx.machine.readValue(cursor, CHAR) & 0xff;
      if (byte === 0) return out;
      out += String.fromCharCode(byte);
      cursor += 1;
    }
    fail('string-too-long', 'string has no terminator',
      'Trace followed this string for ' + MAX_STRING + ' bytes without finding '
        + 'a zero byte.', node);
    return out;
  }

  /**
   * C's printf rounds half to even, following IEEE 754. JavaScript's toFixed
   * rounds half away from zero, so 2.5 at zero places prints 3 there and 2
   * here. Matching C matters: a learner who later runs the same program
   * through gcc should see the same digits.
   */
  function formatFixed(value, places) {
    if (!Number.isFinite(value)) return String(value);
    const factor = Math.pow(10, places);
    const scaled = value * factor;
    const lower = Math.floor(scaled);
    const remainder = scaled - lower;

    let rounded;
    if (remainder > 0.5) rounded = lower + 1;
    else if (remainder < 0.5) rounded = lower;
    else rounded = lower % 2 === 0 ? lower : lower + 1;

    return (rounded / factor).toFixed(places);
  }

  function pad(text, width, leftAlign, zero) {
    if (!width || text.length >= width) return text;
    const filler = (zero && !leftAlign ? '0' : ' ').repeat(width - text.length);
    if (leftAlign) return text + filler;
    // A zero-padded negative number keeps its sign in front of the zeros.
    if (zero && (text[0] === '-' || text[0] === '+')) {
      return text[0] + filler + text.slice(1);
    }
    return filler + text;
  }

  /**
   * Supports the conversions the spec lists: d i c s f p and %%, with the
   * minus and zero flags, a width, and a precision.
   */
  function formatPrintf(template, args, ctx, node) {
    let out = '';
    let argIndex = 0;
    let i = 0;

    function nextArg(conversion) {
      if (argIndex >= args.length) {
        fail('printf-missing-argument',
          'not enough arguments for the format string',
          'The format string uses %' + conversion + ', but no value was passed '
            + 'for it. Every conversion needs a matching argument.',
          node);
      }
      const value = args[argIndex];
      argIndex += 1;
      return value;
    }

    while (i < template.length) {
      if (template[i] !== '%') {
        out += template[i];
        i += 1;
        continue;
      }
      i += 1;
      if (template[i] === '%') {
        out += '%';
        i += 1;
        continue;
      }

      let leftAlign = false;
      let zero = false;
      while (template[i] === '-' || template[i] === '0' || template[i] === '+') {
        if (template[i] === '-') leftAlign = true;
        if (template[i] === '0') zero = true;
        i += 1;
      }
      let width = 0;
      while (template[i] >= '0' && template[i] <= '9') {
        width = width * 10 + Number(template[i]);
        i += 1;
      }
      let precision = null;
      if (template[i] === '.') {
        i += 1;
        precision = 0;
        while (template[i] >= '0' && template[i] <= '9') {
          precision = precision * 10 + Number(template[i]);
          i += 1;
        }
      }

      const conversion = template[i];
      i += 1;

      switch (conversion) {
        case 'd': case 'i':
          out += pad(String(Math.trunc(nextArg(conversion).value)),
            width, leftAlign, zero);
          break;
        case 'c':
          out += pad(String.fromCharCode(nextArg('c').value & 0xff),
            width, leftAlign, false);
          break;
        case 's':
          out += pad(readCString(nextArg('s').value, ctx, node),
            width, leftAlign, false);
          break;
        case 'f':
          out += pad(formatFixed(Number(nextArg('f').value),
            precision === null ? 6 : precision), width, leftAlign, zero);
          break;
        case 'p':
          out += pad('0x' + (nextArg('p').value >>> 0).toString(16),
            width, leftAlign, false);
          break;
        default:
          fail('printf-unknown-conversion',
            "unknown conversion '%" + (conversion || '') + "'",
            'Trace understands %d, %i, %c, %s, %f, %p and %% in a format '
              + 'string.',
            node);
      }
    }
    return out;
  }

  function createBuiltins() {
    return {
      printf: function (args, ctx, node) {
        if (args.length === 0) {
          fail('printf-missing-argument', 'printf needs a format string',
            'Give printf a string to print, such as printf("hello").', node);
        }
        const template = readCString(args[0].value, ctx, node);
        ctx.output.push(formatPrintf(template, args.slice(1), ctx, node));
        return { value: 0, ctype: INT };
      },

      puts: function (args, ctx, node) {
        ctx.output.push(readCString(args[0].value, ctx, node) + NEWLINE);
        return { value: 0, ctype: INT };
      },

      putchar: function (args, ctx) {
        ctx.output.push(String.fromCharCode(args[0].value & 0xff));
        return { value: args[0].value, ctype: INT };
      },
    };
  }

  return { createBuiltins, formatPrintf, formatFixed, readCString, pad, fail,
    INT, CHAR, VOID };
});
