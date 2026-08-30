import { runIngest, buildTasks } from '@/lib/ingest/pipeline';
import { fetchFeed } from '@/lib/ingest/rss';

const args = process.argv.slice(2);

async function health() {
  const tasks = buildTasks();
  console.log(`checking ${tasks.length} feeds\n`);
  let ok = 0;
  for (const t of tasks) {
    try {
      const xml = await fetchFeed(t.url);
      const n = (xml.match(/<item[\s>]/g) ?? xml.match(/<entry[\s>]/g) ?? []).length;
      console.log(`  ok   items=${String(n).padStart(3)}  ${t.beatId ?? t.outlet ?? ''} ${t.locale ?? ''}`);
      ok += 1;
    } catch (e) {
      console.log(`  FAIL ${t.url}\n       ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\n${ok}/${tasks.length} feeds healthy`);
}

async function main() {
  if (args.includes('--health')) return health();
  const r = await runIngest({ log: (s) => console.log(`  ${s}`) });
  console.log('\n--- ingest report ---');
  console.log(`feeds        ${r.ok}/${r.tasks} ok`);
  console.log(`articles     ${r.rawArticles} fetched, ${r.stored} stored`);
  console.log(`events       ${r.events}`);
  console.log(`pruned       ${r.pruned} irrelevant, ${r.expired} past retention`);
  console.log(`languages    ${Object.entries(r.byLanguage).map(([k, v]) => `${k}:${v}`).join('  ')}`);
  console.log(`duration     ${(r.durationMs / 1000).toFixed(1)}s`);
  if (r.failed.length) {
    console.log(`\nfailed feeds (${r.failed.length}):`);
    for (const f of r.failed.slice(0, 12)) console.log(`  ${f.error}  ${f.url.slice(0, 110)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
