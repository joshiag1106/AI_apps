import { describe, it, expect } from 'vitest';
import { schedulerConfig, DEFAULT_INTERVAL_MINUTES, MIN_INTERVAL_MINUTES } from '@/lib/ingest/scheduler';

/**
 * Every cycle of this scheduler fetches 73 real publisher and aggregator feeds. Getting
 * the configuration wrong is not a local problem — it is other people's servers, and a
 * rate-limit or a block would take the corpus down with it. So the defaults are cautious
 * and the floor is not overridable.
 */
describe('schedulerConfig', () => {
  it('is off unless explicitly switched on', () => {
    // Cloning the repo and running it must not start polling 73 sites.
    expect(schedulerConfig({}).enabled).toBe(false);
    expect(schedulerConfig({ KAUTILYA_AUTO_INGEST: 'false' }).enabled).toBe(false);
    expect(schedulerConfig({ KAUTILYA_AUTO_INGEST: '0' }).enabled).toBe(false);
  });

  it('switches on for the obvious affirmative values', () => {
    expect(schedulerConfig({ KAUTILYA_AUTO_INGEST: '1' }).enabled).toBe(true);
    expect(schedulerConfig({ KAUTILYA_AUTO_INGEST: 'true' }).enabled).toBe(true);
    expect(schedulerConfig({ KAUTILYA_AUTO_INGEST: 'yes' }).enabled).toBe(true);
  });

  it('defaults to a cadence the corpus actually moves at', () => {
    // The median article is days old; refreshing faster buys nothing and costs politeness.
    expect(schedulerConfig({ KAUTILYA_AUTO_INGEST: '1' }).minutes).toBe(DEFAULT_INTERVAL_MINUTES);
    expect(DEFAULT_INTERVAL_MINUTES).toBeGreaterThanOrEqual(MIN_INTERVAL_MINUTES);
  });

  it('accepts a longer interval as given', () => {
    expect(schedulerConfig({ KAUTILYA_AUTO_INGEST: '1', KAUTILYA_INGEST_MINUTES: '60' }).minutes).toBe(60);
  });

  it('refuses to go below the politeness floor, and says why', () => {
    const c = schedulerConfig({ KAUTILYA_AUTO_INGEST: '1', KAUTILYA_INGEST_MINUTES: '1' });
    expect(c.minutes).toBe(MIN_INTERVAL_MINUTES);
    expect(c.notice).toMatch(/floor|minimum/i);
  });

  it('falls back to the default on an unusable interval rather than to zero', () => {
    // A zero or NaN interval would become a tight loop against live feeds.
    for (const v of ['0', '-5', 'abc', '']) {
      expect(schedulerConfig({ KAUTILYA_AUTO_INGEST: '1', KAUTILYA_INGEST_MINUTES: v }).minutes)
        .toBe(DEFAULT_INTERVAL_MINUTES);
    }
  });

  it('caps an absurdly long interval rather than silently never running', () => {
    expect(schedulerConfig({ KAUTILYA_AUTO_INGEST: '1', KAUTILYA_INGEST_MINUTES: '99999' }).minutes)
      .toBeLessThanOrEqual(24 * 60);
  });
});
