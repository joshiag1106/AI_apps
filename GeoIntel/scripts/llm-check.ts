/**
 * Exercise the LLM layer once, against a real key, and report what it cost.
 *
 * This exists because the layer shipped unproven: its schema, cache and disabled paths
 * were tested, but no request had ever been sent. A feature that has never run is not a
 * feature, and "it should work" is not a verification.
 *
 * One event, not a batch. The point is to establish that a real call succeeds, validates
 * against the schema, writes to the cache and produces something worth reading — before
 * anyone turns it loose on a corpus of two thousand events.
 *
 *   npm run llm:check
 */
import { allEvents, articlesByIds } from '@/lib/db';
import { analyseEvent } from '@/lib/llm/analyse';
import { llmEnabled, LLM_MODEL } from '@/lib/llm/client';

/**
 * `--zh` forces a Chinese-language cluster. Worth having as a switch: the headline
 * translations are the half of this layer that supersedes the dictionary gloss, and the
 * highest-scoring event overall is often an English one where that half never runs.
 */
function pickEvent() {
  const wantChinese = process.argv.includes('--zh');
  const all = allEvents(5000);
  const events = wantChinese ? all.filter((e) => e.languages.includes('zh')) : all;
  // The most demanding case the layer will meet: several sources, more than one language,
  // and an official PRC formula. If it earns its cost anywhere, it is here.
  const scored = events
    .map((e) => ({
      e,
      score: e.articleIds.length + e.languages.length * 5 + (e.ladderRung ? 20 : 0)
        + (e.languages.includes('zh') ? 10 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.e ?? null;
}

async function main() {
  // Reported before the key check, so a wrong model is visible even on the failing path.
  console.log(`\n  model    ${LLM_MODEL}`);

  if (!llmEnabled()) {
    console.error('\n  No ANTHROPIC_API_KEY visible to this process.');
    console.error('  Add it to .env.local as its own line, no quotes, then re-run:');
    console.error('    ANTHROPIC_API_KEY=sk-ant-...');
    console.error('\n  Nothing was sent and nothing was charged.\n');
    process.exit(1);
  }

  const event = pickEvent();
  if (!event) {
    console.error('\n  Corpus is empty — run `npm run ingest` first.\n');
    process.exit(1);
  }

  const articles = articlesByIds(event.articleIds);
  console.log(`  event    ${event.title.slice(0, 68)}`);
  console.log(`  material ${articles.length} reports, languages: ${event.languages.join('/')}`);
  console.log(`  ladder   ${event.ladderZh ? `${event.ladderZh} (${event.ladderEn})` : 'none'}`);
  console.log('\n  calling…');

  const started = Date.now();
  const res = await analyseEvent(event, articles);
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  if (!res.analysis) {
    console.error(`\n  FAILED after ${secs}s — ${res.unavailable}: ${res.detail ?? ''}\n`);
    process.exit(1);
  }

  const a = res.analysis;
  const u = res.usage;
  console.log(`\n  OK in ${secs}s${res.cached ? ' (from cache — no call made)' : ''}`);
  if (u) {
    console.log(`  tokens   ${u.input} in, ${u.output} out`
      + (u.cacheRead ? `, ${u.cacheRead} cached read` : '')
      + (u.cacheWrite ? `, ${u.cacheWrite} cache write` : ''));
  }

  console.log(`\n  translations      ${a.headline_translations.length}`);
  for (const t of a.headline_translations.slice(0, 2)) {
    console.log(`    ${t.original.slice(0, 48)}`);
    console.log(`      -> ${t.english.slice(0, 70)}`);
  }
  console.log(`\n  framing by bloc   ${a.framing_by_bloc.length}`);
  for (const f of a.framing_by_bloc.slice(0, 2)) {
    console.log(`    ${f.bloc}: ${f.frames_it_as.slice(0, 74)}`);
  }
  console.log(`\n  agreement         ${a.points_of_agreement.length} point(s)`);
  console.log(`  divergence        ${a.points_of_divergence.length} point(s)`);
  if (a.points_of_divergence[0]) console.log(`    e.g. ${a.points_of_divergence[0].slice(0, 76)}`);
  console.log(`\n  india relevance   ${a.india_relevance.slice(0, 150)}`);
  console.log(`\n  caveat            ${a.caveat.slice(0, 150)}`);
  console.log('\n  Cached, so re-running costs nothing unless the model or the cluster changes.\n');
}

main();
