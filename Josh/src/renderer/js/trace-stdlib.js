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
  const RAND_MAX = 32767;
  const PTR_VOID = { k: 'ptr', to: VOID };
  const PTR_CHAR = { k: 'ptr', to: CHAR };

  /** Raised by exit(); caught by the runner's driver. */
  class ExitSignal extends Error {
    constructor(code) {
      super('exit');
      this.name = 'ExitSignal';
      this.code = code;
    }
  }

  /**
   * A small linear congruential generator, so the same program prints the same
   * numbers on every machine. Math.random would break the determinism the
   * whole feature depends on, replay included.
   */
  function makeRandom() {
    let seed = 1;
    return {
      seed: function (value) { seed = value >>> 0; },
      next: function () {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return (seed >>> 16) % (RAND_MAX + 1);
      },
    };
  }

  /** Every copy goes through the checks, so an overrun is caught either end. */
  function copyBytes(destination, source, count, ctx, node) {
    const readProblem = ctx.machine.checkRead(source, count);
    if (readProblem) Interp.halt(readProblem, node);
    const writeProblem = ctx.machine.checkWrite(destination, count);
    if (writeProblem) Interp.halt(writeProblem, node);
    ctx.machine.writeBytes(destination, ctx.machine.readBytes(source, count));
    ctx.machine.markInitialised(destination, count);
  }

  function writeCString(address, text, ctx, node) {
    const bytes = new Uint8Array(text.length + 1);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
    const problem = ctx.machine.checkWrite(address, bytes.length);
    if (problem) Interp.halt(problem, node);
    ctx.machine.writeBytes(address, bytes);
    ctx.machine.markInitialised(address, bytes.length);
  }

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

      malloc: function (args, ctx) {
        return { value: ctx.machine.allocate(Math.max(0, args[0].value)),
          ctype: PTR_VOID };
      },

      calloc: function (args, ctx) {
        const size = Math.max(0, args[0].value * args[1].value);
        const address = ctx.machine.allocate(size);
        if (address !== 0) {
          ctx.machine.writeBytes(address, new Uint8Array(size));
          ctx.machine.markInitialised(address, size);
        }
        return { value: address, ctype: PTR_VOID };
      },

      realloc: function (args, ctx, node) {
        const oldAddress = args[0].value;
        const newSize = Math.max(0, args[1].value);
        if (oldAddress === 0) {
          return { value: ctx.machine.allocate(newSize), ctype: PTR_VOID };
        }
        const record = ctx.machine.recordAt(oldAddress);
        const usable = record && record.kind === 'heap' && !record.freed
          && record.address === oldAddress;
        if (!usable) {
          const problem = ctx.machine.checkFree(oldAddress);
          if (problem) Interp.halt(problem, node);
        }
        const address = ctx.machine.allocate(newSize);
        if (address === 0) return { value: 0, ctype: PTR_VOID };
        const keep = Math.min(record.size, newSize);
        ctx.machine.writeBytes(address, ctx.machine.readBytes(oldAddress, keep));
        // Only the bytes that were initialised in the old block stay so.
        for (let i = 0; i < keep; i += 1) {
          if (ctx.machine.isInitialised(oldAddress + i, 1)) {
            ctx.machine.markInitialised(address + i, 1);
          }
        }
        ctx.machine.release(oldAddress);
        return { value: address, ctype: PTR_VOID };
      },

      free: function (args, ctx, node) {
        const problem = ctx.machine.checkFree(args[0].value);
        if (problem) Interp.halt(problem, node);
        if (args[0].value !== 0) ctx.machine.release(args[0].value);
        return { value: 0, ctype: VOID };
      },

      exit: function (args) {
        throw new ExitSignal(args.length ? args[0].value : 0);
      },

      abs: function (args) {
        return { value: Math.abs(args[0].value), ctype: INT };
      },

      rand: function (args, ctx) {
        if (!ctx.random) ctx.random = makeRandom();
        return { value: ctx.random.next(), ctype: INT };
      },

      srand: function (args, ctx) {
        if (!ctx.random) ctx.random = makeRandom();
        ctx.random.seed(args[0].value);
        return { value: 0, ctype: VOID };
      },

      strlen: function (args, ctx, node) {
        return { value: readCString(args[0].value, ctx, node).length, ctype: INT };
      },

      strcpy: function (args, ctx, node) {
        writeCString(args[0].value, readCString(args[1].value, ctx, node), ctx, node);
        return { value: args[0].value, ctype: PTR_CHAR };
      },

      strncpy: function (args, ctx, node) {
        const limit = Math.max(0, args[2].value);
        const text = readCString(args[1].value, ctx, node).slice(0, limit);
        const problem = ctx.machine.checkWrite(args[0].value, limit);
        if (problem) Interp.halt(problem, node);
        for (let i = 0; i < limit; i += 1) {
          ctx.machine.writeValue(args[0].value + i, CHAR,
            i < text.length ? text.charCodeAt(i) : 0);
        }
        ctx.machine.markInitialised(args[0].value, limit);
        return { value: args[0].value, ctype: PTR_CHAR };
      },

      strcmp: function (args, ctx, node) {
        const a = readCString(args[0].value, ctx, node);
        const b = readCString(args[1].value, ctx, node);
        return { value: a < b ? -1 : (a > b ? 1 : 0), ctype: INT };
      },

      strcat: function (args, ctx, node) {
        const existing = readCString(args[0].value, ctx, node);
        const added = readCString(args[1].value, ctx, node);
        writeCString(args[0].value, existing + added, ctx, node);
        return { value: args[0].value, ctype: PTR_CHAR };
      },

      memset: function (args, ctx, node) {
        const count = Math.max(0, args[2].value);
        const problem = ctx.machine.checkWrite(args[0].value, count);
        if (problem) Interp.halt(problem, node);
        ctx.machine.writeBytes(args[0].value,
          new Uint8Array(count).fill(args[1].value & 0xff));
        ctx.machine.markInitialised(args[0].value, count);
        return { value: args[0].value, ctype: PTR_VOID };
      },

      memcpy: function (args, ctx, node) {
        copyBytes(args[0].value, args[1].value, Math.max(0, args[2].value), ctx, node);
        return { value: args[0].value, ctype: PTR_VOID };
      },

      getchar: function (args, ctx) {
        const stdin = ctx.stdin;
        if (stdin.position >= stdin.text.length) return { value: -1, ctype: INT };
        const code = stdin.text.charCodeAt(stdin.position);
        stdin.position += 1;
        return { value: code, ctype: INT };
      },

      scanf: function (args, ctx, node) {
        const template = readCString(args[0].value, ctx, node);
        const stdin = ctx.stdin;
        let argIndex = 1;
        let converted = 0;

        function readToken() {
          while (stdin.position < stdin.text.length
            && /\s/.test(stdin.text[stdin.position])) stdin.position += 1;
          const start = stdin.position;
          while (stdin.position < stdin.text.length
            && !/\s/.test(stdin.text[stdin.position])) stdin.position += 1;
          return stdin.text.slice(start, stdin.position);
        }

        for (let i = 0; i < template.length; i += 1) {
          if (template[i] !== '%') continue;
          i += 1;
          const conversion = template[i];
          if (conversion === '%') continue;
          if (argIndex >= args.length) {
            fail('scanf-missing-argument', 'not enough arguments for scanf',
              'Every conversion in the format string needs a matching pointer, '
                + 'written with & in front of the variable.', node);
          }
          const target = args[argIndex];
          argIndex += 1;
          const token = readToken();
          if (token.length === 0) break; // end of input: stop, report the count

          if (conversion === 'd' || conversion === 'i') {
            const value = parseInt(token, 10);
            if (Number.isNaN(value)) break;
            const problem = ctx.machine.checkWrite(target.value, 4);
            if (problem) Interp.halt(problem, node);
            ctx.machine.writeValue(target.value, INT, value);
            ctx.machine.markInitialised(target.value, 4);
          } else if (conversion === 'f') {
            const value = parseFloat(token);
            if (Number.isNaN(value)) break;
            const problem = ctx.machine.checkWrite(target.value, 8);
            if (problem) Interp.halt(problem, node);
            ctx.machine.writeValue(target.value, { k: 'double' }, value);
            ctx.machine.markInitialised(target.value, 8);
          } else if (conversion === 's') {
            writeCString(target.value, token, ctx, node);
          } else if (conversion === 'c') {
            const problem = ctx.machine.checkWrite(target.value, 1);
            if (problem) Interp.halt(problem, node);
            ctx.machine.writeValue(target.value, CHAR, token.charCodeAt(0));
            ctx.machine.markInitialised(target.value, 1);
          } else {
            fail('scanf-unknown-conversion',
              "unknown conversion '%" + (conversion || '') + "' in scanf",
              'scanf in Trace understands %d, %i, %f, %s and %c.', node);
          }
          converted += 1;
        }
        return { value: converted, ctype: INT };
      },
    };
  }

  return { createBuiltins, formatPrintf, formatFixed, readCString, writeCString,
    pad, fail, ExitSignal, RAND_MAX, INT, CHAR, VOID };
});
