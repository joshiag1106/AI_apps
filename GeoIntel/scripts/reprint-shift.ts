/**
 * How much do stored confidence scores move under reprint collapse?
 *
 * Stored events were scored by the OLD scorer at the last ingest, so re-scoring each one's
 * articles with the current scorer and comparing shows the real shift without keeping a
 * second copy of the old code. Read-only.
 *
 *   npm run reprints:shift
 *
 * The check that matters most is the last line: an event with no reprints in it must score
 * EXACTLY as before. A non-zero count there means the scorer changed something it was not
 * meant to.
 */
import { allEvents, articlesByIds } from '@/lib/db';
import { scoreConfidence } from '@/lib/verify/confidence';
import { reprintFamilies } from '@/lib/verify/reprints';
import { confidenceBand } from '@/lib/format';

const events = allEvents(20000);
type Row = { title: string; before: number; after: number; articles: number; families: number; outlets: number; flagBefore: boolean; flagAfter: boolean };
const rows: Row[] = [];
/** Every family of two or more, kept so a sample can be shown: a wrong merge should be visible. */
const collapsed: { rep: string; others: string[]; outlets: string[] }[] = [];
let stale = 0;
let unexplained = 0;

for (const e of events) {
  const arts = articlesByIds(e.articleIds);
  if (arts.length !== e.articleIds.length) { stale += 1; continue; }
  const fams = reprintFamilies(arts);
  for (const f of fams) {
    if (f.members.length < 2) continue;
    collapsed.push({
      rep: f.representative.title,
      // Only the headlines that DIFFER from the representative's: what "near-identical" means
      // in practice is the point of looking.
      others: [...new Set(f.members.map((m) => m.title).filter((t) => t !== f.representative.title))],
      outlets: [...new Set(f.members.map((m) => m.outlet))],
    });
  }
  const now = scoreConfidence(arts);
  const hasReprints = fams.length < arts.length;
  if (!hasReprints && now.confidence !== e.confidence) unexplained += 1;
  rows.push({
    title: e.title, before: e.confidence, after: now.confidence, articles: arts.length,
    families: fams.length, outlets: new Set(arts.map((a) => a.outlet.toLowerCase())).size,
    flagBefore: e.flags.includes('single_source'), flagAfter: now.flags.includes('single_source'),
  });
}

const changed = rows.filter((r) => r.after !== r.before);
const drops = changed.map((r) => r.before - r.after).sort((a, b) => a - b);
const pct = (p: number) => drops[Math.min(drops.length - 1, Math.floor(drops.length * p))];
const band = (c: number) => confidenceBand(c).label;
const crossings = new Map<string, number>();
for (const r of changed) if (band(r.before) !== band(r.after)) {
  const k = `${band(r.before)}  →  ${band(r.after)}`;
  crossings.set(k, (crossings.get(k) ?? 0) + 1);
}
const corroboratedBefore = rows.filter((r) => r.before >= 50).length;
const corroboratedAfter = rows.filter((r) => r.after >= 50).length;

console.log(`\nevents scored: ${rows.length}${stale ? `  (${stale} skipped: articles since pruned)` : ''}`);
console.log(`events containing reprints: ${rows.filter((r) => r.families < r.articles).length}`);
console.log(`events whose score changes: ${changed.length}  (${(100 * changed.length / Math.max(rows.length, 1)).toFixed(1)}%)`);
if (changed.length) {
  console.log(`drop in points — median ${pct(0.5)}, p90 ${pct(0.9)}, max ${drops[drops.length - 1]}; any rise: ${drops[0] < 0 ? 'YES (a bug)' : 'none'}`);
  console.log(`\nevents that change confidence band: ${[...crossings.values()].reduce((a, b) => a + b, 0)}`);
  for (const [k, v] of [...crossings.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
}
console.log(`\n"corroborated" (score >= 50): ${corroboratedBefore} → ${corroboratedAfter}`);
console.log(`"single source" flag: ${rows.filter((r) => r.flagBefore).length} → ${rows.filter((r) => r.flagAfter).length}`);
console.log('\nlargest drops:');
for (const r of [...changed].sort((a, b) => (b.before - b.after) - (a.before - a.after)).slice(0, 10)) {
  console.log(`  ${r.before} → ${r.after}  (${r.articles} reports, ${r.families} originals, ${r.outlets} outlets)  ${r.title.slice(0, 68)}`);
}
// An evenly spaced sample, not the first few: deterministic, and spread across the corpus.
const SAMPLE = 14;
console.log(`\nsample of the ${collapsed.length} families collapsed (every ${Math.max(1, Math.floor(collapsed.length / SAMPLE))}th) — are these really one report?`);
const step = Math.max(1, Math.floor(collapsed.length / SAMPLE));
for (let i = 0; i < collapsed.length && i / step < SAMPLE; i += step) {
  const c = collapsed[i];
  console.log(`  [${c.outlets.length} outlets: ${c.outlets.slice(0, 4).join(', ')}${c.outlets.length > 4 ? ', …' : ''}]`);
  console.log(`      ${c.rep.slice(0, 96)}`);
  for (const o of c.others.slice(0, 2)) console.log(`    ≈ ${o.slice(0, 96)}`);
}
console.log(`\nunexplained changes among events with NO reprints (must be 0): ${unexplained}\n`);
