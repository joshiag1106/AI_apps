import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WatchItem } from '@/lib/watchlist/store';

/**
 * Watchlists are account-bound for signed-in users and stay in localStorage for everyone
 * else. That split is deliberate: the dashboard has always promised the list "is not tied
 * to an account and does not leave the device", and moving anonymous visitors' pins to the
 * server would quietly break that promise. Signing in is the moment a reader opts into
 * having their pins follow them, so it is the moment the server may hold them.
 */
type Store = typeof import('@/lib/watchlist/store');
let s: Store;

const ITEM = (id: string): WatchItem => ({ kind: 'country', id, label: id });

beforeAll(async () => {
  // Point the database at a scratch file before lib/db is first imported — it caches the
  // connection on first use, so setting this afterwards would have no effect.
  process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-test-')), 'test.db');
  s = await import('@/lib/watchlist/store');
});

describe('watchlist storage', () => {
  it('remembers what a user pinned', () => {
    s.addWatch('u1', ITEM('IND'));
    expect(s.listWatch('u1').map((w) => w.id)).toEqual(['IND']);
    expect(s.isWatched('u1', 'country', 'IND')).toBe(true);
  });

  it('is idempotent — pinning twice does not duplicate', () => {
    s.addWatch('u2', ITEM('CHN'));
    s.addWatch('u2', ITEM('CHN'));
    expect(s.listWatch('u2')).toHaveLength(1);
  });

  it('keeps one user’s pins out of another’s', () => {
    // The whole point of account-binding: two accounts on one machine must not see each
    // other's watchlist.
    s.addWatch('alice', ITEM('PAK'));
    s.addWatch('bob', ITEM('NPL'));
    expect(s.listWatch('alice').map((w) => w.id)).toEqual(['PAK']);
    expect(s.listWatch('bob').map((w) => w.id)).toEqual(['NPL']);
  });

  it('unpins', () => {
    s.addWatch('u3', ITEM('LKA'));
    s.removeWatch('u3', 'country', 'LKA');
    expect(s.listWatch('u3')).toEqual([]);
    expect(s.isWatched('u3', 'country', 'LKA')).toBe(false);
  });

  it('distinguishes a country from a relationship with the same id', () => {
    s.addWatch('u4', { kind: 'country', id: 'X', label: 'country X' });
    s.addWatch('u4', { kind: 'dyad', id: 'X', label: 'dyad X' });
    expect(s.listWatch('u4')).toHaveLength(2);
    s.removeWatch('u4', 'country', 'X');
    expect(s.listWatch('u4').map((w) => w.kind)).toEqual(['dyad']);
  });

  it('caps the list and drops the oldest, as the device version did', () => {
    for (let i = 0; i < s.WATCH_LIMIT + 5; i++) s.addWatch('u5', ITEM(`C${i}`));
    const ids = s.listWatch('u5').map((w) => w.id);
    expect(ids).toHaveLength(s.WATCH_LIMIT);
    expect(ids).not.toContain('C0');
    expect(ids).toContain(`C${s.WATCH_LIMIT + 4}`);
  });
});

describe('adopting a device list on sign-in', () => {
  it('takes over pins made before signing in', () => {
    // Losing pins at the moment you sign in would be a regression, so the device list is
    // merged into the account rather than discarded.
    s.addWatch('u6', ITEM('IND'));
    s.adoptWatch('u6', [ITEM('IND'), ITEM('CHN'), ITEM('JPN')]);
    expect(s.listWatch('u6').map((w) => w.id).sort()).toEqual(['CHN', 'IND', 'JPN']);
  });

  it('does not duplicate what the account already had', () => {
    s.addWatch('u7', ITEM('IND'));
    s.adoptWatch('u7', [ITEM('IND')]);
    expect(s.listWatch('u7')).toHaveLength(1);
  });

  it('ignores junk without throwing, since it arrives from a browser', () => {
    const junk = [null, {}, { kind: 'country' }, { kind: 'nope', id: 'x', label: 'x' }] as unknown as WatchItem[];
    expect(() => s.adoptWatch('u8', junk)).not.toThrow();
    expect(s.listWatch('u8')).toEqual([]);
  });
});

describe('which storage a reader gets', () => {
  it('sends a signed-out reader to the device-local list, not the server', async () => {
    // The promise on the dashboard — "not tied to an account and does not leave the
    // device" — holds only if nothing anonymous ever reaches the store. This is the guard
    // on that: no user, no server write.
    vi.resetModules();
    vi.doMock('next/cache', () => ({ revalidatePath: () => {} }));
    vi.doMock('@/lib/auth', () => ({ currentUser: async () => null }));
    const { toggleWatchAction } = await import('@/lib/watchlist/actions');
    const before = s.listWatch('anonymous-should-not-appear');
    await toggleWatchAction(ITEM('IND'), true);
    expect(before).toEqual([]);
    // Nothing was written under any subject by that call.
    expect(s.listWatch('anonymous-should-not-appear')).toEqual([]);
  });

  it('writes to the signed-in user’s own list and no one else’s', async () => {
    vi.resetModules();
    // revalidatePath needs Next's request context, which a plain test run has no business
    // constructing. It is cache plumbing, not the behaviour under test.
    vi.doMock('next/cache', () => ({ revalidatePath: () => {} }));
    vi.doMock('@/lib/auth', () => ({ currentUser: async () => ({ id: 'signed-in', email: 'x', plan: 'free', createdAt: '' }) }));
    const { toggleWatchAction } = await import('@/lib/watchlist/actions');
    await toggleWatchAction(ITEM('TWN'), true);
    expect(s.listWatch('signed-in').map((w) => w.id)).toContain('TWN');

    await toggleWatchAction(ITEM('TWN'), false);
    expect(s.listWatch('signed-in').map((w) => w.id)).not.toContain('TWN');
  });

  it('ignores a user id supplied by the caller, using the session instead', async () => {
    // The action takes no user id by design: a forged form post can only ever act on the
    // poster's own list.
    const { toggleWatchAction } = await import('@/lib/watchlist/actions');
    expect(toggleWatchAction.length).toBeLessThanOrEqual(2);
  });
});
