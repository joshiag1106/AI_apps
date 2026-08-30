import { NextResponse } from 'next/server';
import { getMeta } from '@/lib/db';
import { corpusStats, corpus } from '@/lib/queries';
import { startScheduler } from '@/lib/ingest/scheduler';

export const dynamic = 'force-dynamic';

/**
 * The background refresh is started here rather than from instrumentation.ts.
 *
 * Next compiles instrumentation for the edge runtime as well as node, and an `import` is
 * traced statically regardless of any `NEXT_RUNTIME` check around it — so the ingest
 * pipeline's `node:crypto` followed it into the edge bundle and broke the build. This
 * route is node-only and force-dynamic, so the scheduler stays out of that graph. Module
 * scope runs once per server process, and startScheduler is idempotent besides.
 *
 * The trigger is right too: this endpoint is polled by any open page, so the refresh loop
 * starts when someone is actually watching and not merely because a process exists.
 */
startScheduler();

/**
 * Corpus heartbeat.
 *
 * Deliberately tiny, because the client polls it: it answers "has anything changed?" and
 * nothing else. The client compares `version` with what it last saw and asks Next to
 * re-render the server components when it moves, so a page updates itself without a
 * reload and without a socket to keep alive.
 */
export async function GET() {
  const events = corpus();
  const stats = corpusStats(events);
  return NextResponse.json(
    {
      version: getMeta('last_ingest') ?? 'never',
      events: events.length,
      reports: stats.articles,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
