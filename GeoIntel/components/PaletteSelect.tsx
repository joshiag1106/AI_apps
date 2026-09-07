'use client';

import { useEffect, useState } from 'react';

/**
 * Lets a reader choose how severity is coloured.
 *
 * This is an accessibility control, not a theme picker. The default ramp encodes risk on a
 * green-to-red scale, which is the commonest confusion pair there is: measured with the
 * dataviz validator, two of its adjacent steps are 1.7 dE apart under deuteranopia, and two
 * more are 3.2 dE apart in NORMAL vision — so the top two severity bands read as one colour
 * for everybody. The alternatives in globals.css encode the same ramp in luminance instead,
 * which survives every colour-vision deficiency, greyscale printing and a bad projector.
 *
 * It changes a data attribute and nothing else. Every graph, chart and map in the product
 * draws from the same CSS custom properties, so one attribute re-colours the network graph,
 * the mandala, the world map and every chart at once, and no drawing component needs to
 * know this control exists.
 *
 * Stored per device rather than in the URL. A walk through the network is meant to be a
 * shareable link, and somebody else's colour preference is not part of what is shared.
 */

const KEY = 'kautilya-palette';

const OPTIONS = [
  { value: 'default', label: 'Default colours' },
  { value: 'accessible', label: 'Colour-blind safe' },
  { value: 'monochrome', label: 'Monochrome' },
] as const;

export function PaletteSelect() {
  // Starts empty rather than at 'default' so the first paint cannot disagree with the
  // attribute the inline script in app/layout.tsx has already applied from localStorage.
  const [value, setValue] = useState<string>('');

  useEffect(() => {
    setValue(document.documentElement.dataset.palette || 'default');
  }, []);

  function choose(next: string) {
    setValue(next);
    if (next === 'default') document.documentElement.removeAttribute('data-palette');
    else document.documentElement.dataset.palette = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private browsing, or storage disabled. The choice still applies to this page; it
      // simply will not survive a reload, which is a better outcome than throwing.
    }
  }

  return (
    <label className="ml-auto flex items-center gap-2">
      <span className="sr-only">Colour palette</span>
      <span aria-hidden="true" className="text-faint">Colours</span>
      <select
        value={value || 'default'}
        onChange={(e) => choose(e.target.value)}
        className="rounded border border-[color:var(--color-line)] bg-transparent px-1.5 py-0.5 text-[11px] text-muted hover:text-text"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-[color:var(--color-panel)]">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
