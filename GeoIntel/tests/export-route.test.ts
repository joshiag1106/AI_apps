import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-export-')), 'test.db');

/**
 * Every page needs an account, and that gate lives in app/layout.tsx — but a route handler
 * renders no layout, so the gate never ran for /api/export. Anyone could download the whole
 * event table, or one event with its full source list, without signing in. The pages that
 * link to the export are all behind the gate, so a signed-in reader loses nothing by the
 * route asking for the same account the pages do.
 */
const jar = new Map<string, string>();

// Same cold-import allowance as analyse-route.test.ts: the route's graph is re-imported after
// vi.resetModules(), which takes several seconds when the full suite runs files in parallel.
vi.setConfig({ testTimeout: 20_000 });

async function loadRoute() {
  vi.resetModules();
  vi.doMock('next/headers', () => ({
    cookies: async () => ({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    }),
  }));
  return import('@/app/api/export/route');
}

async function signIn(email: string) {
  const { createUser } = await import('@/lib/auth');
  const { getDb } = await import('@/lib/db');
  const user = await createUser(email, 'correct horse battery staple');
  const token = `session-${user.id}`;
  getDb()
    .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, user.id, new Date(Date.now() + 86_400_000).toISOString());
  jar.set('kautilya_session', token);
}

async function usageRows() {
  const { getDb } = await import('@/lib/db');
  return (getDb().prepare("SELECT COUNT(*) AS n FROM usage WHERE action = 'export'").get() as { n: number }).n;
}

function get(query: string) {
  return new Request(`http://localhost:3000/api/export${query}`);
}

afterEach(() => {
  jar.clear();
});

describe('the data export', () => {
  it('refuses the event table to an anonymous visitor', async () => {
    const { GET } = await loadRoute();

    const res = await GET(get('?format=csv'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'signin', message: 'Sign in to export data.' });
  });

  it('refuses a single event to an anonymous visitor before looking it up', async () => {
    const { GET } = await loadRoute();

    // An unknown id would 404 if the lookup ran; a 401 proves the gate came first, so the
    // route does not even confirm to an anonymous caller which event ids exist.
    const res = await GET(get('?event=no-such-event&format=json'));

    expect(res.status).toBe(401);
  });

  it('records no usage for a refused request', async () => {
    const { GET } = await loadRoute();
    const before = await usageRows();

    await GET(get('?format=json'));

    expect(await usageRows()).toBe(before);
  });

  it('lets a signed-in reader download the table', async () => {
    const { GET } = await loadRoute();
    await signIn('reader@example.test');

    const res = await GET(get('?format=json'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="kautilya-events-/);
    expect(await res.json()).toMatchObject({ count: 0, events: [] });
  });
});
