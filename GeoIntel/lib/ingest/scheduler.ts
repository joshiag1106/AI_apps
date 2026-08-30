import { runIngest } from '@/lib/ingest/pipeline';

/**
 * Background corpus refresh.
 *
 * Every cycle fetches 73 real publisher and aggregator feeds, so the settings here are
 * about other people's servers rather than this one's convenience. Three deliberate
 * choices follow from that: it is off unless switched on, the interval cannot be set
 * below a floor, and an unusable value falls back to the default instead of to zero —
 * a mistyped interval should never become a tight loop against live feeds.
 */

/** The corpus does not move faster than this; the median article is already days old. */
export const DEFAULT_INTERVAL_MINUTES = 30;
/** Not overridable. Below this the ingest is impolite regardless of intent. */
export const MIN_INTERVAL_MINUTES = 15;
const MAX_INTERVAL_MINUTES = 24 * 60;

const AFFIRMATIVE = new Set(['1', 'true', 'yes', 'on']);

export interface SchedulerConfig {
  enabled: boolean;
  minutes: number;
  /** Set when a requested value was overridden, so the log can explain itself. */
  notice: string | null;
}

export function schedulerConfig(env: Record<string, string | undefined>): SchedulerConfig {
  const enabled = AFFIRMATIVE.has((env.KAUTILYA_AUTO_INGEST ?? '').trim().toLowerCase());

  const raw = (env.KAUTILYA_INGEST_MINUTES ?? '').trim();
  let minutes = DEFAULT_INTERVAL_MINUTES;
  let notice: string | null = null;

  if (raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      notice = `KAUTILYA_INGEST_MINUTES="${raw}" is not a usable interval; using ${DEFAULT_INTERVAL_MINUTES} minutes.`;
    } else if (n < MIN_INTERVAL_MINUTES) {
      minutes = MIN_INTERVAL_MINUTES;
      notice = `Requested ${n} minutes is below the ${MIN_INTERVAL_MINUTES}-minute floor; 73 live feeds are fetched each cycle. Using ${MIN_INTERVAL_MINUTES}.`;
    } else if (n > MAX_INTERVAL_MINUTES) {
      minutes = MAX_INTERVAL_MINUTES;
      notice = `Requested ${n} minutes exceeds a day; using ${MAX_INTERVAL_MINUTES}.`;
    } else {
      minutes = Math.round(n);
    }
  }

  return { enabled, minutes, notice };
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Start the refresh loop. Idempotent — a dev server re-evaluating this module must not
 * end up with two timers fetching the same 73 feeds.
 */
export function startScheduler(
  env: Record<string, string | undefined> = process.env,
  log: (s: string) => void = console.log,
): SchedulerConfig {
  const config = schedulerConfig(env);
  if (config.notice) log(`[ingest] ${config.notice}`);
  if (!config.enabled) {
    log('[ingest] auto-refresh off. Set KAUTILYA_AUTO_INGEST=1 to enable, or refresh from the UI.');
    return config;
  }
  if (timer) return config;

  log(`[ingest] auto-refresh every ${config.minutes} minutes.`);
  timer = setInterval(() => {
    // Overlap guard: an ingest that runs long must not have a second one started on top
    // of it, which would double the load on every feed.
    if (running) return log('[ingest] previous refresh still running; skipping this cycle.');
    running = true;
    runIngest()
      .then((r) => log(`[ingest] refreshed: ${r.stored} stored, ${r.events} events.`))
      .catch((e) => log(`[ingest] refresh failed: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => { running = false; });
  }, config.minutes * 60_000);
  // Do not hold the process open on this timer alone.
  timer.unref?.();

  return config;
}
