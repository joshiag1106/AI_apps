import { allEvents, allArticles } from '@/lib/db';
const ev = allEvents(5000);

// Corpus freshness. Unconstrained aggregator queries once let this reach a 23-year span,
// which silently suppressed corroboration: reports of one event must fall inside the
// 60-hour clustering window to group at all. A rising median here is that bug returning.
const arts = allArticles(20000);
const ages = arts.map(a => (Date.now() - Date.parse(a.publishedAt)) / 86_400_000).sort((x, y) => x - y);
const age = (p: number) => ages[Math.floor(ages.length * p)].toFixed(1);
console.log(`corpus ${arts.length} articles | age days p50=${age(.5)} p90=${age(.9)} max=${ages[ages.length-1].toFixed(0)}`);

const sizes = ev.map(e => e.articleIds.length).sort((a,b)=>b-a);
const multi = ev.filter(e => e.articleIds.length > 1);
console.log(`events ${ev.length} | multi-article ${multi.length} (${(100*multi.length/ev.length).toFixed(0)}%)`);
console.log(`largest clusters: ${sizes.slice(0,10).join(', ')}`);
console.log(`mean articles/event ${(sizes.reduce((a,b)=>a+b,0)/ev.length).toFixed(2)}`);
const conf = ev.map(e=>e.confidence).sort((a,b)=>a-b);
const pct = (p:number)=>conf[Math.floor(conf.length*p)];
console.log(`confidence p10=${pct(.1)} p50=${pct(.5)} p90=${pct(.9)} max=${conf[conf.length-1]}`);
console.log('\ntop corroborated events:');
for (const e of [...ev].sort((a,b)=>b.confidence-a.confidence).slice(0,6))
  console.log(`  [${e.confidence}] ${e.articleIds.length}src ${e.languages.join('/')} ${e.actors.slice(0,3).join(',')} — ${e.title.slice(0,72)}`);
const ladder = ev.filter(e=>e.ladderRung);
console.log(`\nevents carrying a PRC ladder rung: ${ladder.length}`);
for (const e of ladder.sort((a,b)=>(b.ladderRung??0)-(a.ladderRung??0)).slice(0,5))
  console.log(`  rung ${e.ladderRung} ${e.ladderZh} (${e.ladderEn}) — ${e.title.slice(0,60)}`);
