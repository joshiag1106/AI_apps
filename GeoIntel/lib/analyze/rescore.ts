import { createHash } from 'node:crypto';
import { CONCEPTS, NEUTRAL } from '@/data/concepts';
import { MATCHER_VERSION } from '@/lib/analyze/concepts';
import { domainOf } from '@/lib/analyze/score';
import { getDb, getMeta, setMeta } from '@/lib/db';

/**
 * Keeps stored domains in step with the vocabulary. A report's domain is computed once, when it is
 * enriched, and most stored reports are never fetched again — so without this, a change to
 * data/concepts.ts would reach only new reports, and the Board would mix two vocabularies for 90 days.
 *
 * The version is a fingerprint of the table and the matching rules, so no one has to remember to bump
 * it. The ingest pipeline calls this just before it re-clusters, which is also when domains matter
 * most: clustering never joins reports across domains.
 */
export const VOCAB_KEY = 'domain_vocab';

export function vocabVersion(): string {
  return createHash('sha256').update(JSON.stringify({ CONCEPTS, NEUTRAL, MATCHER_VERSION })).digest('hex').slice(0, 16);
}

export function rescoreDomainsIfStale(): { rescored: boolean; changed: number } {
  const version = vocabVersion();
  if (getMeta(VOCAB_KEY) === version) return { rescored: false, changed: 0 };
  const db = getDb();
  const rows = db.prepare('SELECT id, title, snippet, domain FROM articles').all() as
    { id: string; title: string; snippet: string | null; domain: string }[];
  const update = db.prepare('UPDATE articles SET domain = ? WHERE id = ?');
  let changed = 0;
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const next = domainOf(r.title, r.snippet ?? '');
      if (next !== r.domain) { update.run(next, r.id); changed += 1; }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  setMeta(VOCAB_KEY, version);
  return { rescored: true, changed };
}
