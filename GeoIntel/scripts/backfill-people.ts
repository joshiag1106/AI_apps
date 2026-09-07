import { getDb } from '@/lib/db';
import { extractPeople } from '@/lib/analyze/entities';

/**
 * Populate `articles.people` for rows stored before the column existed.
 *
 * Needed because `enrich()` runs only over newly FETCHED articles. The upsert recomputes
 * analysis for anything a feed serves again, which repairs rows when a lexicon or source
 * registry changes — but articles age out of feeds, so most stored rows are never fetched
 * a second time and would keep an empty `people` array forever.
 *
 * Measured when this was written: 4,203 of 4,713 rows predated the column, so the person
 * graph would have seen 2.6% of the corpus instead of the ~11% the extractor actually
 * finds on freshly enriched rows. That is the difference between a usable graph and an
 * almost empty one, and nothing else in the pipeline would have surfaced it.
 *
 * Safe to re-run: it recomputes from the same deterministic extractor and writes only the
 * `people` column, touching no other field and no other table. Run it after adding names
 * to data/people.ts, which is the other occasion stored rows go stale.
 *
 *   npm run backfill:people
 */

const db = getDb();
const rows = db.prepare('SELECT id, title, snippet, people FROM articles').all() as
  { id: string; title: string; snippet: string | null; people: string | null }[];

const update = db.prepare('UPDATE articles SET people = ? WHERE id = ?');

let changed = 0;
let named = 0;
db.exec('BEGIN');
try {
  for (const r of rows) {
    // The same text enrich() analyses, so the backfill and the live path cannot disagree.
    const people = extractPeople(`${r.title} ${r.snippet ?? ''}`);
    if (people.length) named += 1;
    const next = JSON.stringify(people);
    if ((r.people ?? '[]') !== next) {
      update.run(next, r.id);
      changed += 1;
    }
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

const pct = ((100 * named) / rows.length).toFixed(1);
console.log(`scanned ${rows.length} articles`);
console.log(`  naming at least one roster figure: ${named} (${pct}%)`);
console.log(`  rows updated: ${changed}`);
console.log('events are rebuilt from articles on the next ingest, so run one to propagate.');
