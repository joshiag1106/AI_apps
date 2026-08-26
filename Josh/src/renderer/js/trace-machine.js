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

    return {
      capacity: capacity,
      bytes: bytes,

      readBytes: function (address, count) {
        checkRange(address, count);
        return bytes.slice(address, address + count);
      },

      writeBytes: function (address, source) {
        checkRange(address, source.length);
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
            view.setInt8(address, value | 0);
            return;
          case 'int': case 'enum':
            checkRange(address, 4);
            view.setInt32(address, value | 0, true);
            return;
          case 'double':
            checkRange(address, 8);
            view.setFloat64(address, Number(value), true);
            return;
          case 'ptr':
            checkRange(address, 8);
            view.setUint32(address, value >>> 0, true);
            view.setUint32(address + 4, 0, true);
            return;
          default:
            throw new TypeError('cannot write a value of type ' + ctype.k);
        }
      },
    };
  }

  return { SIZES, ALIGNS, LAYOUT, sizeOf, alignOf, structLayout, roundUp, createMachine };
});
