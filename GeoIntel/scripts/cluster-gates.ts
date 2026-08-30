/**
 * DIAGNOSTIC (temporary): each gate's TRUE marginal cost.
 *
 * Evaluates every gate independently per candidate pair rather than short-circuiting,
 * so we can ask: "how many pairs would merge on text+actors but die ONLY on time?"
 * That is the number that says whether a gate is over-strict.
 */
import { allArticles } from '@/lib/db';
import { tokens, jaccard } from '@/lib/verify/cluster';

const WINDOW_HOURS = 60, MIN_SHARED = 2, IDF_FACTOR = 0.9, IDF_FLOOR = 500, BIGRAM_MIN = 0.42;

const articles = allArticles(20000);
const n = articles.length;
const toks = articles.map(tokens);
const index = new Map<string, number[]>();
for (let i = 0; i < n; i++) for (const t of toks[i]) {
  const a = index.get(t); if (a) a.push(i); else index.set(t, [i]);
}
const CAP = Math.max(40, Math.floor(n * 0.04));
const scale = Math.max(n, IDF_FLOOR);
const idf = (t: string) => Math.log(scale / Math.max(1, index.get(t)?.length ?? 1));
const idfMin = IDF_FACTOR * Math.log(scale);

// corpus time span — context for interpreting the window
const times = articles.map(a => Date.parse(a.publishedAt)).filter(Number.isFinite).sort((a,b)=>a-b);
const spanH = (times[times.length-1] - times[0]) / 3600_000;
console.log(`articles ${n} | corpus spans ${(spanH/24).toFixed(1)} days`);
const bad = articles.filter(a => !Number.isFinite(Date.parse(a.publishedAt))).length;
console.log(`articles with unparseable publishedAt: ${bad}`);

let cand = 0;
const stat = { textOK: 0, timeOK: 0, domOK: 0, actOK: 0,
  allPass: 0, onlyTime: 0, onlyDomain: 0, onlyActors: 0, onlyText: 0 };
const onlyTimeGapH: number[] = [];
const onlyDomainEx: string[] = [];

for (let i = 0; i < n; i++) {
  const counts = new Map<number, number>();
  for (const t of toks[i]) {
    const p = index.get(t)!; if (p.length > CAP) continue;
    for (const j of p) if (j > i) counts.set(j, (counts.get(j) ?? 0) + 1);
  }
  for (const [j, shared] of counts) {
    if (shared < MIN_SHARED) continue;
    cand++;
    const a = articles[i], b = articles[j], ta = toks[i], tb = toks[j];

    const gapH = Math.abs(Date.parse(a.publishedAt) - Date.parse(b.publishedAt)) / 3600_000;
    const timeOK = !(gapH > WINDOW_HOURS);
    const domOK = a.domain === b.domain;
    const actOK = a.actors.some(x => b.actors.includes(x));

    // text gate, evaluated in isolation
    const sh = [...ta].filter(t => tb.has(t));
    let textOK = false;
    if (a.hotspots.length && b.hotspots.some(h => a.hotspots.includes(h))) textOK = jaccard(ta, tb) >= 0.08;
    else if (sh.filter(t => t.startsWith('gl:')).length >= 2) textOK = true;
    else {
      const w = sh.filter(t => !t.startsWith('bi:') && !t.startsWith('gl:'));
      if (w.length >= 2) textOK = w.reduce((s,t)=>s+idf(t),0) >= idfMin;
      else {
        const bg = (t: Set<string>) => new Set([...t].filter(x => x.startsWith('bi:')));
        textOK = jaccard(bg(ta), bg(tb)) >= BIGRAM_MIN;
      }
    }

    if (timeOK) stat.timeOK++; if (domOK) stat.domOK++; if (actOK) stat.actOK++; if (textOK) stat.textOK++;
    if (timeOK && domOK && actOK && textOK) stat.allPass++;
    if (!timeOK && domOK && actOK && textOK) { stat.onlyTime++; onlyTimeGapH.push(gapH); }
    if (timeOK && !domOK && actOK && textOK) {
      stat.onlyDomain++;
      if (onlyDomainEx.length < 10) onlyDomainEx.push(`${a.domain}/${b.domain}: "${a.title.slice(0,52)}" <> "${b.title.slice(0,52)}"`);
    }
    if (timeOK && domOK && !actOK && textOK) stat.onlyActors++;
    if (timeOK && domOK && actOK && !textOK) stat.onlyText++;
  }
}

console.log(`\ncandidate pairs: ${cand}`);
console.log(`pairs passing each gate in isolation:`);
console.log(`  text   ${stat.textOK}\n  time   ${stat.timeOK}\n  domain ${stat.domOK}\n  actors ${stat.actOK}`);
console.log(`\nMERGING NOW (all four): ${stat.allPass}`);
console.log(`\nblocked by EXACTLY ONE gate (the true marginal cost of each):`);
console.log(`  only time   ${stat.onlyTime}`);
console.log(`  only domain ${stat.onlyDomain}`);
console.log(`  only actors ${stat.onlyActors}`);
console.log(`  only text   ${stat.onlyText}`);

if (onlyTimeGapH.length) {
  const s = onlyTimeGapH.sort((a,b)=>a-b);
  const q = (p:number)=>s[Math.floor(s.length*p)].toFixed(0);
  console.log(`\n  time-blocked gap distribution (hours): p10=${q(.1)} p25=${q(.25)} p50=${q(.5)} p75=${q(.75)} p90=${q(.9)} max=${s[s.length-1].toFixed(0)}`);
  for (const w of [60,96,120,168,240,336]) {
    console.log(`    window ${String(w).padStart(3)}h: would recover ${s.filter(g=>g<=w).length} of ${s.length}`);
  }
}
console.log('\n  only-domain examples (same event, split by domain classifier):');
for (const e of onlyDomainEx) console.log(`   ${e}`);
