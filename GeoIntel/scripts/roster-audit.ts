/**
 * Show every roster entry beside the corpus evidence for it.
 *
 * The recurring maintenance cost of the person layer is re-checking roles, and nothing can
 * automate the judgement. This automates the LOOKING: it pairs each listed role with the
 * headlines that name that person, so the check is made against the corpus rather than
 * against recall — the rule that data/people.ts and STATE.md both insist on.
 *
 * The first section is the one that matters. An official who has left office stops being
 * written about, so a stale entry matches nothing; zero coverage is the strongest single
 * signal that a seat needs re-checking. It is not proof — a real official from a quiet
 * state also matches nothing — which is why the states are grouped and counted.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/roster-audit.ts [iso3|person-id]
 */
import { getDb } from '@/lib/db';
import { PEOPLE } from '@/data/people';
import { FORMER, DISMISSED, marksPerson } from './roster-markers';
import { findSeatMentions, classifySeat, SEATS } from './roster-seats';

const filter = process.argv[2]?.toLowerCase();

const db = getDb();
// snippet is selected because the MATCHER reads it: backfill-people.ts and the ingest both
// extract names from `title + snippet`. An audit reading only titles therefore shows a person
// as "named" beside headlines that do not contain their name, and cannot see evidence that
// lives in the snippet — which is exactly how Zhang Youxia's dismissal survived a review.
const rows = db
  .prepare('SELECT title, title_en, snippet, published_at, language, people FROM articles ORDER BY published_at DESC')
  .all() as { title: string; title_en: string | null; snippet: string | null; published_at: string; language: string; people: string | null }[];

/** Everything the matcher saw, which is what the reviewer must be able to see too. */
const textOf = (r: { title: string; title_en: string | null; snippet: string | null }) =>
  `${r.title} ${r.title_en ?? ''} ${r.snippet ?? ''}`;

/**
 * The window around a match, so a flagged row shows the SENTENCE rather than a whole snippet.
 * Printing entire snippets would bury the finding in the noise it was hiding in.
 */
function fragment(text: string, re: RegExp, width = 60): string {
  const m = re.exec(text);
  if (!m) return '';
  const start = Math.max(0, m.index - width);
  const end = Math.min(text.length, m.index + m[0].length + width);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

const hits = new Map<string, typeof rows>();
for (const r of rows) {
  for (const id of JSON.parse(r.people ?? '[]') as string[]) {
    const list = hits.get(id) ?? [];
    list.push(r);
    hits.set(id, list);
  }
}

const roster = filter
  ? PEOPLE.filter((p) => p.home.toLowerCase() === filter || p.id === filter)
  : PEOPLE;

const silent = roster.filter((p) => !hits.has(p.id));
const seen = roster.filter((p) => hits.has(p.id));

console.log(`corpus ${rows.length} articles | roster ${roster.length} | named ${seen.length} | silent ${silent.length}\n`);

console.log('=== SILENT: no article names them. Re-check or empty the seat. ===');
const byState = new Map<string, typeof silent>();
for (const p of silent) byState.set(p.home, [...(byState.get(p.home) ?? []), p]);
for (const [iso, list] of [...byState].sort((a, b) => b[1].length - a[1].length)) {
  const total = roster.filter((p) => p.home === iso).length;
  console.log(`  ${iso} (${list.length}/${total} silent): ${list.map((p) => `${p.name} — ${p.role}`).join('; ')}`);
}

// Reported before everything else: it is the only section that can be WRONG rather than
// merely thin, and a stale label is worse than an absent one — a reader has no way to tell.
const serving = seen.filter((p) => !/^former\b/i.test(p.role));

const flag = (re: RegExp) =>
  serving
    .map((p) => ({ p, marked: hits.get(p.id)!.filter((r) => marksPerson(textOf(r), re, [...p.aliases, p.name])) }))
    .filter((x) => x.marked.length)
    .sort((a, b) => b.marked.length - a.marked.length);

function report(title: string, rows: ReturnType<typeof flag>, re: RegExp) {
  console.log(`\n=== ${title} ===`);
  if (!rows.length) console.log('  none');
  for (const { p, marked } of rows) {
    console.log(`  ${p.name} [${p.home}] — listed "${p.role}" — ${marked.length}/${hits.get(p.id)!.length} articles marked`);
    for (const r of marked.slice(0, 4)) {
      console.log(`      ${r.published_at.slice(0, 10)} ${r.language}  ${r.title.slice(0, 100)}`);
      // The fragment is the point: the match often lives in the snippet, where the title
      // above shows no sign of it at all.
      const frag = fragment(textOf(r), re);
      if (frag && !FORMER.test(r.title) && !DISMISSED.test(r.title)) console.log(`         match: ${frag}`);
    }
  }
}

report('CONTRADICTED: something calls them FORMER while the roster says serving', flag(FORMER), FORMER);
report('DISMISSED: something says they were removed from office', flag(DISMISSED), DISMISSED);

// The seat check. FORMER and DISMISSED above look for a word marking a seat as ENDED; this
// asks the opposite question — who does the corpus actually put in the office? — and it is
// the only section that can catch a superseded seat, which prints no marker word at all.
// Chinese only, because only Chinese headline copy writes <country><office><name> adjacently.
// See scripts/roster-seats.ts for why, and for what this cannot do.
type Seen = { count: number; sample: (typeof rows)[number]; run: string };
const mismatch = new Map<string, Seen & { holder: string; role: string }>();
const unclaimed = new Map<string, Seen>();
const confirmed = new Map<string, Seen & { holder: string; offices: Set<string> }>();

for (const r of rows) {
  const text = textOf(r);
  if (!/[\u4e00-\u9fff]/.test(text)) continue;
  for (const m of findSeatMentions(text)) {
    if (filter && m.iso.toLowerCase() !== filter) continue;
    const v = classifySeat(text, m, PEOPLE);
    // Grouped by SEAT, not by the name-run: three outlets writing 菲律宾国防部长 with three
    // different renderings of the same minister is one finding, not three.
    const seat = `${m.iso} ${m.office}`;
    if (v.verdict === 'confirmed') {
      // Keyed on the person, so an official their outlets call both 总理 and 首相 — Anwar is
      // written both ways — is one confirmed seat rather than two.
      const cur = confirmed.get(v.holder.id);
      if (cur) { cur.count += 1; cur.offices.add(m.office); }
      else confirmed.set(v.holder.id, { count: 1, sample: r, run: m.run, holder: v.holder.name, offices: new Set([m.office]) });
    } else if (v.verdict === 'mismatch') {
      const cur = mismatch.get(seat);
      if (cur) cur.count += 1;
      else mismatch.set(seat, { count: 1, sample: r, run: m.run, holder: v.holder.name, role: v.holder.role });
    } else {
      const cur = unclaimed.get(seat);
      if (cur) cur.count += 1;
      else unclaimed.set(seat, { count: 1, sample: r, run: m.run });
    }
  }
}

const where = (r: (typeof rows)[number], run: string) => {
  const t = textOf(r);
  const i = t.indexOf(run);
  return t.slice(Math.max(0, i - 16), i + 24).replace(/\s+/g, ' ').trim();
};
const plural = (n: number) => `${n} article${n > 1 ? 's' : ''}`;

console.log('\n=== SEAT MISMATCH: the corpus names someone else in a seat this roster fills ===');
if (!mismatch.size) console.log('  none');
for (const [seat, v] of [...mismatch].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${seat} — roster says ${v.holder} ("${v.role}") — ${plural(v.count)}`);
  console.log(`      ${v.sample.published_at.slice(0, 10)}  …${where(v.sample, v.run)}…`);
}

// Split, because the two halves mean opposite things. A state the roster COVERS with an
// empty seat is a gap to fill — the corpus is naming an official this product has no node
// for. A state the roster does not cover at all is working as designed: it tracks 38 of the
// 68 states, and reporting the other 30 every run would bury the half that matters.
const covered = new Set(PEOPLE.map((p) => p.home));
const gaps = [...unclaimed].filter(([k]) => covered.has(k.split(' ')[0]));
const offRoster = [...unclaimed].filter(([k]) => !covered.has(k.split(' ')[0]));

console.log('\n=== UNCLAIMED SEAT: the corpus fills an office this roster leaves empty ===');
if (!gaps.length) console.log('  none');
for (const [seat, v] of gaps.sort((a, b) => b[1].count - a[1].count)) {
  const roles = SEATS.find((x) => x.office === seat.split(' ')[1])?.roles.slice(0, 3).join(' / ') ?? '';
  console.log(`  ${seat} (${roles}) — ${plural(v.count)}`);
  console.log(`      ${v.sample.published_at.slice(0, 10)}  …${where(v.sample, v.run)}…`);
}
if (offRoster.length) {
  const states = [...new Set(offRoster.map(([k]) => k.split(' ')[0]))].sort();
  console.log(`\n  (${offRoster.length} more in ${states.length} states this roster does not cover, which is by design: ${states.join(', ')})`);
}

// Printed because the roster has never had MECHANICAL confirmation of anything. The review
// date in data/people.ts is uneven by its own admission: most entries rest on a human having
// read a headline once. These are the seats the corpus itself vouches for today.
//
// The office is printed rather than the name-run because the run is only a CANDIDATE name —
// the verdict comes from finding the holder's own alias nearby, and where the two differ the
// run is the misleading half (阿根廷总统喊话英国 confirms Milei on an alias further along,
// but 喊话 is a verb).
console.log(`\n=== SEATS CONFIRMED BY THE CORPUS: ${confirmed.size} of ${roster.length} roster entries ===`);
if (!confirmed.size) console.log('  none');
for (const [id, v] of [...confirmed].sort((a, b) => b[1].count - a[1].count)) {
  const p = PEOPLE.find((x) => x.id === id)!;
  console.log(`  ${v.holder.padEnd(26)} [${p.home}] ${[...v.offices].join(' ')} — ${p.role}  (${v.count})`);
}

console.log('\n=== NAMED: listed role, then the headlines that mention them ===');
for (const p of seen.sort((a, b) => (hits.get(b.id)!.length - hits.get(a.id)!.length))) {
  const list = hits.get(p.id)!;
  console.log(`\n${p.name} [${p.home}] — ${p.role}  (${list.length} articles)`);
  for (const r of list.slice(0, Number(process.env.SAMPLE ?? 6))) {
    const en = r.title_en && r.title_en !== r.title ? `  // ${r.title_en}` : '';
    console.log(`   ${r.published_at.slice(0, 10)} ${r.language}  ${r.title}${en}`);
  }
}
