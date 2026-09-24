/**
 * How the "which kind of pressure" vocabulary reads the real corpus. Run it before and after any change
 * to data/concepts.ts: coverage per language, every Language Lens verdict, the domain mix, and what
 * clustering does with the recomputed domains (domain agreement gates clustering, lib/verify/cluster).
 *
 *   npm run concepts:report
 *   npm run concepts:report -- --sample ja 30     thirty classified Japanese headlines, to read by hand
 */
import { allArticles, beatArticles } from '@/lib/db';
import { evidencedDomain } from '@/lib/analyze/score';
import { describeSharpest, lens } from '@/lib/lens/compare';
import { clusterArticles } from '@/lib/verify/cluster';
import { BEATS } from '@/data/feeds';
import type { Article } from '@/lib/types';

const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))}%`;
const kind = (a: Article) => evidencedDomain(a.title, a.snippet ?? '');
const args = process.argv.slice(2);

if (args[0] === '--sample') {
  const lang = args[1];
  const n = Number(args[2] ?? 30);
  const rows = beatArticles().filter((a) => a.language === lang).map((a) => ({ a, d: kind(a) })).filter((r) => r.d);
  // Every k-th classified report, not the first n: a spread across the corpus.
  const step = Math.max(1, Math.floor(rows.length / n));
  const seen = new Set<string>();
  for (let i = 0; i < rows.length && seen.size < n; i += step) {
    const t = rows[i].a.title.slice(0, 100);
    if (seen.has(t)) continue;
    seen.add(t);
    console.log(`${rows[i].d!.padEnd(10)} ${t}`);
  }
  process.exit(0);
}

const beat = beatArticles();
const all = allArticles(20000);

console.log('== readable share, topic searches');
const by = new Map<string, { n: number; hit: number }>();
for (const a of beat) {
  const b = by.get(a.language) ?? { n: 0, hit: 0 };
  b.n += 1;
  if (kind(a)) b.hit += 1;
  by.set(a.language, b);
}
for (const [l, b] of [...by].filter(([, b]) => b.n >= 20).sort((x, y) => y[1].n - x[1].n)) {
  console.log(`  ${l.padEnd(4)} ${String(b.hit).padStart(5)}/${String(b.n).padEnd(5)} ${pct(b.hit, b.n)}`);
}

console.log('== Lens verdicts');
for (const t of lens(beat.map((a) => ({ ...a, framed: kind(a) })), BEATS)) {
  const cols = t.columns.map((c) => `${c.language}${c.framing.length ? '' : '(unread)'} ${c.classified}/${c.articles}`).join(', ');
  console.log(`  ${t.label}: ${cols}\n    ${t.sharpest ? describeSharpest(t.sharpest) : 'no call-out'}`);
}

console.log('== domain mix, all articles (recomputed)');
const recomputed = all.map((a) => ({ ...a, domain: kind(a) ?? 'Diplomatic' }));
const mix = new Map<string, number>();
for (const a of recomputed) mix.set(a.domain, (mix.get(a.domain) ?? 0) + 1);
for (const [d, n] of [...mix].sort((x, y) => y[1] - x[1])) console.log(`  ${d.padEnd(11)} ${String(n).padStart(5)} ${pct(n, all.length)}`);

console.log('== clustering on the recomputed domains');
const t0 = Date.now();
const ev = clusterArticles(recomputed);
const sizes = ev.map((e) => e.articleIds.length).sort((x, y) => y - x);
const multi = ev.filter((e) => e.articleIds.length > 1).length;
const cross = ev.filter((e) => e.languages.length > 1).length;
console.log(`  articles ${all.length} | events ${ev.length} | multi ${multi} (${pct(multi, ev.length)}) | mean ${(all.length / ev.length).toFixed(2)} | ${Date.now() - t0}ms`);
console.log(`  largest: ${sizes.slice(0, 10).join(', ')} | cross-language events: ${cross}`);
const byId = new Map(all.map((a) => [a.id, a]));
const top = [...ev].sort((x, y) => y.articleIds.length - x.articleIds.length)[0];
if (top) {
  console.log(`  largest event (${top.articleIds.length} articles, ${top.languages.join('/')}):`);
  for (const id of top.articleIds.slice(0, 12)) console.log(`    ${byId.get(id)!.title.slice(0, 90)}`);
}
