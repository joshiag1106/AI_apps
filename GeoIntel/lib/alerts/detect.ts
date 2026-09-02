import type { WatchItem } from '@/lib/watchlist/store';
import type { GeoEvent } from '@/lib/types';

/**
 * Which watched targets have moved up the PRC escalation ladder.
 *
 * Pure, and separated from both the database and the mail sender, because this is the
 * decision that determines whether someone's phone buzzes. It should be readable and
 * testable without a corpus, a session or a network.
 *
 * The rule is movement, not level. Beijing repeats a formula for weeks at a time, so
 * alerting whenever a rung is *present* would mail the same thing daily and train the
 * reader to ignore it. Only a rung above the highest already reported for that target
 * counts, and the mark is per reader as well as per target: two people watching one dyad
 * who signed up a week apart have seen different things.
 */

export interface Jump {
  item: WatchItem;
  /** The rung reached now. */
  rung: number;
  /** The highest rung previously reported to this reader for this target, or 0. */
  previous: number;
  /** The event that justifies the alert, so the mail can point at evidence. */
  event: GeoEvent;
}

/** Stable key for a reader's high-water mark on one target. */
export function markKey(item: Pick<WatchItem, 'kind' | 'id'>): string {
  return `${item.kind}:${item.id}`;
}

/** A dyad id is written in whichever order the reader happened to pin it from. */
function dyadParties(id: string): string[] {
  return id.split('-').filter(Boolean);
}

function concerns(item: WatchItem, e: GeoEvent): boolean {
  if (item.kind === 'country') return e.actors.includes(item.id);
  const parties = dyadParties(item.id);
  // Both parties must be present: a formula aimed at China alone is not an India-China
  // event, however much it matters to someone watching that relationship.
  return parties.length > 1 && parties.every((iso) => e.actors.includes(iso));
}

export function detectJumps(
  watching: WatchItem[],
  events: GeoEvent[],
  marks: Map<string, number>,
): Jump[] {
  const out: Jump[] = [];

  for (const item of watching) {
    const previous = marks.get(markKey(item)) ?? 0;

    // The single highest rung on this target, and the event carrying it. One entry per
    // target however many events caused it — a reader wants to know the relationship
    // moved, not to receive a list of every report that says so.
    let best: GeoEvent | null = null;
    for (const e of events) {
      if (e.ladderRung == null || !concerns(item, e)) continue;
      if (!best || e.ladderRung > (best.ladderRung ?? 0)) best = e;
    }

    if (best && (best.ladderRung ?? 0) > previous) {
      out.push({ item, rung: best.ladderRung!, previous, event: best });
    }
  }

  return out;
}
