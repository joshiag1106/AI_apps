/** Anything with a `dataset` — `document.documentElement` in the browser, a plain object in a test. */
export type PaletteRoot = { dataset: Record<string, string | undefined> };

/**
 * Set the palette attribute the whole site recolours from, and return a function that puts the
 * reader's own value back. DOM only: nothing is written to localStorage, so a reload — or a tab
 * closed mid-scene — leaves the reader's saved choice exactly as it was.
 */
export function swapPalette(root: PaletteRoot, to: string | null): () => void {
  const previous = root.dataset.palette;
  const set = (value: string | undefined) => {
    if (value === undefined) delete root.dataset.palette;
    else root.dataset.palette = value;
  };
  set(to ?? undefined);
  return () => set(previous);
}
