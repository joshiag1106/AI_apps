'use strict';

/**
 * The Trace machine: real bytes, real addresses, real padding.
 *
 * This file is built across four tasks. This one is the bottom layer -- sizes,
 * alignment, and reading and writing typed values into a flat byte array.
 * Nothing here knows what an object is; that is the shadow map, added next.
 *
 * The values are the real ones, not simplified: int is 4 bytes and signed,
 * double is an IEEE 754 double, structs are padded to natural alignment. A
 * learner who prints sizeof and finds a surprise has learned something true.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TraceMachine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_JOURNAL = 200000;

  const SIZES = Object.freeze({ int: 4, char: 1, double: 8, ptr: 8, enum: 4 });
  const ALIGNS = Object.freeze({ int: 4, char: 1, double: 8, ptr: 8, enum: 4 });

  /**
   * Address zero and the page above it are deliberately unusable, so a null
   * dereference is a distinguishable event rather than a read of whatever
   * happens to live at the bottom of memory.
   */
  const LAYOUT = Object.freeze({
    CAPACITY: 0x100000,     // 1 MiB
    NULL_GUARD: 0x0000,
    GLOBAL_BASE: 0x1000,
    HEAP_BASE: 0x10000,
    STACK_TOP: 0x100000,
  });

  function sizeOf(ctype, structs) {
    switch (ctype.k) {
      case 'int': case 'char': case 'double': return SIZES[ctype.k];
      case 'ptr': return SIZES.ptr;
      case 'enum': return SIZES.enum;
      case 'void': return 1; // sizeof(void) is 1 by convention here, never 0
      case 'array': return sizeOf(ctype.of, structs) * (ctype.length || 0);
      case 'struct': {
        const layout = structs[ctype.tag];
        return layout ? layout.size : 0;
      }
      default: return 0;
    }
  }

  function alignOf(ctype, structs) {
    switch (ctype.k) {
      case 'int': case 'char': case 'double': return ALIGNS[ctype.k];
      case 'ptr': return ALIGNS.ptr;
      case 'enum': return ALIGNS.enum;
      case 'void': return 1;
      case 'array': return alignOf(ctype.of, structs);
      case 'struct': {
        const layout = structs[ctype.tag];
        return layout ? layout.align : 1;
      }
      default: return 1;
    }
  }

  function roundUp(value, align) {
    if (align <= 1) return value;
    const remainder = value % align;
    return remainder === 0 ? value : value + (align - remainder);
  }

  /**
   * Natural alignment with tail padding, exactly as a real C compiler does it.
   * The padding is visible in the returned offsets, so the diagram can show the
   * holes rather than pretending members are adjacent.
   */
  function structLayout(members, structs) {
    let offset = 0;
    let align = 1;
    const fields = [];

    for (const member of members) {
      const memberAlign = alignOf(member.ctype, structs);
      const memberSize = sizeOf(member.ctype, structs);
      offset = roundUp(offset, memberAlign);
      fields.push({ name: member.name, ctype: member.ctype, offset: offset });
      offset += memberSize;
      if (memberAlign > align) align = memberAlign;
    }

    return { size: roundUp(offset, align), align: align, fields: fields };
  }

  function createMachine(options) {
    const capacity = (options && options.capacity) || LAYOUT.CAPACITY;
    const bytes = new Uint8Array(capacity);
    const view = new DataView(bytes.buffer);

    function checkRange(address, count) {
      if (!Number.isInteger(address) || address < 0 || address + count > capacity) {
        throw new RangeError(
          'address out of range: ' + address + ' for ' + count + ' bytes');
      }
    }

    // --- the shadow map ----------------------------------------------------
    //
    // Every live object records where it is, how big it is, what type it holds
    // and which of its bytes have ever been written. This structure does two
    // jobs: it is what the diagram draws, and it is what makes undefined
    // behaviour detectable. Raw bytes cannot tell you an address is one past
    // the end of an array; this can.

    const MAX_FRAMES = 200;

    const objects = [];          // every record ever created, live or dead
    const frameStack = [];
    let globalNext = LAYOUT.GLOBAL_BASE;
    let heapNext = LAYOUT.HEAP_BASE;
    let stackNext = LAYOUT.STACK_TOP;
    let nextObjectId = 1;
    let nextFrameId = 1;
    let structs = {};

    function makeObject(name, address, size, ctype, kind, frameId, frameName) {
      const obj = {
        id: nextObjectId,
        name: name,
        address: address,
        size: size,
        ctype: ctype,
        kind: kind,
        frameId: frameId,
        frameName: frameName || null,
        alive: true,
        freed: false,
        initialised: new Uint8Array(size), // one flag per byte
      };
      nextObjectId += 1;
      objects.push(obj);
      return obj;
    }

    function declareGlobal(decl) {
      const size = sizeOf(decl.ctype, structs);
      const align = alignOf(decl.ctype, structs);
      globalNext = roundUp(globalNext, align);
      const obj = makeObject(decl.name, globalNext, size, decl.ctype, 'global', null);
      globalNext += size;
      return obj;
    }

    /** Returns the new frame id, or null when the depth cap is reached. */
    function pushFrame(functionName) {
      if (frameStack.length >= MAX_FRAMES) return null;
      const frame = {
        id: nextFrameId,
        functionName: functionName,
        base: stackNext,
        objects: [],
      };
      nextFrameId += 1;
      frameStack.push(frame);
      return frame.id;
    }

    /**
     * Objects are marked dead but kept. Keeping them is what lets a later
     * dereference say "this pointed at y in inner, which has returned" rather
     * than the useless "invalid address".
     */
    function popFrame() {
      const frame = frameStack.pop();
      if (!frame) return null;
      for (const obj of frame.objects) {
        recordFlag(obj, 'alive');
        obj.alive = false;
      }
      stackNext = frame.base;
      return frame;
    }

    function declareLocal(decl) {
      const frame = frameStack[frameStack.length - 1];
      if (!frame) return null;
      const size = sizeOf(decl.ctype, structs);
      const align = alignOf(decl.ctype, structs);
      // The stack grows down: move down by the size, then align downward.
      let address = stackNext - size;
      address -= address % align;
      stackNext = address;
      const obj = makeObject(decl.name, address, size, decl.ctype, 'local',
        frame.id, frame.functionName);
      frame.objects.push(obj);
      return obj;
    }

    /**
     * A bump allocator that never reuses freed space. Reuse would make a
     * use-after-free indistinguishable from a legitimate access, which would
     * cost the feature its most valuable diagnostic. 1 MiB is ample for the
     * programs a learner writes.
     */
    function allocate(size) {
      const rounded = roundUp(Math.max(1, size), 8);
      if (heapNext + rounded > stackNext) return 0; // NULL, as C would return
      const address = heapNext;
      heapNext += rounded;
      makeObject(null, address, rounded, null, 'heap', null);
      return address;
    }

    function release(address) {
      const record = recordAt(address);
      if (!record || record.kind !== 'heap') return { ok: false, reason: 'not-heap' };
      if (record.address !== address) return { ok: false, reason: 'not-block-start' };
      if (record.freed) return { ok: false, reason: 'double-free' };
      recordFlag(record, 'freed');
      recordFlag(record, 'alive');
      record.freed = true;
      record.alive = false;
      return { ok: true };
    }

    function contains(obj, address) {
      return address >= obj.address && address < obj.address + obj.size;
    }

    function objectAt(address) {
      for (let i = objects.length - 1; i >= 0; i -= 1) {
        if (objects[i].alive && contains(objects[i], address)) return objects[i];
      }
      return null;
    }

    /** Live or dead. The diagnostics in Task 8 need the dead ones. */
    function recordAt(address) {
      for (let i = objects.length - 1; i >= 0; i -= 1) {
        if (contains(objects[i], address)) return objects[i];
      }
      return null;
    }

    function markInitialised(address, count) {
      const obj = objectAt(address);
      if (!obj) return;
      const start = address - obj.address;
      const span = Math.max(0, Math.min(count, obj.size - start));
      recordInitBits(obj, start, span);
      for (let i = 0; i < span; i += 1) obj.initialised[start + i] = 1;
    }

    function isInitialised(address, count) {
      const obj = objectAt(address);
      if (!obj) return false;
      const start = address - obj.address;
      for (let i = 0; i < count; i += 1) {
        if (start + i >= obj.size || !obj.initialised[start + i]) return false;
      }
      return true;
    }

    function liveObjects() {
      return objects.filter((o) => o.alive);
    }

    function leakedBlocks() {
      return objects.filter((o) => o.kind === 'heap' && !o.freed);
    }

    // --- the journal -------------------------------------------------------
    //
    // Because `objects` is only ever appended to, and every other piece of
    // machine state is a scalar, a byte, or the frame stack, one step's undo
    // record is: the previous bytes of anything written, the previous flags of
    // anything killed, a shallow copy of the frame stack, and four numbers.
    // No snapshots of memory.

    const journal = [];
    let currentStep = null;

    function beginStep() {
      currentStep = {
        writes: [],          // {address, previous: Uint8Array}
        flags: [],           // {objectId, field, previous}
        initBits: [],        // {objectId, offset, previous: Uint8Array}
        objectCount: objects.length,
        frames: frameStack.slice(),
        globalNext: globalNext,
        heapNext: heapNext,
        stackNext: stackNext,
      };
    }

    function endStep() {
      if (!currentStep) return;
      journal.push(currentStep);
      currentStep = null;
      // Dropping the oldest keeps the most recent window, which is the window
      // a learner actually wants to walk back through.
      if (journal.length > MAX_JOURNAL) journal.shift();
    }

    /** Called before anything changes the bytes. */
    function recordWrite(address, count) {
      if (!currentStep) return;
      currentStep.writes.push({
        address: address,
        previous: bytes.slice(address, address + count),
      });
    }

    function recordFlag(obj, field) {
      if (!currentStep) return;
      currentStep.flags.push({ objectId: obj.id, field: field, previous: obj[field] });
    }

    function recordInitBits(obj, offset, count) {
      if (!currentStep) return;
      currentStep.initBits.push({
        objectId: obj.id,
        offset: offset,
        previous: obj.initialised.slice(offset, offset + count),
      });
    }

    function objectById(id) {
      for (let i = objects.length - 1; i >= 0; i -= 1) {
        if (objects[i].id === id) return objects[i];
      }
      return null;
    }

    function undoStep() {
      const step = journal.pop();
      if (!step) return false;

      // Reverse order matters: two writes to one address within a single step
      // must be undone last-first to land back on the original bytes.
      for (let i = step.writes.length - 1; i >= 0; i -= 1) {
        bytes.set(step.writes[i].previous, step.writes[i].address);
      }
      for (let i = step.initBits.length - 1; i >= 0; i -= 1) {
        const entry = step.initBits[i];
        const obj = objectById(entry.objectId);
        if (obj) obj.initialised.set(entry.previous, entry.offset);
      }
      for (let i = step.flags.length - 1; i >= 0; i -= 1) {
        const entry = step.flags[i];
        const obj = objectById(entry.objectId);
        if (obj) obj[entry.field] = entry.previous;
      }

      objects.length = step.objectCount;
      frameStack.length = 0;
      Array.prototype.push.apply(frameStack, step.frames);
      globalNext = step.globalNext;
      heapNext = step.heapNext;
      stackNext = step.stackNext;
      return true;
    }

    function stepsAvailable() {
      return journal.length;
    }

    // --- the checks --------------------------------------------------------
    //
    // Answers about memory, so they live on the machine rather than in the
    // interpreter. The interpreter supplies the source location and decides
    // whether a diagnostic halts execution.

    const INT_MIN = -2147483648;
    const INT_MAX = 2147483647;
    const NEAR = 64; // how far past an object an access is still "past it"

    function diagnostic(code, terse, plain, highlight) {
      return {
        code: code,
        terse: terse,
        plain: plain,
        locations: [],              // the interpreter fills these in
        highlight: highlight || [],
      };
    }

    /**
     * The object an access has just run off the end of.
     *
     * An access starting one byte past an array is contained by nothing, so
     * recordAt cannot name it. Looking for the closest object ending at or
     * before the address is what turns "wild pointer" into "you read past the
     * end of a", which is the whole difference between a shrug and a lesson.
     */
    function precedingObject(address) {
      let best = null;
      let bestEnd = -1;
      for (const obj of objects) {
        const end = obj.address + obj.size;
        if (end <= address && address - end < NEAR && end > bestEnd) {
          best = obj;
          bestEnd = end;
        }
      }
      return best;
    }

    /** A human phrase for an address, reused inside several messages. */
    function describeAddress(address) {
      const record = recordAt(address);
      if (!record) return 'address ' + address;
      const offset = address - record.address;
      const where = offset === 0 ? '' : ' plus ' + offset + ' bytes';
      if (record.kind === 'heap') {
        return 'a heap block of ' + record.size + ' bytes' + where;
      }
      return (record.name || 'an unnamed object') + where;
    }

    function overrun(record, count, verb) {
      const elements = record.ctype && record.ctype.k === 'array'
        ? record.ctype.length : null;
      const extent = elements !== null
        ? (record.name || 'it') + ' has ' + elements + ' elements, so the last '
          + 'valid index is ' + (elements - 1) + '.'
        : (record.name || 'this block') + ' is ' + record.size + ' bytes long.';
      return diagnostic(
        verb === 'write' ? 'out-of-bounds-write' : 'out-of-bounds-read',
        verb === 'write' ? 'write past the end of an object'
          : 'read past the end of an object',
        'This ' + verb + ' goes past the end of ' + (record.name || 'the block')
          + '. ' + extent,
        [{ address: record.address, size: record.size }]);
    }

    function accessProblem(address, count, verb) {
      if (!Number.isInteger(address)) {
        return diagnostic('wild-pointer',
          'invalid address',
          'This pointer does not hold a usable address. It was probably never '
            + 'given a value.',
          []);
      }
      if (address >= LAYOUT.NULL_GUARD && address < LAYOUT.GLOBAL_BASE) {
        return diagnostic('null-dereference',
          'null pointer dereferenced',
          'This pointer is NULL, which means it points at nothing. Check '
            + 'whether it was ever set, and whether a malloc that could have '
            + 'returned NULL was checked.',
          []);
      }

      const record = recordAt(address);
      if (!record) {
        const past = precedingObject(address);
        if (past) return overrun(past, count, verb);
        return diagnostic('wild-pointer',
          'address belongs to no object',
          'This address is not inside any variable or allocated block. The '
            + 'pointer holds a value that was never a real address.',
          []);
      }

      if (record.kind === 'heap' && record.freed) {
        return diagnostic('use-after-free',
          'use of freed memory',
          'This memory was released with free, so it no longer belongs to the '
            + 'program. Once a block is freed, the pointer to it must not be '
            + 'used again.',
          [{ address: record.address, size: record.size }]);
      }

      if (!record.alive && record.kind === 'local') {
        return diagnostic('dangling-stack-pointer',
          'use of a local variable after its function returned',
          'This points at ' + record.name + ', a local variable of '
            + (record.frameName || 'a function') + '. That function has '
            + 'returned, so its locals no longer exist. Returning a pointer to '
            + 'a local is never safe.',
          [{ address: record.address, size: record.size }]);
      }

      if (address + count > record.address + record.size) {
        return overrun(record, count, verb);
      }

      return null;
    }

    function checkRead(address, count) {
      const problem = accessProblem(address, count, 'read');
      if (problem) return problem;
      if (!isInitialised(address, count)) {
        const record = recordAt(address);
        const name = record && record.name ? record.name : 'this memory';
        return diagnostic('uninitialised-read',
          'read of uninitialised memory',
          name + ' has never been given a value, so reading it now would give '
            + 'whatever happened to be in memory. Assign to it before you read '
            + 'it.',
          [{ address: address, size: count }]);
      }
      return null;
    }

    function checkWrite(address, count) {
      return accessProblem(address, count, 'write');
    }

    function checkFree(address) {
      if (Number.isInteger(address) && address >= LAYOUT.NULL_GUARD
        && address < LAYOUT.GLOBAL_BASE) {
        return null; // free(NULL) is defined and does nothing
      }
      const record = recordAt(address);
      if (!record || record.kind !== 'heap') {
        return diagnostic('free-of-non-heap',
          'free of memory that did not come from malloc',
          'Only memory returned by malloc, calloc or realloc can be freed. '
            + 'Local variables and globals are managed for you.',
          record ? [{ address: record.address, size: record.size }] : []);
      }
      if (record.address !== address) {
        return diagnostic('free-of-interior-pointer',
          'free of a pointer into the middle of a block',
          'free needs the exact address malloc returned. This pointer has been '
            + 'moved along by ' + (address - record.address) + ' bytes.',
          [{ address: record.address, size: record.size }]);
      }
      if (record.freed) {
        return diagnostic('double-free',
          'memory freed twice',
          'This block has already been freed. Freeing it again is an error; '
            + 'set the pointer to NULL after freeing to make that obvious.',
          [{ address: record.address, size: record.size }]);
      }
      return null;
    }

    function checkIndex(object, index, elementSize) {
      if (index < 0) {
        return diagnostic('negative-index',
          'negative array index',
          'Array indexes start at 0, so a negative index is always outside the '
            + 'array.',
          [{ address: object.address, size: object.size }]);
      }
      const count = Math.floor(object.size / elementSize);
      if (index >= count) {
        return diagnostic('index-out-of-range',
          'array index out of range',
          (object.name || 'This array') + ' has ' + count + ' elements, so the '
            + 'last valid index is ' + (count - 1) + '. Index ' + index
            + ' is past the end.',
          [{ address: object.address, size: object.size }]);
      }
      return null;
    }

    function checkDivide(divisor) {
      if (divisor !== 0) return null;
      return diagnostic('divide-by-zero',
        'division by zero',
        'Dividing by zero has no answer, and on a real machine it usually stops '
          + 'the program. Check the divisor before dividing.',
        []);
    }

    function checkIntResult(value) {
      if (value >= INT_MIN && value <= INT_MAX) return null;
      return diagnostic('signed-overflow',
        'signed integer overflow',
        'An int holds whole numbers from ' + INT_MIN + ' to ' + INT_MAX
          + '. This result is ' + value + ', which does not fit. In real C the '
          + 'behaviour here is undefined, so the program could do anything.',
        []);
    }

    function checkLeaks() {
      const leaked = leakedBlocks();
      if (leaked.length === 0) return null;
      const total = leaked.reduce((sum, block) => sum + block.size, 0);
      return diagnostic('memory-leak',
        leaked.length + ' allocation(s) never freed',
        'The program ended with ' + leaked.length + ' block(s) still '
          + 'allocated, ' + total + ' bytes in total. Every malloc needs a '
          + 'matching free.',
        leaked.map((block) => ({ address: block.address, size: block.size })));
    }

    return {
      capacity: capacity,
      bytes: bytes,
      checkRead: checkRead,
      checkWrite: checkWrite,
      checkFree: checkFree,
      checkIndex: checkIndex,
      checkDivide: checkDivide,
      checkIntResult: checkIntResult,
      checkLeaks: checkLeaks,
      describeAddress: describeAddress,
      beginStep: beginStep,
      endStep: endStep,
      undoStep: undoStep,
      stepsAvailable: stepsAvailable,
      MAX_FRAMES: MAX_FRAMES,
      declareGlobal: declareGlobal,
      declareLocal: declareLocal,
      pushFrame: pushFrame,
      popFrame: popFrame,
      allocate: allocate,
      release: release,
      objectAt: objectAt,
      recordAt: recordAt,
      markInitialised: markInitialised,
      isInitialised: isInitialised,
      liveObjects: liveObjects,
      leakedBlocks: leakedBlocks,
      frames: function () { return frameStack.slice(); },
      setStructs: function (value) { structs = value; },
      structsRef: function () { return structs; },

      readBytes: function (address, count) {
        checkRange(address, count);
        return bytes.slice(address, address + count);
      },

      writeBytes: function (address, source) {
        checkRange(address, source.length);
        recordWrite(address, source.length);
        bytes.set(source, address);
      },

      /** Little-endian, matching every machine a learner is likely to meet. */
      readValue: function (address, ctype) {
        switch (ctype.k) {
          case 'char':
            checkRange(address, 1);
            return view.getInt8(address);
          case 'int': case 'enum':
            checkRange(address, 4);
            return view.getInt32(address, true);
          case 'double':
            checkRange(address, 8);
            return view.getFloat64(address, true);
          case 'ptr':
            checkRange(address, 8);
            // Addresses fit comfortably in 32 bits at this capacity, so the
            // high word is always zero and Number stays exact.
            return view.getUint32(address, true);
          case 'array': case 'struct':
            // An array or struct in value position is its own address.
            return address;
          default:
            throw new TypeError('cannot read a value of type ' + ctype.k);
        }
      },

      writeValue: function (address, ctype, value) {
        switch (ctype.k) {
          case 'char':
            checkRange(address, 1);
            recordWrite(address, 1);
            view.setInt8(address, value | 0);
            return;
          case 'int': case 'enum':
            checkRange(address, 4);
            recordWrite(address, 4);
            view.setInt32(address, value | 0, true);
            return;
          case 'double':
            checkRange(address, 8);
            recordWrite(address, 8);
            view.setFloat64(address, Number(value), true);
            return;
          case 'ptr':
            checkRange(address, 8);
            recordWrite(address, 8);
            view.setUint32(address, value >>> 0, true);
            view.setUint32(address + 4, 0, true);
            return;
          default:
            throw new TypeError('cannot write a value of type ' + ctype.k);
        }
      },
    };
  }

  return {
    SIZES, ALIGNS, LAYOUT, MAX_JOURNAL,
    sizeOf, alignOf, structLayout, roundUp, createMachine,
  };
});
