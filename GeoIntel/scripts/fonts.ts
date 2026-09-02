/**
 * Report what typeface is bundled, and confirm nothing needs installing.
 *
 * The site prints Chinese, and for most of its life it printed it in whatever face the
 * reader's operating system happened to supply — fine on macOS, worse on Windows, and on
 * Linux frequently a fallback with the wrong regional glyph forms or no Han coverage at
 * all. The face is now bundled, so every reader gets the same rendering.
 *
 * This says so out loud rather than leaving it to be discovered, and it is deliberately
 * incapable of installing anything into the operating system: that would need admin
 * rights, would permanently change the machine of anyone who runs the app, and would do
 * nothing for the readers it is meant to help. A self-hosted webfont fixes it for every
 * viewer without touching a single machine.
 *
 *   npm run fonts
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FACE = 'Noto Sans SC';
const BUILD = '.next';

function woff2Files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.woff2')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const files = woff2Files(BUILD);
const bytes = files.reduce((s, f) => s + statSync(f).size, 0);
const mb = (bytes / 1_048_576).toFixed(1);

console.log(`\n  Typeface: ${FACE}, bundled and served from this app.`);

if (!files.length) {
  // Not an error. A fresh clone has not built yet, and the fallback still renders.
  console.log('  Not built yet — run `npm run build` or `npm run dev` and the face is fetched once.');
  console.log('  Until then Chinese falls back to whatever this machine provides.\n');
} else {
  console.log(`  ${files.length} subset files, ${mb} MB on disk.`);
  console.log('  Split by unicode range, so a reader downloads only the ranges a page uses,');
  console.log('  and only once. Measured on this corpus: ~619 KB for a page with the ladder');
  console.log('  tables, ~1.4 MB for a page dense with Chinese headlines. Not trivial —');
  console.log('  it is the price of the characters rendering correctly off macOS.');
  console.log('\n  Nothing to install. No font is added to your operating system, and no request');
  console.log('  for it leaves the reader\'s browser to a third party.\n');
}
