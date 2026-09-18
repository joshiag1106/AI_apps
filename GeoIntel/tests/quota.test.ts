// tests/quota.test.ts
//
// The free-preview period, added 2026-09-18.
//
// Josh asked to remove the 5-analysis limit while the product has nothing to sell yet, and
// to keep the eventual subscription model in mind while doing it. That rules out deleting
// FREE_LIMIT or hacking it to a huge number: the design keeps the metering machinery intact
// and adds ONE flag, QUOTA_ENFORCED, that governs whether consume() ever blocks. Flipping it
// back to true when Stripe billing goes live is the entire re-launch step — every page that
// reads quotaState() picks the change up automatically, because they all gate on the state
// this module returns, never on a hardcoded number of their own.
//
// previewUnlimited is kept a DISTINCT flag from unlimited on purpose. unlimited means "paid
// Pro plan" everywhere it is read — the pricing page's "current"/"active" badges, the "You're
// on Pro" panel, the account page's plan label. Folding the free-preview state into that
// flag would make every one of those say "Pro" to a visitor who has never paid anything,
// which actively defeats the point of a pricing page. previewUnlimited exists so a page can
// say "nothing is capped right now" without also claiming "you are a paying customer".
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-quota-')), 'test.db');

const jar = new Map<string, string>();

async function loadQuota() {
  vi.resetModules();
  vi.doMock('next/headers', () => ({
    cookies: async () => ({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    }),
  }));
  return import('@/lib/quota');
}

let n = 0;
function device() {
  n += 1;
  jar.set('kautilya_device', `dev-${n}`);
}

afterEach(() => {
  jar.clear();
});

describe('the free-preview period (QUOTA_ENFORCED = false)', () => {
  it('never blocks a metered action, however many distinct targets are consumed', async () => {
    const { consume, FREE_LIMIT } = await loadQuota();
    device();
    // One past the real limit, to prove this is not just a generous count.
    for (let i = 0; i <= FREE_LIMIT; i++) {
      const gate = await consume('event_detail', `event-${i}`);
      expect(gate.allowed, `action ${i} should not be blocked during the free-preview period`).toBe(true);
    }
  });

  it('reports previewUnlimited, and does not report unlimited, for an ordinary visitor', async () => {
    const { quotaState } = await loadQuota();
    device();
    const state = await quotaState();
    expect(state.previewUnlimited).toBe(true);
    expect(state.unlimited, 'previewUnlimited must never imply a paid plan').toBe(false);
  });

  it('still counts usage, so the account page can show a real number', async () => {
    // Free preview means "do not block", not "stop measuring". lib/db still records every
    // consume() call, and quotaState() still reports it — only the block is disabled.
    const { consume, quotaState } = await loadQuota();
    device();
    await consume('event_detail', 'e1');
    await consume('country_deepdive', 'IND');
    const state = await quotaState();
    expect(state.used).toBe(2);
  });

  it('does not cost a second credit for reopening the same target', async () => {
    // The existing re-open rule (a stray refresh must not spend the allowance) has to keep
    // holding once enforcement is back on, so it is worth pinning here too.
    const { consume, quotaState } = await loadQuota();
    device();
    await consume('event_detail', 'e1');
    await consume('event_detail', 'e1');
    await consume('event_detail', 'e1');
    expect((await quotaState()).used).toBe(1);
  });
});
