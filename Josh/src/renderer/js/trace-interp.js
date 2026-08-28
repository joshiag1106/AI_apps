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

  /** Is this name bound to storage, as opposed to being an enum constant? */
  function hasBinding(name, ctx) {
    for (let i = ctx.scopes.length - 1; i >= 0; i -= 1) {
      if (ctx.scopes[i].has(name)) return true;
    }
    return ctx.globals.has(name);
  }

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
      case 'ident': {
        // An enum constant is a value, not a place, so it is resolved here
        // rather than through evaluateLValue. A local or global of the same
        // name shadows it, which is what C does.
        if (!hasBinding(node.name, ctx)) {
          const enumValue = ctx.enums.get(node.name);
          if (enumValue !== undefined) return { value: enumValue, ctype: { k: 'int' } };
        }
        const named = yield* evaluateLValue(node, ctx);
        return loadFrom(named.address, named.ctype, ctx, node);
      }
      case 'index': case 'member': {
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

  // --- statements ----------------------------------------------------------

  const NORMAL = { flow: 'normal' };

  function pushScope(ctx) {
    ctx.scopes.push(new Map());
  }
  function popScope(ctx) {
    ctx.scopes.pop();
  }

  /**
   * Executes one statement. Yields once before doing its work, so the driver
   * can show the line about to run; nested statements yield in turn through
   * `yield*`. Returns a Completion, which `yield*` also propagates, so break,
   * continue and return need no side channel: an `if` inside a `while` returns
   * {flow:'break'}, the block passes it up, and the loop acts on it.
   *
   * beginStep/endStep wrap only the parts that touch memory, always in
   * try/finally. A check that fires mid-statement throws TraceHalt through the
   * evaluator, and the finally closes the journal entry so that partial step
   * stays undoable. Without it, Step Back across a halted statement would
   * corrupt the machine.
   */
  function* execute(node, ctx) {
    switch (node.kind) {
      case 'block': {
        pushScope(ctx);
        try {
          for (const statement of node.body) {
            const completion = yield* execute(statement, ctx);
            if (completion.flow !== 'normal') return completion;
          }
        } finally {
          popScope(ctx); // finally, so a halt still tears the scope down
        }
        return NORMAL;
      }

      case 'empty':
        return NORMAL;

      case 'exprStmt':
        yield node;
        ctx.machine.beginStep();
        try {
          yield* evaluate(node.expr, ctx);
        } finally {
          ctx.machine.endStep();
        }
        return NORMAL;

      case 'declStmt':
        yield node;
        ctx.machine.beginStep();
        try {
          for (const decl of node.decls) yield* declare(decl, ctx, node);
        } finally {
          ctx.machine.endStep();
        }
        return NORMAL;

      case 'if': {
        yield node;
        let test;
        ctx.machine.beginStep();
        try {
          test = decay(yield* evaluate(node.test, ctx)).value;
        } finally {
          ctx.machine.endStep();
        }
        if (test) return yield* execute(node.then, ctx);
        if (node.otherwise) return yield* execute(node.otherwise, ctx);
        return NORMAL;
      }

      case 'while': {
        for (;;) {
          yield node;
          let test;
          ctx.machine.beginStep();
          try {
            test = decay(yield* evaluate(node.test, ctx)).value;
          } finally {
            ctx.machine.endStep();
          }
          if (!test) return NORMAL;
          const completion = yield* execute(node.body, ctx);
          if (completion.flow === 'break') return NORMAL;
          if (completion.flow === 'return') return completion;
        }
      }

      case 'do': {
        for (;;) {
          const completion = yield* execute(node.body, ctx);
          if (completion.flow === 'break') return NORMAL;
          if (completion.flow === 'return') return completion;
          yield node;
          let test;
          ctx.machine.beginStep();
          try {
            test = decay(yield* evaluate(node.test, ctx)).value;
          } finally {
            ctx.machine.endStep();
          }
          if (!test) return NORMAL;
        }
      }

      case 'for': {
        // The init declaration belongs to a scope of its own, so `i` does not
        // leak out of the loop.
        pushScope(ctx);
        try {
          if (node.init) {
            const completion = yield* execute(node.init, ctx);
            if (completion.flow === 'return') return completion;
          }
          for (;;) {
            yield node;
            if (node.test) {
              let test;
              ctx.machine.beginStep();
              try {
                test = decay(yield* evaluate(node.test, ctx)).value;
              } finally {
                ctx.machine.endStep();
              }
              if (!test) return NORMAL;
            }

            const completion = yield* execute(node.body, ctx);
            if (completion.flow === 'break') return NORMAL;
            if (completion.flow === 'return') return completion;

            // `continue` reaches here, which is why the update still runs.
            if (node.update) {
              ctx.machine.beginStep();
              try {
                yield* evaluate(node.update, ctx);
              } finally {
                ctx.machine.endStep();
              }
            }
          }
        } finally {
          popScope(ctx);
        }
      }

      case 'switch': {
        yield node;
        let value;
        ctx.machine.beginStep();
        try {
          value = decay(yield* evaluate(node.disc, ctx)).value;
        } finally {
          ctx.machine.endStep();
        }

        let index = node.cases.findIndex(function (entry) {
          if (entry.test === null) return false;
          return constantOf(entry.test, ctx) === value;
        });
        if (index === -1) index = node.cases.findIndex((entry) => entry.test === null);
        if (index === -1) return NORMAL;

        pushScope(ctx);
        try {
          // Fall through from the matched case onward, until a break.
          for (let i = index; i < node.cases.length; i += 1) {
            for (const statement of node.cases[i].body) {
              const completion = yield* execute(statement, ctx);
              if (completion.flow === 'break') return NORMAL;
              if (completion.flow !== 'normal') return completion;
            }
          }
        } finally {
          popScope(ctx);
        }
        return NORMAL;
      }

      case 'break':
        yield node;
        return { flow: 'break' };

      case 'continue':
        yield node;
        return { flow: 'continue' };

      case 'return': {
        yield node;
        if (!node.value) return { flow: 'return', value: undefined };
        ctx.machine.beginStep();
        try {
          const result = decay(yield* evaluate(node.value, ctx));
          return { flow: 'return', value: result.value };
        } finally {
          ctx.machine.endStep();
        }
      }

      default:
        semantic('cannot-execute', 'cannot execute this statement',
          'Trace does not know how to run this.', node);
        return NORMAL;
    }
  }

  /** A case label must be a constant, so it is read without side effects. */
  function constantOf(node, ctx) {
    if (node.kind === 'num' || node.kind === 'charlit') return node.value;
    if (node.kind === 'ident') {
      const enumValue = ctx.enums.get(node.name);
      if (enumValue !== undefined) return enumValue;
    }
    semantic('non-constant-case', 'case label must be a constant',
      'A case label has to be a plain number or an enum constant.', node);
    return 0;
  }

  function* declare(decl, ctx, node) {
    const obj = ctx.machine.declareLocal({ name: decl.name, ctype: decl.ctype });
    if (!obj) {
      halt({
        code: 'stack-overflow',
        terse: 'out of stack space',
        plain: 'Every function call adds a frame to the stack, and this program '
          + 'has run out of room. A function calling itself with no stopping '
          + 'condition is the usual cause.',
        locations: [], highlight: [],
      }, node);
    }
    ctx.scopes[ctx.scopes.length - 1].set(decl.name,
      { address: obj.address, ctype: decl.ctype });
    if (decl.init) yield* initialise(obj.address, decl.ctype, decl.init, ctx, node);
  }

  /** Scalars, initialiser lists, and the string-into-char-array case. */
  function* initialise(address, ctype, init, ctx, node) {
    if (ctype.k === 'array' && init.kind === 'str') {
      const elementSize = sizeOf(ctype.of, ctx);
      for (let i = 0; i < ctype.length; i += 1) {
        const code = i < init.value.length ? init.value.charCodeAt(i) : 0;
        storeTo(address + i * elementSize, ctype.of, code, ctx, node);
      }
      return;
    }
    if (init.kind === 'initList') {
      if (ctype.k === 'array') {
        const elementSize = sizeOf(ctype.of, ctx);
        for (let i = 0; i < init.items.length && i < ctype.length; i += 1) {
          yield* initialise(address + i * elementSize, ctype.of, init.items[i], ctx, node);
        }
        // C zero-fills the remainder of a partially initialised aggregate.
        for (let i = init.items.length; i < ctype.length; i += 1) {
          storeTo(address + i * elementSize, ctype.of, 0, ctx, node);
        }
        return;
      }
      if (ctype.k === 'struct') {
        const layout = ctx.structs[ctype.tag];
        for (let i = 0; i < init.items.length && i < layout.fields.length; i += 1) {
          const field = layout.fields[i];
          yield* initialise(address + field.offset, field.ctype, init.items[i], ctx, node);
        }
        return;
      }
    }
    const value = decay(yield* evaluate(init, ctx)).value;
    storeTo(address, ctype, value, ctx, node);
  }

  // --- functions and the runner --------------------------------------------

  const MAX_STEPS = 5000000;

  /**
   * Walks the top level once, before anything runs: lay out structs, record
   * enum constants, index functions by name, and create globals. Doing it in
   * one pass is what lets a function call another defined later in the file.
   */
  function prepareProgram(ctx) {
    const errors = [];

    for (const node of ctx.ast.body) {
      if (node.kind === 'structDef') {
        ctx.structs[node.tag] = Machine.structLayout(node.members, ctx.structs);
      }
    }
    ctx.machine.setStructs(ctx.structs);

    for (const node of ctx.ast.body) {
      if (node.kind === 'enumDef') {
        for (const entry of node.values) ctx.enums.set(entry.name, entry.value);
      }
    }

    for (const node of ctx.ast.body) {
      if (node.kind !== 'func') continue;
      if (ctx.functions[node.name]) {
        errors.push({
          code: 'duplicate-function',
          terse: "'" + node.name + "' is defined more than once",
          plain: 'Each function needs its own name. Rename one of them.',
          locations: [{ line: node.line, col: node.col, length: 1 }],
          highlight: [],
        });
      }
      ctx.functions[node.name] = node;
    }

    // Globals are zero-initialised, which is a real and teachable difference
    // from locals: a global you forget to set is 0, a local is whatever was
    // lying in memory.
    ctx.machine.beginStep();
    try {
      for (const node of ctx.ast.body) {
        if (node.kind !== 'globalDecl') continue;
        for (const decl of node.decls) {
          const obj = ctx.machine.declareGlobal({ name: decl.name, ctype: decl.ctype });
          ctx.globals.set(decl.name, { address: obj.address, ctype: decl.ctype });
          ctx.machine.writeBytes(obj.address, new Uint8Array(obj.size));
          ctx.machine.markInitialised(obj.address, obj.size);
          if (decl.init) drain(initialise(obj.address, decl.ctype, decl.init, ctx, node));
        }
      }
    } finally {
      ctx.machine.endStep();
    }

    return errors;
  }

  /** Run a generator that cannot yield here to completion. */
  function drain(iterator) {
    let result = iterator.next();
    while (!result.done) result = iterator.next();
    return result.value;
  }

  /** Installed on the context so `evaluate` can reach it without a cycle. */
  function* callExpression(node, ctx) {
    if (node.callee.kind !== 'ident') {
      semantic('not-callable', 'this is not a function',
        'Only a function name can be called.', node);
    }
    const name = node.callee.name;

    const builtin = ctx.builtins && ctx.builtins[name];
    if (builtin) {
      const builtinArgs = [];
      for (const argument of node.args) {
        builtinArgs.push(decay(yield* evaluate(argument, ctx)));
      }
      return builtin(builtinArgs, ctx, node);
    }

    const fn = ctx.functions[name];
    if (!fn) {
      semantic('undeclared-function',
        "'" + name + "' was not declared",
        'Trace has not seen a function called ' + name + '. Check the spelling, '
          + 'and that it is defined somewhere in this file.',
        node);
    }
    if (node.args.length !== fn.params.length) {
      semantic('argument-count',
        name + ' takes ' + fn.params.length + ' argument(s), got ' + node.args.length,
        name + ' is defined to take ' + fn.params.length + ' argument(s), but '
          + 'this call passes ' + node.args.length + '.',
        node);
    }

    // Arguments are evaluated in the caller's frame, before the callee's frame
    // exists. Getting this order wrong is how f(x) ends up reading the
    // callee's uninitialised x instead of the caller's value.
    const args = [];
    for (const argument of node.args) args.push(decay(yield* evaluate(argument, ctx)));

    return yield* callFunction(fn, args, ctx, node);
  }

  function* callFunction(fn, args, ctx, node) {
    const frameId = ctx.machine.pushFrame(fn.name);
    if (frameId === null) {
      halt({
        code: 'stack-overflow',
        terse: 'too many nested function calls',
        plain: 'Each call adds a frame to the stack and this program has '
          + 'reached the limit of ' + ctx.machine.MAX_FRAMES + '. A function '
          + 'that calls itself without a stopping condition is the usual cause.',
        locations: [], highlight: [],
      }, node);
    }

    const savedScopes = ctx.scopes;
    ctx.scopes = [new Map()]; // a function cannot see its caller's locals

    try {
      ctx.machine.beginStep();
      try {
        for (let i = 0; i < fn.params.length; i += 1) {
          const param = fn.params[i];
          const obj = ctx.machine.declareLocal({ name: param.name, ctype: param.ctype });
          ctx.scopes[0].set(param.name, { address: obj.address, ctype: param.ctype });
          storeTo(obj.address, param.ctype, args[i].value, ctx, node);
        }
      } finally {
        ctx.machine.endStep();
      }

      const completion = yield* execute(fn.body, ctx);

      if (completion.flow !== 'return' && fn.returnType.k !== 'void') {
        halt({
          code: 'missing-return',
          terse: "control reaches the end of non-void function '" + fn.name + "'",
          plain: fn.name + ' says it returns a value, but this path through it '
            + 'ends without a return. The caller would receive whatever '
            + 'happened to be lying around.',
          locations: [{ line: fn.line, col: fn.col, length: 1 }],
          highlight: [],
        }, node);
      }

      const value = completion.flow === 'return' ? completion.value : 0;
      return { value: value === undefined ? 0 : value, ctype: fn.returnType };
    } finally {
      ctx.scopes = savedScopes;
      ctx.machine.beginStep();
      try {
        ctx.machine.popFrame();
      } finally {
        ctx.machine.endStep();
      }
    }
  }

  /**
   * The library lives in trace-stdlib.js, which Tasks 12 and 13 provide. Until
   * then a program simply has no builtins, and calling printf reports an
   * undeclared function like any other unknown name. Resolving it tolerantly
   * is what lets each task be verified on its own.
   */
  function loadStdlib() {
    try {
      if (typeof module === 'object' && module.exports) return require('./trace-stdlib.js');
      return (typeof self !== 'undefined' ? self : this).TraceStdlib || null;
    } catch (error) {
      return null;
    }
  }

  function loadParser() {
    if (typeof module === 'object' && module.exports) return require('./trace-parse.js');
    return (typeof self !== 'undefined' ? self : this).TraceParse;
  }

  // --- the runner ----------------------------------------------------------

  function createRunner(options) {
    const Parse = loadParser();
    const Stdlib = loadStdlib();

    const source = String(options.source || '');
    const stdinText = String(options.stdin || '');
    const maxSteps = options.maxSteps || MAX_STEPS;

    let ctx = null;
    let iterator = null;
    let errors = [];
    let halted = false;
    let currentLine = null;
    let exitCode = null;
    let stepIndex = 0;
    let rewound = false;
    const lineHistory = [];
    const outputHistory = [];

    function start() {
      const parsed = Parse.parseProgram(source);
      const machine = Machine.createMachine();
      ctx = createContext({ ast: parsed.ast, machine: machine });
      ctx.stdin = { text: stdinText, position: 0 };
      ctx.callExpression = callExpression;
      ctx.builtins = Stdlib ? Stdlib.createBuiltins() : Object.create(null);

      errors = parsed.errors.length ? parsed.errors : prepareProgram(ctx);
      halted = errors.length > 0;
      currentLine = null;
      exitCode = null;
      stepIndex = 0;
      rewound = false;
      lineHistory.length = 0;
      outputHistory.length = 0;
      iterator = errors.length ? null : driver();
    }

    /** The outermost generator: call main, then check for leaks. */
    function* driver() {
      const main = ctx.functions.main;
      try {
        const result = yield* callFunction(main, [], ctx, main);
        const leak = ctx.machine.checkLeaks();
        if (leak) halt(leak, main);
        return result;
      } catch (error) {
        // exit() unwinds here; a program that called it has not leaked in any
        // sense worth reporting. Task 13 supplies the signal.
        if (error && error.name === 'ExitSignal') {
          return { value: error.code, ctype: { k: 'int' } };
        }
        throw error;
      }
    }

    /**
     * Rebuild and run forward to `target`, silently.
     *
     * A generator cannot be rewound, but execution is deterministic, so any
     * earlier position can be reached exactly by starting over. The journal
     * keeps stepping backwards instant; this is paid once, on the first
     * forward step after a rewind.
     */
    function replayTo(target) {
      start();
      for (let i = 0; i < target; i += 1) {
        const result = iterator.next();
        if (result.done) break;
        stepIndex = i + 1;
        if (result.value && result.value.line) currentLine = result.value.line;
      }
      rewound = false;
    }

    function stepLimitDiagnostic() {
      return {
        code: 'step-limit',
        terse: 'program did not finish',
        plain: 'This program has run ' + maxSteps + ' steps without finishing, '
          + 'so it may never finish. Look at the loop on this line and check '
          + 'that something changes the value its condition tests.',
        locations: currentLine ? [{ line: currentLine, col: 1, length: 1 }] : [],
        highlight: [],
      };
    }

    function step() {
      if (rewound) replayTo(stepIndex);
      if (halted || !iterator) return { done: true, line: currentLine, diagnostic: null };

      if (stepIndex >= maxSteps) {
        halted = true;
        return { done: true, line: currentLine, diagnostic: stepLimitDiagnostic() };
      }

      lineHistory[stepIndex] = currentLine;
      outputHistory[stepIndex] = ctx.output.length;

      try {
        const result = iterator.next();
        stepIndex += 1;
        if (result.done) {
          halted = true;
          exitCode = result.value && typeof result.value.value === 'number'
            ? result.value.value : 0;
          return { done: true, line: currentLine, diagnostic: null };
        }
        if (result.value && result.value.line) currentLine = result.value.line;
        return { done: false, line: currentLine, diagnostic: null };
      } catch (error) {
        halted = true;
        if (error instanceof TraceHalt) {
          const diagnostic = error.diagnostic;
          if (diagnostic.locations.length === 0 && currentLine) {
            diagnostic.locations = [{ line: currentLine, col: 1, length: 1 }];
          }
          return { done: true, line: currentLine, diagnostic: diagnostic };
        }
        // An unexpected internal fault must still surface as a diagnostic
        // rather than a blank pane.
        return {
          done: true,
          line: currentLine,
          diagnostic: {
            code: 'internal-error',
            terse: 'Trace hit an internal problem',
            plain: 'Something went wrong inside Trace itself, not in your '
              + 'program. Details: ' + String(error && error.message),
            locations: [], highlight: [],
          },
        };
      }
    }

    function undo() {
      if (!ctx || stepIndex === 0) return false;
      if (!ctx.machine.undoStep()) return false;
      stepIndex -= 1;
      rewound = true;
      halted = false;
      exitCode = null;
      currentLine = lineHistory[stepIndex] || null;
      ctx.output.length = outputHistory[stepIndex] || 0;
      return true;
    }

    function state() {
      if (!ctx) {
        return { frames: [], objects: [], output: [], line: null,
          stepsAvailable: 0, halted: true, exitCode: null };
      }
      return {
        frames: ctx.machine.frames(),
        objects: ctx.machine.liveObjects(),
        output: ctx.output,
        line: currentLine,
        stepsAvailable: ctx.machine.stepsAvailable(),
        halted: halted,
        exitCode: exitCode,
      };
    }

    start();
    return {
      get errors() { return errors; },
      get machine() { return ctx ? ctx.machine : null; },
      step: step,
      undo: undo,
      state: state,
      reset: start,
    };
  }

  return {
    TraceHalt, createContext, evaluate, evaluateLValue,
    execute, pushScope, popScope, initialise,
    prepareProgram, callExpression, callFunction, createRunner, MAX_STEPS,
    loadFrom, storeTo, decay, halt, semantic, sizeOf,
    isPointerish, pointee, internString, checkedInt,
  };
});
