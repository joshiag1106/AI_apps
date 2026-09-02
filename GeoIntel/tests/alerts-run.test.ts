import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GeoEvent } from '@/lib/types';

/**
 * Who actually gets mail.
 *
 * Two gates stand in front of a real inbox: the plan, because alerts are a paid feature,
 * and the reader's own preference, because nobody should be enrolled in email by having
 * signed up for an account. Both are tested here rather than trusted, since the cost of
 * getting them wrong is mail somebody did not ask for.
 */
type Mod = {
  state: typeof import('@/lib/alerts/state');
  run: typeof import('@/lib/alerts/run');
  watch: typeof import('@/lib/watchlist/store');
  db: typeof import('@/lib/db');
};
let m: Mod;

let seq = 0;
function ev(rung: number, actors: string[]): GeoEvent {
  seq += 1;
  const iso = new Date().toISOString();
  return {
    id: `x${seq}`, title: `Event ${seq}`, summary: '', firstSeen: iso, lastSeen: iso,
    actors, hotspots: [], domain: 'Diplomatic', escalation: 0, confidence: 40,
    signals: [], flags: [], articleIds: [`a${seq}`], languages: ['zh'], countries: ['CHN'],
    imageUrl: null, videoId: null, ladderRung: rung, ladderZh: '强烈抗议', ladderEn: 'strong protest',
  };
}

/** A sender that records rather than delivers. */
function recorder() {
  const sent: { to: string; subject: string }[] = [];
  return {
    sent,
    send: async (to: string, d: { subject: string }) => { sent.push({ to, subject: d.subject }); return { delivered: true }; },
  };
}

function user(id: string, plan: 'free' | 'pro', alerts: boolean) {
  m.db.getDb().prepare('INSERT OR REPLACE INTO users (id, email, password_hash, plan, created_at) VALUES (?,?,?,?,?)')
    .run(id, `${id}@test.invalid`, 'x', plan, new Date().toISOString());
  m.state.setAlertsEnabled(id, alerts);
}

beforeAll(async () => {
  process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-alerts-')), 'test.db');
  m = {
    state: await import('@/lib/alerts/state'),
    run: await import('@/lib/alerts/run'),
    watch: await import('@/lib/watchlist/store'),
    db: await import('@/lib/db'),
  };
});

beforeEach(() => {
  const db = m.db.getDb();
  for (const t of ['users', 'watchlist', 'alert_marks']) {
    try { db.exec(`DELETE FROM ${t}`); } catch { /* table may not exist yet */ }
  }
});

describe('who gets an alert', () => {
  it('mails a Pro reader who opted in and has a jump', async () => {
    user('pro1', 'pro', true);
    m.watch.addWatch('pro1', { kind: 'country', id: 'CHN', label: 'China' });
    const r = recorder();
    await m.run.runAlerts([ev(8, ['CHN'])], { send: r.send, origin: 'https://k.test' });
    expect(r.sent.map((s) => s.to)).toEqual(['pro1@test.invalid']);
  });

  it('does not mail a free-plan reader, even opted in with a jump', async () => {
    user('free1', 'free', true);
    m.watch.addWatch('free1', { kind: 'country', id: 'CHN', label: 'China' });
    const r = recorder();
    await m.run.runAlerts([ev(8, ['CHN'])], { send: r.send, origin: 'https://k.test' });
    expect(r.sent).toEqual([]);
  });

  it('does not mail a Pro reader who has not opted in', async () => {
    // Signing up for an account is not consent to be emailed.
    user('pro2', 'pro', false);
    m.watch.addWatch('pro2', { kind: 'country', id: 'CHN', label: 'China' });
    const r = recorder();
    await m.run.runAlerts([ev(8, ['CHN'])], { send: r.send, origin: 'https://k.test' });
    expect(r.sent).toEqual([]);
  });

  it('sends one mail covering several jumps, not one per jump', async () => {
    user('pro3', 'pro', true);
    m.watch.addWatch('pro3', { kind: 'country', id: 'CHN', label: 'China' });
    m.watch.addWatch('pro3', { kind: 'country', id: 'IND', label: 'India' });
    const r = recorder();
    await m.run.runAlerts([ev(8, ['CHN']), ev(12, ['IND'])], { send: r.send, origin: 'https://k.test' });
    expect(r.sent).toHaveLength(1);
  });
});

describe('not repeating itself', () => {
  it('stays silent on a second run with nothing new', async () => {
    user('pro4', 'pro', true);
    m.watch.addWatch('pro4', { kind: 'country', id: 'CHN', label: 'China' });
    const events = [ev(8, ['CHN'])];
    const r = recorder();
    await m.run.runAlerts(events, { send: r.send, origin: 'https://k.test' });
    await m.run.runAlerts(events, { send: r.send, origin: 'https://k.test' });
    expect(r.sent).toHaveLength(1);
  });

  it('does not record the mark when delivery failed, so it retries', async () => {
    // Recording an alert that never arrived would leave the reader permanently unaware of
    // a rung they were supposed to hear about.
    user('pro5', 'pro', true);
    m.watch.addWatch('pro5', { kind: 'country', id: 'CHN', label: 'China' });
    const events = [ev(8, ['CHN'])];
    const failing = async () => ({ delivered: false, reason: 'nope' });
    await m.run.runAlerts(events, { send: failing, origin: 'https://k.test' });

    const r = recorder();
    await m.run.runAlerts(events, { send: r.send, origin: 'https://k.test' });
    expect(r.sent).toHaveLength(1);
  });

  it('keeps one reader’s marks out of another’s', async () => {
    user('a1', 'pro', true);
    user('b1', 'pro', true);
    for (const u of ['a1', 'b1']) m.watch.addWatch(u, { kind: 'country', id: 'CHN', label: 'China' });
    const events = [ev(8, ['CHN'])];
    const r = recorder();
    await m.run.runAlerts(events, { send: r.send, origin: 'https://k.test' });
    expect(r.sent.map((s) => s.to).sort()).toEqual(['a1@test.invalid', 'b1@test.invalid']);
  });
});

describe('reporting honestly', () => {
  it('does not call an unconfigured mailer a failure', async () => {
    // The ingest prints this report. Counting "no key set" as a delivery failure would
    // have it claim something broke when nothing did.
    user('pro6', 'pro', true);
    m.watch.addWatch('pro6', { kind: 'country', id: 'CHN', label: 'China' });
    const noKey = async () => ({ delivered: false, reason: 'no_key' });
    const r = await m.run.runAlerts([ev(8, ['CHN'])], { send: noKey, origin: 'https://k.test' });
    expect(r.skipped).toBe(1);
    expect(r.failed).toBe(0);
  });

  it('still counts a real refusal as a failure', async () => {
    user('pro7', 'pro', true);
    m.watch.addWatch('pro7', { kind: 'country', id: 'CHN', label: 'China' });
    const bad = async () => ({ delivered: false, reason: '422 bad address' });
    const r = await m.run.runAlerts([ev(8, ['CHN'])], { send: bad, origin: 'https://k.test' });
    expect(r.failed).toBe(1);
    expect(r.skipped).toBe(0);
  });
});
