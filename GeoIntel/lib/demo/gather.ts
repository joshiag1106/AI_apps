import 'server-only';
import {
  corpus, corpusStats, countryRisks, hotspotActivity, topDyads, countryName, lastIngest,
} from '@/lib/queries';
import {
  articlesByIds, corpusSince, eventIdsByArticle, ladderTrailArticles, otherPartyLadderArticles,
} from '@/lib/db';
import { worldShapes, project } from '@/lib/map';
import { ladderTrail } from '@/lib/verify/trail';
import { COUNTRIES } from '@/data/countries';
import { demoOrigin } from './alert';
import { isJunkHeadline } from './junk';
import type { BoardData, ClaimsState, DemoInput } from './types';

/** The size the splash draws its map at; WorldMap projects onto the size it is given. */
const MAP_W = 1100;
const MAP_H = 520;

/**
 * The only demo module that reads the database. Everything it returns goes into the pure builder;
 * all the deciding is in lib/demo/select and lib/demo/script, where tests hand them fixtures.
 */
export function gatherDemoInput(claims: ClaimsState, now = Date.now()): DemoInput {
  const events = corpus();
  const stats = corpusStats(events);
  const risks = countryRisks(events);

  const markers = hotspotActivity(events).slice(0, 10).flatMap((h) => {
    const p = project(h.lon, h.lat, MAP_W, MAP_H);
    return p ? [{ id: h.id, name: h.name, x: p[0], y: p[1], heat: h.heat, count: h.count }] : [];
  });
  const board: BoardData = {
    shapes: worldShapes(MAP_W, MAP_H),
    data: risks.map((r) => ({ iso: r.iso, composite: r.composite, eventCount: r.eventCount, name: countryName(r.iso) })),
    markers,
    stats: { articles: stats.articles, countries: stats.countries, languages: stats.languages, events: stats.events },
  };

  // Oldest first. The trail is drawn from the articles that survive the junk rule, so the tour never
  // shows a dot it would refuse to use as an example; /china keeps drawing every dot.
  const prc = ladderTrailArticles();
  const eventIdOf = eventIdsByArticle(prc.map((a) => a.id));
  const nowIso = new Date(now).toISOString();
  const trail = ladderTrail(prc.filter((a) => !isJunkHeadline(a.title)), {
    since: corpusSince() ?? nowIso, until: nowIso, eventOf: eventIdOf,
  });

  const eventCandidates = events
    .filter((e) => e.articleIds.length >= 3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 12)
    .map((event) => ({ event, articles: articlesByIds(event.articleIds) }));

  return {
    events, now, lastIngest: lastIngest(), origin: demoOrigin(), claims,
    names: Object.fromEntries(COUNTRIES.map((c) => [c.iso, c.name])),
    board, risks, dyads: topDyads(events, 12), trail,
    beijingArticles: [...prc].reverse(),
    otherArticles: otherPartyLadderArticles(),
    eventIdOf: Object.fromEntries(eventIdOf),
    eventCandidates,
  };
}
