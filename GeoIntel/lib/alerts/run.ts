import { detectJumps } from '@/lib/alerts/detect';
import { renderDigest, sendDigest, type Digest, type SendResult } from '@/lib/alerts/send';
import { alertRecipients, marksFor, recordMark } from '@/lib/alerts/state';
import { listWatch } from '@/lib/watchlist/store';
import type { GeoEvent } from '@/lib/types';

/**
 * One pass of ladder alerting, run after the corpus refreshes.
 *
 * Two gates stand in front of a real inbox and both are enforced in `alertRecipients`:
 * the paid plan, because this is a paid feature, and the reader's own preference, because
 * signing up for an account is not consent to be emailed.
 *
 * A failed delivery deliberately does not advance the high-water mark. Recording an alert
 * that never arrived would leave someone permanently unaware of a rung they were meant to
 * hear about — far worse than the duplicate a retry might produce.
 */

export interface RunOptions {
  send?: (to: string, digest: Digest) => Promise<SendResult>;
  origin?: string;
  log?: (s: string) => void;
}

export interface RunReport {
  considered: number;
  mailed: number;
  /** Genuine delivery failures, which will be retried on the next run. */
  failed: number;
  /** Digests not sent because no mail key is configured. Not a fault. */
  skipped: number;
  jumps: number;
}

export async function runAlerts(events: GeoEvent[], opts: RunOptions = {}): Promise<RunReport> {
  const send = opts.send ?? sendDigest;
  const origin = opts.origin ?? process.env.KAUTILYA_ORIGIN ?? 'http://localhost:3111';
  const log = opts.log ?? (() => {});

  const recipients = alertRecipients();
  const report: RunReport = { considered: recipients.length, mailed: 0, failed: 0, skipped: 0, jumps: 0 };

  for (const person of recipients) {
    const watching = listWatch(person.id);
    if (!watching.length) continue;

    const jumps = detectJumps(watching, events, marksFor(person.id));
    if (!jumps.length) continue;
    report.jumps += jumps.length;

    const result = await send(person.email, renderDigest(jumps, origin));
    if (result.delivered) {
      report.mailed += 1;
      for (const j of jumps) recordMark(person.id, j.item.kind, j.item.id, j.rung);
    } else if (result.reason === 'no_key') {
      // Not a fault — the feature simply is not configured. Counting it as a failure would
      // make the ingest report claim something went wrong when nothing did.
      report.skipped += 1;
      log(`[alerts] would have mailed ${person.email} about ${jumps.length} jump(s); no RESEND_API_KEY set`);
    } else {
      report.failed += 1;
      log(`[alerts] delivery to ${person.email} failed: ${result.reason}`);
    }
  }

  return report;
}
