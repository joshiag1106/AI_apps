/**
 * What clustering actually produced — sizes, and the members behind the largest.
 *
 * The counterpart to cluster-gates.ts, and the guard against the trap that caught this
 * codebase twice: a summary metric moving is not evidence. In August the mean
 * articles/event *improved* to 2.02 while the output was collapsing into a single
 * 601-article blob. Sizes alone would not have shown it either — 393 articles could be a
 * real story or forty unrelated ones.
 *
 * So this prints the members. Read them. Then check the other direction too: that a story
 * you know is large has not shattered into a dozen events.
 *
 *   npx tsx scripts/cluster-shape.ts
 */
import { allArticles } from '@/lib/db';
import { clusterArticles } from '@/lib/verify/cluster';
const arts = allArticles(20000);
const t0 = Date.now();
const ev = clusterArticles(arts);
const ms = Date.now() - t0;
const sizes = ev.map(e => e.articleIds.length).sort((a,b)=>b-a);
const multi = ev.filter(e => e.articleIds.length > 1).length;
console.log(`articles ${arts.length} | events ${ev.length} | multi ${multi} (${(100*multi/ev.length).toFixed(0)}%) | mean ${(arts.length/ev.length).toFixed(2)}`);
console.log(`largest: ${sizes.slice(0,10).join(', ')}`);
console.log(`clustering took ${ms}ms`);
const byId = new Map(arts.map(a => [a.id, a]));
for (const e of [...ev].sort((a,b)=>b.articleIds.length-a.articleIds.length).slice(0,3)) {
  console.log(`\n=== ${e.articleIds.length} articles | ${e.actors.length} actors | conf ${e.confidence}`);
  for (const id of e.articleIds.slice(0,7)) console.log(`   ${byId.get(id)!.title.slice(0,72)}`);
}
