import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * "How many people visited Kautilya" now that every visit requires an account: distinct
 * accounts vs. total session starts are different numbers once anyone comes back twice.
 */
type Store = typeof import('@/lib/visits/store');
let s: Store;

beforeAll(async () => {
  process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-visits-')), 'test.db');
  s = await import('@/lib/visits/store');
  // visitStats() counts rows in `users`, so this file needs at least one real account —
  // the users table is created by lib/db's own migrate(), reachable through getDb().
  const { getDb } = await import('@/lib/db');
  getDb().prepare(
    "INSERT INTO users (id, email, password_hash, plan, created_at) VALUES ('u1','a@x.example','h','free',?)",
  ).run(new Date().toISOString());
  getDb().prepare(
    "INSERT INTO users (id, email, password_hash, plan, created_at) VALUES ('u2','b@x.example','h','free',?)",
  ).run(new Date().toISOString());
});

describe('visit stats', () => {
  it('counts one visit per recorded session start', () => {
    s.recordVisit('u1');
    s.recordVisit('u1');
    s.recordVisit('u2');
    const stats = s.visitStats();
    expect(stats.totalVisits).toBe(3);
  });

  it('counts distinct accounts separately from total visits', () => {
    const stats = s.visitStats();
    expect(stats.totalUsers).toBe(2);
    // Three visits recorded above across two accounts — visits, not accounts, are what
    // moves when the same person returns.
    expect(stats.totalVisits).toBeGreaterThan(stats.totalUsers);
  });

  it('counts a fresh visit within the last-30-days window', () => {
    const before = s.visitStats().last30Days;
    s.recordVisit('u1');
    expect(s.visitStats().last30Days).toBe(before + 1);
  });
});
