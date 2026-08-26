'use strict';

/**
 * The Trace memory diagram.
 *
 * buildModel and renderAsText are pure and tested; only the DOM painting below
 * is not. That split also delivers the "state as text" view, which is the
 * accessible equivalent of the boxes rather than a debug afterthought: it is a
 * second presentation of the same model, not a reimplementation of it.
 *
 * Values are formatted honestly. An uninitialised slot shows '?', never 0. A
 * diagram that invented a zero would teach exactly the wrong thing about
 * uninitialised memory, which is the lesson this whole feature is built around.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TracePanel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const Machine = (typeof module === 'object' && module.exports)
    ? require('./trace-machine.js')
    : (typeof self !== 'undefined' ? self : this).TraceMachine;

  const NEWLINE = String.fromCharCode(10);

  /** C's own spelling for a type: int, int*, int[3], struct P. */
  function describeType(ctype) {
    if (!ctype) return 'bytes';
    if (ctype.k === 'ptr') return describeType(ctype.to) + '*';
    if (ctype.k === 'array') return describeType(ctype.of) + '[' + ctype.length + ']';
    if (ctype.k === 'struct') return 'struct ' + ctype.tag;
    if (ctype.k === 'enum') return 'enum ' + ctype.tag;
    return ctype.k;
  }

  function formatSlot(obj, machine) {
    const slot = {
      name: obj.name,
      typeName: describeType(obj.ctype),
      address: obj.address,
      initialised: machine.isInitialised(obj.address, obj.size),
      isPointer: Boolean(obj.ctype && obj.ctype.k === 'ptr'),
      target: null,
      elements: null,
      value: null,
    };

    if (obj.ctype && obj.ctype.k === 'array') {
      const elementSize = Machine.sizeOf(obj.ctype.of, machine.structsRef());
      slot.elements = [];
      for (let i = 0; i < obj.ctype.length; i += 1) {
        const address = obj.address + i * elementSize;
        slot.elements.push({
          index: i,
          address: address,
          value: machine.isInitialised(address, elementSize)
            ? String(machine.readValue(address, obj.ctype.of))
            : '?',
        });
      }
      return slot;
    }

    // A struct is drawn by its members, not as a number. Leaving value null
    // stops the text view printing an address where a value belongs.
    if (obj.ctype && obj.ctype.k === 'struct') return slot;

    if (!slot.initialised) {
      slot.value = '?';
      return slot;
    }

    const raw = machine.readValue(obj.address, obj.ctype);
    if (slot.isPointer) {
      slot.value = raw === 0 ? 'NULL' : '0x' + (raw >>> 0).toString(16);
      slot.target = raw === 0 ? null : raw;
    } else {
      slot.value = String(raw);
    }
    return slot;
  }

  function buildModel(state, machine) {
    const model = { frames: [], heap: [], globals: [], arrows: [] };
    if (!machine) return model;

    const byFrame = new Map();
    for (const obj of state.objects) {
      if (obj.kind === 'global') {
        // Anonymous globals are string literals; they are storage, not
        // something a learner declared, so they are not drawn.
        if (obj.name) model.globals.push(formatSlot(obj, machine));
      } else if (obj.kind === 'heap') {
        model.heap.push({ address: obj.address, size: obj.size });
      } else if (obj.kind === 'local') {
        if (!byFrame.has(obj.frameId)) byFrame.set(obj.frameId, []);
        byFrame.get(obj.frameId).push(formatSlot(obj, machine));
      }
    }

    for (const frame of state.frames) {
      model.frames.push({
        functionName: frame.functionName,
        slots: byFrame.get(frame.id) || [],
      });
    }

    const everySlot = model.globals.concat(
      model.frames.reduce((all, frame) => all.concat(frame.slots), []));
    for (const slot of everySlot) {
      if (slot.isPointer && slot.target !== null) {
        model.arrows.push({ from: slot.address, to: slot.target });
      }
    }
    return model;
  }

  function describeSlot(slot) {
    if (slot.elements) {
      return slot.typeName + ' ' + slot.name + ' = {'
        + slot.elements.map((e) => e.value).join(', ') + '}';
    }
    if (slot.value === null) return slot.typeName + ' ' + slot.name;
    const base = slot.typeName + ' ' + slot.name + ' = ' + slot.value;
    if (slot.isPointer && slot.target !== null) {
      return base + ' (points to 0x' + slot.target.toString(16) + ')';
    }
    return base;
  }

  function renderAsText(model) {
    const out = [];
    if (model.globals.length) {
      out.push('Globals:');
      for (const slot of model.globals) out.push('  ' + describeSlot(slot));
    }
    for (const frame of model.frames) {
      out.push('Frame ' + frame.functionName + ':');
      if (frame.slots.length === 0) out.push('  (no variables yet)');
      for (const slot of frame.slots) out.push('  ' + describeSlot(slot));
    }
    if (model.heap.length) {
      out.push('Heap:');
      for (const block of model.heap) {
        out.push('  block of ' + block.size + ' bytes at 0x'
          + block.address.toString(16));
      }
    }
    if (out.length === 0) out.push('Nothing is running yet. Press Step to begin.');
    return out.join(NEWLINE);
  }

  // --- the DOM half, exercised by hand in Task 18 --------------------------

  function createPanel(options) {
    const container = options.container;
    container.classList.add('trace-diagram');
    container.setAttribute('role', 'img');

    const boxes = document.createElement('div');
    boxes.className = 'trace-boxes';
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.setAttribute('class', 'trace-arrows');
    container.append(boxes, overlay);

    function group(title, slots) {
      const element = document.createElement('div');
      element.className = 'trace-group';
      const heading = document.createElement('div');
      heading.className = 'trace-group-title';
      heading.textContent = title;
      element.appendChild(heading);
      for (const slot of slots) {
        const row = document.createElement('div');
        row.className = 'trace-slot' + (slot.initialised ? '' : ' is-unset');
        row.dataset.address = String(slot.address);
        row.textContent = describeSlot(slot);
        element.appendChild(row);
      }
      return element;
    }

    function drawArrows(model) {
      overlay.textContent = '';
      const base = container.getBoundingClientRect();
      for (const arrow of model.arrows) {
        const from = boxes.querySelector('[data-address="' + arrow.from + '"]');
        const to = boxes.querySelector('[data-address="' + arrow.to + '"]');
        if (!from || !to) continue; // the target may be a heap block, not a slot
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(a.right - base.left));
        line.setAttribute('y1', String(a.top + a.height / 2 - base.top));
        line.setAttribute('x2', String(b.right - base.left));
        line.setAttribute('y2', String(b.top + b.height / 2 - base.top));
        overlay.appendChild(line);
      }
    }

    return {
      update: function (state, machine) {
        const model = buildModel(state, machine);
        boxes.textContent = '';
        if (model.globals.length) boxes.appendChild(group('Globals', model.globals));
        for (const frame of model.frames) {
          boxes.appendChild(group('Frame ' + frame.functionName, frame.slots));
        }
        if (model.heap.length) {
          boxes.appendChild(group('Heap', model.heap.map((block) => ({
            name: null, address: block.address, initialised: true,
            typeName: 'block of ' + block.size + ' bytes', value: null, elements: null,
          }))));
        }
        // The label is the whole text view, so the diagram is described rather
        // than opaque to a screen reader.
        container.setAttribute('aria-label', renderAsText(model));
        drawArrows(model);
        return model;
      },
      destroy: function () { container.textContent = ''; },
    };
  }

  return { buildModel, renderAsText, describeType, describeSlot, createPanel };
});
