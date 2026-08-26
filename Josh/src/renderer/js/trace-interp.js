'use strict';

/**
 * The Trace evaluator.
 *
 * Evaluation is written with generators. Not because expressions need to pause
 * -- they do not -- but because an expression can contain a function call, and
 * a call is made of statements that must be steppable. If evaluation could not
 * suspend, a call would run to completion inside one step and a learner would
 * never see a frame pushed, which is most of what this feature exists to show.
 *
 * The only `yield` in the whole expression path is the one inside a call, so a
 * call-free expression still completes in a single next().
 *
 * Every memory access goes through the machine's checks first. That is the
 * point of the feature, so there is no fast path that skips them.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TraceInterp = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const Machine = (typeof module === 'object' && module.exports)
    ? require('./trace-machine.js')
    : (typeof self !== 'undefined' ? self : this).TraceMachine;

  /** Raised when a check fires. Caught at the top of step(). */
  class TraceHalt extends Error {
    constructor(diagnostic) {
      super(diagnostic.terse);
      this.name = 'TraceHalt';
      this.diagnostic = diagnostic;
    }
  }

  /**
   * Exceptions are the right tool here: a failed check must abandon an
   * arbitrarily deep evaluation at once, and threading a failure return
   * through every evaluator would obscure the code and still be easy to get
   * wrong. This is the one place Trace throws deliberately.
   */
  function halt(diagnostic, node) {
    if (node && diagnostic.locations.length === 0) {
      diagnostic.locations = [{ line: node.line, col: node.col, length: 1 }];
    }
    throw new TraceHalt(diagnostic);
  }

  function semantic(code, terse, plain, node) {
    halt({ code: code, terse: terse, plain: plain, locations: [], highlight: [] }, node);
  }

  function createContext(options) {
    return {
      machine: options.machine,
      ast: options.ast,
      structs: {},
      functions: Object.create(null),
      globals: new Map(),
      enums: new Map(),
      scopes: [],
      output: [],
      diagnostics: [],
      stdin: { text: '', position: 0 },
      stringPool: new Map(),
    };
  }

  // --- names ---------------------------------------------------------------

  function lookup(name, ctx, node) {
    for (let i = ctx.scopes.length - 1; i >= 0; i -= 1) {
      const found = ctx.scopes[i].get(name);
      if (found) return found;
    }
    const global = ctx.globals.get(name);
    if (global) return global;
    semantic('undeclared-identifier',
      "'" + name + "' was not declared",
      'Trace has not seen a variable called ' + name + '. Check the spelling, '
        + 'and check that it is declared before it is used.',
      node);
    return null;
  }

  // --- types ---------------------------------------------------------------

  function isPointerish(ctype) {
    return ctype.k === 'ptr' || ctype.k === 'array';
  }
  function pointee(ctype) {
    return ctype.k === 'ptr' ? ctype.to : ctype.of;
  }
  function sizeOf(ctype, ctx) {
    return Machine.sizeOf(ctype, ctx.structs);
  }

  /**
   * An array in rvalue position becomes a pointer to its first element. One
   * rule, and `int *p = arr`, `arr[i]`, `*(arr + i)` and passing an array to a
   * function all follow from it.
   */
  function decay(result) {
    if (!result || !result.ctype || result.ctype.k !== 'array') return result;
    const address = result.address !== undefined ? result.address : result.value;
    return { value: address, ctype: { k: 'ptr', to: result.ctype.of } };
  }

  function usualConversion(left, right) {
    if (left.ctype.k === 'double' || right.ctype.k === 'double') return { k: 'double' };
    return { k: 'int' };
  }

  // --- loads and stores ----------------------------------------------------

  function loadFrom(address, ctype, ctx, node) {
    if (ctype.k === 'array' || ctype.k === 'struct') {
      // An aggregate is used by address; it is never loaded as a value.
      return { value: address, ctype: ctype, address: address };
    }
    const problem = ctx.machine.checkRead(address, sizeOf(ctype, ctx));
    if (problem) halt(problem, node);
    return { value: ctx.machine.readValue(address, ctype), ctype: ctype, address: address };
  }

  function storeTo(address, ctype, value, ctx, node) {
    const size = sizeOf(ctype, ctx);
    const problem = ctx.machine.checkWrite(address, size);
    if (problem) halt(problem, node);
    const coerced = ctype.k === 'double' ? Number(value) : Math.trunc(value);
    if (ctype.k === 'int') {
      const overflow = ctx.machine.checkIntResult(coerced);
      if (overflow) halt(overflow, node);
    }
    ctx.machine.writeValue(address, ctype, coerced);
    ctx.machine.markInitialised(address, size);
    return coerced;
  }

  function checkedInt(value, ctype, ctx, node) {
    if (ctype.k === 'double') return { value: value, ctype: ctype };
    const problem = ctx.machine.checkIntResult(value);
    if (problem) halt(problem, node);
    return { value: value, ctype: { k: 'int' } };
  }

  // --- lvalues -------------------------------------------------------------

  function* evaluateLValue(node, ctx) {
    switch (node.kind) {
      case 'ident': {
        const entry = lookup(node.name, ctx, node);
        return { address: entry.address, ctype: entry.ctype };
      }
      case 'unary':
        if (node.op === '*') {
          const target = decay(yield* evaluate(node.operand, ctx));
          if (!isPointerish(target.ctype)) {
            semantic('not-a-pointer', 'cannot dereference a non-pointer',
              'Only a pointer can be dereferenced with *.', node);
          }
          return { address: target.value, ctype: pointee(target.ctype) };
        }
        break;
      case 'index': {
        const base = decay(yield* evaluate(node.array, ctx));
        if (!isPointerish(base.ctype)) {
          semantic('not-an-array', 'cannot subscript this value',
            'Only an array or a pointer can be indexed with [].', node);
        }
        const elementType = pointee(base.ctype);
        const elementSize = sizeOf(elementType, ctx);
        const index = (decay(yield* evaluate(node.index, ctx))).value;

        // Index checking needs the object, which a bare pointer may not have.
        const object = ctx.machine.objectAt(base.value);
        if (object && object.ctype && object.ctype.k === 'array') {
          const problem = ctx.machine.checkIndex(object, index, elementSize);
          if (problem) halt(problem, node);
        }
        return { address: base.value + index * elementSize, ctype: elementType };
      }
      case 'member': {
        let ownerType;
        let ownerAddress;
        if (node.arrow) {
          const pointer = decay(yield* evaluate(node.object, ctx));
          ownerAddress = pointer.value;
          ownerType = pointee(pointer.ctype);
        } else {
          const owner = yield* evaluateLValue(node.object, ctx);
          ownerAddress = owner.address;
          ownerType = owner.ctype;
        }
        if (!ownerType || ownerType.k !== 'struct') {
          semantic('not-a-struct', 'this value has no members',
            'Only a struct has members reached with . or ->.', node);
        }
        const layout = ctx.structs[ownerType.tag];
        const field = layout && layout.fields.find((f) => f.name === node.name);
        if (!field) {
          semantic('no-such-member',
            "no member named '" + node.name + "'",
            'struct ' + ownerType.tag + ' has no member called ' + node.name + '.',
            node);
        }
        return { address: ownerAddress + field.offset, ctype: field.ctype };
      }
      default: break;
    }
    semantic('not-assignable', 'this is not something with an address',
      'You can only take the address of, or assign to, a variable, an array '
        + 'element, a struct member, or a dereferenced pointer.', node);
    return null;
  }

  // --- rvalues -------------------------------------------------------------

  function* evaluate(node, ctx) {
    switch (node.kind) {
      case 'num':
        return { value: node.value, ctype: { k: node.ctype } };
      case 'charlit':
        return { value: node.value, ctype: { k: 'char' } };
      case 'str':
        return { value: internString(node.value, ctx), ctype: { k: 'ptr', to: { k: 'char' } } };
      // Exists only so compound assignment can reuse `binary` without
      // re-reading its target.
      case 'literalValue':
        return { value: node.value, ctype: node.ctype };
      case 'ident': case 'index': case 'member': {
        const place = yield* evaluateLValue(node, ctx);
        return loadFrom(place.address, place.ctype, ctx, node);
      }
      case 'unary': return yield* unary(node, ctx);
      case 'postfix': return yield* postfix(node, ctx);
      case 'binary': return yield* binary(node, ctx);
      case 'assign': return yield* assign(node, ctx);
      case 'cond': {
        const test = decay(yield* evaluate(node.test, ctx));
        return decay(yield* evaluate(test.value ? node.then : node.otherwise, ctx));
      }
      case 'cast': return yield* cast(node, ctx);
      case 'sizeofType':
        return { value: sizeOf(node.ctype, ctx), ctype: { k: 'int' } };
      case 'sizeofExpr': {
        const ctype = yield* typeOfOperand(node.operand, ctx);
        return { value: sizeOf(ctype, ctx), ctype: { k: 'int' } };
      }
      case 'call': return yield* ctx.callExpression(node, ctx); // installed by Task 11
      default:
        semantic('cannot-evaluate', 'cannot evaluate this expression',
          'Trace does not know how to evaluate this.', node);
        return null;
    }
  }

  /** sizeof needs the operand's type, not its value. */
  function* typeOfOperand(node, ctx) {
    if (node.kind === 'ident' || node.kind === 'index' || node.kind === 'member') {
      return (yield* evaluateLValue(node, ctx)).ctype;
    }
    return (yield* evaluate(node, ctx)).ctype;
  }

  function* unary(node, ctx) {
    if (node.op === '&') {
      const place = yield* evaluateLValue(node.operand, ctx);
      return { value: place.address, ctype: { k: 'ptr', to: place.ctype } };
    }
    if (node.op === '*') {
      const place = yield* evaluateLValue(node, ctx);
      return loadFrom(place.address, place.ctype, ctx, node);
    }
    if (node.op === '++' || node.op === '--') {
      const place = yield* evaluateLValue(node.operand, ctx);
      const current = loadFrom(place.address, place.ctype, ctx, node);
      const stride = isPointerish(place.ctype) ? sizeOf(pointee(place.ctype), ctx) : 1;
      const updated = current.value + (node.op === '++' ? stride : -stride);
      storeTo(place.address, place.ctype, updated, ctx, node);
      return { value: updated, ctype: place.ctype };
    }

    const operand = decay(yield* evaluate(node.operand, ctx));
    switch (node.op) {
      case '-': return checkedInt(-operand.value, operand.ctype, ctx, node);
      case '+': return operand;
      case '!': return { value: operand.value ? 0 : 1, ctype: { k: 'int' } };
      case '~': return { value: ~operand.value, ctype: { k: 'int' } };
      default:
        semantic('cannot-evaluate', 'unsupported unary operator ' + node.op,
          'Trace does not support this operator.', node);
        return null;
    }
  }

  function* postfix(node, ctx) {
    const place = yield* evaluateLValue(node.operand, ctx);
    const current = loadFrom(place.address, place.ctype, ctx, node);
    const stride = isPointerish(place.ctype) ? sizeOf(pointee(place.ctype), ctx) : 1;
    const updated = current.value + (node.op === '++' ? stride : -stride);
    storeTo(place.address, place.ctype, updated, ctx, node);
    return { value: current.value, ctype: place.ctype }; // the OLD value
  }

  function* binary(node, ctx) {
    // Short-circuit before evaluating the right side at all.
    if (node.op === '&&' || node.op === '||') {
      const left = decay(yield* evaluate(node.left, ctx)).value;
      if (node.op === '&&' && !left) return { value: 0, ctype: { k: 'int' } };
      if (node.op === '||' && left) return { value: 1, ctype: { k: 'int' } };
      const right = decay(yield* evaluate(node.right, ctx)).value;
      return { value: right ? 1 : 0, ctype: { k: 'int' } };
    }

    const left = decay(yield* evaluate(node.left, ctx));
    const right = decay(yield* evaluate(node.right, ctx));

    // Pointer arithmetic scales by the pointee size. This is where `p + 1`
    // moving four bytes comes from, and it is worth being explicit about.
    if ((node.op === '+' || node.op === '-') && isPointerish(left.ctype)
      && !isPointerish(right.ctype)) {
      const stride = sizeOf(pointee(left.ctype), ctx);
      const offset = right.value * stride;
      return {
        value: node.op === '+' ? left.value + offset : left.value - offset,
        ctype: left.ctype,
      };
    }
    if (node.op === '-' && isPointerish(left.ctype) && isPointerish(right.ctype)) {
      const stride = sizeOf(pointee(left.ctype), ctx);
      return { value: Math.trunc((left.value - right.value) / stride), ctype: { k: 'int' } };
    }

    const resultType = usualConversion(left, right);
    const a = left.value;
    const b = right.value;

    switch (node.op) {
      case '+': return checkedInt(a + b, resultType, ctx, node);
      case '-': return checkedInt(a - b, resultType, ctx, node);
      case '*': return checkedInt(a * b, resultType, ctx, node);
      case '/': {
        const problem = ctx.machine.checkDivide(b);
        if (problem) halt(problem, node);
        const value = resultType.k === 'double' ? a / b : Math.trunc(a / b);
        return checkedInt(value, resultType, ctx, node);
      }
      case '%': {
        const problem = ctx.machine.checkDivide(b);
        if (problem) halt(problem, node);
        return checkedInt(a % b, { k: 'int' }, ctx, node);
      }
      case '<': return { value: a < b ? 1 : 0, ctype: { k: 'int' } };
      case '<=': return { value: a <= b ? 1 : 0, ctype: { k: 'int' } };
      case '>': return { value: a > b ? 1 : 0, ctype: { k: 'int' } };
      case '>=': return { value: a >= b ? 1 : 0, ctype: { k: 'int' } };
      case '==': return { value: a === b ? 1 : 0, ctype: { k: 'int' } };
      case '!=': return { value: a !== b ? 1 : 0, ctype: { k: 'int' } };
      case '&': return { value: a & b, ctype: { k: 'int' } };
      case '|': return { value: a | b, ctype: { k: 'int' } };
      case '^': return { value: a ^ b, ctype: { k: 'int' } };
      case '<<': return checkedInt(a << b, { k: 'int' }, ctx, node);
      case '>>': return { value: a >> b, ctype: { k: 'int' } };
      default:
        semantic('cannot-evaluate', 'unsupported operator ' + node.op,
          'Trace does not support this operator.', node);
        return null;
    }
  }

  function* assign(node, ctx) {
    const place = yield* evaluateLValue(node.target, ctx);
    let value;
    if (node.op === '=') {
      value = decay(yield* evaluate(node.value, ctx)).value;
    } else {
      const current = loadFrom(place.address, place.ctype, ctx, node);
      const combined = yield* binary({
        kind: 'binary',
        op: node.op.slice(0, -1),
        left: { kind: 'literalValue', value: current.value, ctype: current.ctype },
        right: node.value,
        line: node.line,
        col: node.col,
      }, ctx);
      value = combined.value;
    }
    const stored = storeTo(place.address, place.ctype, value, ctx, node);
    return { value: stored, ctype: place.ctype };
  }

  function* cast(node, ctx) {
    const inner = decay(yield* evaluate(node.operand, ctx));
    if (node.ctype.k === 'int' || node.ctype.k === 'char' || node.ctype.k === 'enum') {
      return { value: Math.trunc(inner.value), ctype: node.ctype };
    }
    if (node.ctype.k === 'double') {
      return { value: Number(inner.value), ctype: node.ctype };
    }
    return { value: inner.value, ctype: node.ctype };
  }

  /**
   * String literals live in the globals region and are pooled, so two
   * occurrences of the same literal share one address, as they typically do in
   * a real program.
   */
  function internString(text, ctx) {
    if (ctx.stringPool.has(text)) return ctx.stringPool.get(text);
    const bytes = new Uint8Array(text.length + 1);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
    const obj = ctx.machine.declareGlobal({
      name: null,
      ctype: { k: 'array', of: { k: 'char' }, length: bytes.length },
    });
    ctx.machine.writeBytes(obj.address, bytes);
    ctx.machine.markInitialised(obj.address, bytes.length);
    ctx.stringPool.set(text, obj.address);
    return obj.address;
  }

  return {
    TraceHalt, createContext, evaluate, evaluateLValue,
    loadFrom, storeTo, decay, halt, semantic, sizeOf,
    isPointerish, pointee, internString, checkedInt,
  };
});
