/**
 * Whose formula is it? — the shift report, and the audit.
 *
 * The ladder detector matches formula text whatever the speaker, and every surface that reads a
 * ladder says "PRC". This re-attributes every stored rung-bearing article with the current rule
 * and shows what changes: how many hits are Beijing's, how many are not, which events lose their
 * ladder, and — the part that matters — EVERY headline the rule excluded, in full, so a wrong
 * call is read by a person rather than inferred from a total.
 *
 *   npm run ladder:shift
 *
 * Read-only. Run it weekly with the roster audit: a wrong "other" hides a real Beijing formula
 * silently, and a list of exclusions somebody actually reads is the only defence.
 */
import { allArticles, allEvents } from '@/lib/db';
import { scoreText } from '@/lib/analyze/score';

const arts = allArticles(20000);
const scored = new Map(arts.map((a) => [a.id, scoreText(a.title, a.snippet)]));
const byId = new Map(arts.map((a) => [a.id, a]));

const hits = arts.filter((a) => scored.get(a.id)!.ladderRung !== null);
const bySpeaker = { prc: [] as typeof hits, other: [] as typeof hits, unclear: [] as typeof hits };
for (const a of hits) bySpeaker[scored.get(a.id)!.ladderSpeaker ?? 'unclear'].push(a);

console.log(`\nstored articles: ${arts.length}`);
console.log(`carrying a ladder formula: ${hits.length}`);
console.log(`  Beijing's:      ${bySpeaker.prc.length}`);
console.log(`  another party's: ${bySpeaker.other.length}`);
console.log(`  unclear:        ${bySpeaker.unclear.length}   (left out of the PRC surfaces, not guessed)`);

// Events: the ladder an event carried when it was stored, against the one it would carry now.
type Row = { title: string; before: number; after: number | null };
const rows: Row[] = [];
let skipped = 0;
for (const e of allEvents(20000)) {
  if (e.ladderRung == null) continue;
  const members = e.articleIds.map((id) => byId.get(id)).filter((a): a is NonNullable<typeof a> => !!a);
  if (members.length !== e.articleIds.length) { skipped += 1; continue; }
  const prc = members.filter((a) => scored.get(a.id)!.ladderSpeaker === 'prc').map((a) => scored.get(a.id)!.ladderRung!);
  rows.push({ title: e.title, before: e.ladderRung, after: prc.length ? Math.max(...prc) : null });
}
const lost = rows.filter((r) => r.after === null);
const lowered = rows.filter((r) => r.after !== null && r.after !== r.before);
console.log(`\nevents carrying a ladder today: ${rows.length}${skipped ? `  (${skipped} skipped: articles since pruned)` : ''}`);
console.log(`  would still carry one:  ${rows.length - lost.length}`);
console.log(`  would LOSE it:          ${lost.length}   — these are the "PRC ladder hits" and the alert candidates that were not Beijing's`);
console.log(`  would change rung:      ${lowered.length}`);
console.log(`the board's "PRC ladder hits" stat reads ${rows.length} today and would read ${rows.length - lost.length}`);

if (lost.length) {
  console.log('\nevents that lose their ladder:');
  for (const r of lost) console.log(`  rung ${r.before} → none   ${r.title.slice(0, 80)}`);
}
if (lowered.length) {
  console.log('\nevents whose rung changes:');
  for (const r of lowered) console.log(`  rung ${r.before} → ${r.after}   ${r.title.slice(0, 80)}`);
}

// The audit. Every exclusion, in full.
const show = (label: string, list: typeof hits) => {
  console.log(`\n=== ${label} (${list.length}) — read these: a wrong call here hides or invents a Beijing formula ===`);
  for (const a of list) {
    const s = scored.get(a.id)!;
    console.log(`  rung ${s.ladderRung} [${s.ladderZh}]  ${a.outlet}  ${a.publishedAt.slice(0, 10)}`);
    console.log(`      ${a.title}`);
    if (a.snippet && !a.title.includes(s.ladderZh ?? '')) console.log(`      snippet: ${a.snippet.slice(0, 160)}`);
  }
};
show('excluded as another party’s', bySpeaker.other);
show('excluded as unclear', bySpeaker.unclear);

// Whom each Beijing formula is about. A wrong arrow puts a dot in the wrong row and looks
// confident, so every resolved target is listed with its headline and every headline left
// unresolved is listed in full — read both, weekly, with the rest of this audit.
const aimed = new Map<string, typeof hits>();
const unstated: typeof hits = [];
for (const a of bySpeaker.prc) {
  const t = scored.get(a.id)!.ladderTarget;
  if (t) aimed.set(t, [...(aimed.get(t) ?? []), a]);
  else unstated.push(a);
}
console.log(`\n=== whom Beijing’s formulae are about: ${bySpeaker.prc.length - unstated.length} of ${bySpeaker.prc.length} resolved ===`);
for (const [t, list] of [...aimed.entries()].sort((x, y) => y[1].length - x[1].length)) {
  console.log(`\n  → ${t} (${list.length})`);
  for (const a of list) console.log(`      ${a.publishedAt.slice(0, 10)}  ${a.title}`);
}
console.log(`\n=== target not stated (${unstated.length}) — read these: could a person tell whom it is about? ===`);
for (const a of unstated) console.log(`  ${a.publishedAt.slice(0, 10)}  ${a.title}`);

// Invariant: an article with no formula must be untouched by any of this.
const stray = arts.filter((a) => scored.get(a.id)!.ladderRung === null && a.ladderRung !== null && a.ladderRung !== undefined).length;
console.log(`\nstored rungs that the current rules would no longer find at all (a lexicon change, not this one): ${stray}\n`);
