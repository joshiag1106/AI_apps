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

/**
 * Words that say a person no longer holds the office beside their name.
 *
 * This is the one part of the review a machine CAN do. An outlet that keeps quoting a
 * departed official marks the fact in the headline — "Ex-CDS", "पूर्व CDS", "前防长" — so the
 * contradiction is sitting in the corpus in plain text, and only ever found by someone
 * reading all 60-odd entries by eye. It found Anil Chauhan, who was listed as the serving
 * Chief of Defence Staff while four headlines across two languages called him the former one.
 *
 * Precision over recall, deliberately: a flag that cries wolf gets ignored, and this one is
 * read once a month at most. Chinese bare 前 is excluded because it is a preposition in
 * 目前 and 之前 and would fire on nearly everything; only 前 bound to an office is matched.
 *
 * It CANNOT bind the word to the name, so it flags a headline where someone else is the
 * former one — Lula, beside "former Brazil military chief". That is why the count is printed
 * as a ratio and the headline is printed with it: 5 of 7 is a finding, 1 of 1 is a sentence
 * to read. Judging that is the reviewer's job, and this tool never edits the roster.
 */
const FORMER = /\b(former|ex|outgoing|erstwhile)\b|\bex-|पूर्व|前(总统|首相|总理|部长|防长|外长|主席)|卸任/i;

const filter = process.argv[2]?.toLowerCase();

const db = getDb();
const rows = db
  .prepare('SELECT title, title_en, published_at, language, people FROM articles ORDER BY published_at DESC')
  .all() as { title: string; title_en: string | null; published_at: string; language: string; people: string | null }[];

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
const contradicted = seen
  .filter((p) => !/^former\b/i.test(p.role))
  .map((p) => ({ p, marked: hits.get(p.id)!.filter((r) => FORMER.test(`${r.title} ${r.title_en ?? ''}`)) }))
  .filter((x) => x.marked.length);

console.log('\n=== CONTRADICTED: a headline calls them FORMER while the roster says serving ===');
if (!contradicted.length) console.log('  none');
for (const { p, marked } of contradicted.sort((a, b) => b.marked.length - a.marked.length)) {
  console.log(`  ${p.name} [${p.home}] — listed "${p.role}" — ${marked.length}/${hits.get(p.id)!.length} headlines marked`);
  for (const r of marked.slice(0, 4)) console.log(`      ${r.published_at.slice(0, 10)} ${r.language}  ${r.title.slice(0, 110)}`);
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
