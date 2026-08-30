import { eventDetail, corpus, eventsFor } from '@/lib/queries';
import { consume } from '@/lib/quota';
import { articlesByIds } from '@/lib/db';
import type { GeoEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** RFC 4180: double the quotes, wrap anything containing a delimiter or newline. */
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  // BOM so Excel opens Chinese, Hindi and Arabic text as UTF-8 rather than mojibake.
  return '﻿' + [
    cols.join(','),
    ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')),
  ].join('\r\n');
}

function eventRow(e: GeoEvent) {
  return {
    id: e.id,
    title: e.title,
    domain: e.domain,
    actors: e.actors.join(' '),
    hotspots: e.hotspots.join(' '),
    escalation: e.escalation,
    confidence: e.confidence,
    flags: e.flags.join(' '),
    sources: e.articleIds.length,
    languages: e.languages.join(' '),
    source_countries: e.countries.join(' '),
    ladder_rung: e.ladderRung ?? '',
    ladder_zh: e.ladderZh ?? '',
    ladder_en: e.ladderEn ?? '',
    first_seen: e.firstSeen,
    last_seen: e.lastSeen,
  };
}

/**
 * Data export. Two scopes:
 *   ?event=<id>   one event with its full source list and verification signals
 *   (filters)     the filtered event table — same filters the /events page accepts
 * Formats: csv (default) or json.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv';
  const eventId = url.searchParams.get('event');

  const target = eventId ? `event:${eventId}` : `query:${url.search || 'all'}`;
  const gate = await consume('export', target);
  if (!gate.allowed) {
    return Response.json(
      { error: 'quota_exceeded', message: 'Free export allowance used. See /pricing.' },
      { status: 402 },
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  let filename: string;
  let payload: string;
  let contentType: string;

  if (eventId) {
    const detail = eventDetail(eventId);
    if (!detail) return Response.json({ error: 'unknown event' }, { status: 404 });
    filename = `kautilya-event-${eventId}-${stamp}.${format}`;

    if (format === 'json') {
      contentType = 'application/json; charset=utf-8';
      payload = JSON.stringify({
        exported_at: new Date().toISOString(),
        disclaimer: 'Confidence scores measure corroboration and provenance, not truth.',
        event: detail.event,
        articles: detail.articles,
      }, null, 2);
    } else {
      contentType = 'text/csv; charset=utf-8';
      payload = toCsv(detail.articles.map((a) => ({
        event_id: detail.event.id,
        event_title: detail.event.title,
        confidence: detail.event.confidence,
        outlet: a.outlet,
        source_country: a.sourceCountry === 'ZZZ' ? '' : a.sourceCountry,
        ownership: a.ownership,
        tier: a.tier,
        primary_source: a.isPrimary ? 'yes' : 'no',
        language: a.language,
        published_at: a.publishedAt,
        headline: a.title,
        glossed_terms: a.glossed.join(' | '),
        ladder_zh: a.ladderZh ?? '',
        url: a.url,
      })));
    }
  } else {
    const events = eventsFor({
      actor: url.searchParams.get('actor') ?? undefined,
      domain: url.searchParams.get('domain') ?? undefined,
      language: url.searchParams.get('lang') ?? undefined,
      query: url.searchParams.get('q') ?? undefined,
      minConfidence: url.searchParams.get('min') ? Number(url.searchParams.get('min')) : undefined,
      limit: 5000,
    }, corpus());

    filename = `kautilya-events-${stamp}.${format}`;
    if (format === 'json') {
      contentType = 'application/json; charset=utf-8';
      payload = JSON.stringify({
        exported_at: new Date().toISOString(),
        count: events.length,
        disclaimer: 'Confidence scores measure corroboration and provenance, not truth.',
        events,
      }, null, 2);
    } else {
      contentType = 'text/csv; charset=utf-8';
      payload = toCsv(events.map(eventRow));
    }
  }

  return new Response(payload, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
