import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-analyse-')), 'test.db');

/**
 * The framing comparison is the one feature that spends money per click. Its free allowance
 * is metered by a device cookie, and middleware hands a client that discards cookies a fresh
 * device — and a fresh five — on every request, so for an anonymous reader the allowance
 * bounds nothing. An account is the smallest thing that makes it mean something, so the
 * paid call waits for one. Everything deterministic on the page stays open to everyone.
 */
const jar = new Map<string, string>();

async function loadRoute() {
  vi.resetModules();
  vi.doMock('next/headers', () => ({
    cookies: async () => ({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    }),
  }));
  return import('@/app/api/analyse/route');
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

function post(body: unknown) {
  return new Request('http://localhost:3000/api/analyse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  jar.clear();
});

describe('the paid framing call', () => {
  it('asks an anonymous reader to sign in', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    const { POST } = await loadRoute();

    const res = await POST(post({ id: 'no-such-event' }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ unavailable: 'signin' });
  });

  it('lets a signed-in reader through to the event lookup', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    const { POST } = await loadRoute();
    await signIn('reader@example.test');

    // An unknown event is the cheapest way past the gate: a 404 proves the request reached
    // the lookup, and it can never reach the model.
    const res = await POST(post({ id: 'no-such-event' }));

    expect(res.status).toBe(404);
  });
});

describe('the framing panel', () => {
  const props = { eventId: 'ev1', initial: null };

  it('offers an anonymous reader a way to sign in, and no button that spends', async () => {
    const { FramingAnalysis } = await import('@/components/FramingAnalysis');
    const html = renderToStaticMarkup(createElement(FramingAnalysis, { ...props, enabled: true, signedIn: false }));

    expect(html).toContain('href="/login?next=/events/ev1"');
    expect(html).not.toContain('<button');
  });

  it('offers the button to a signed-in reader', async () => {
    const { FramingAnalysis } = await import('@/components/FramingAnalysis');
    const html = renderToStaticMarkup(createElement(FramingAnalysis, { ...props, enabled: true, signedIn: true }));

    expect(html).toContain('<button');
    expect(html).not.toContain('/login?next=');
  });

  it('explains a refused call as a sign-in prompt rather than an empty box', async () => {
    // A session can expire between the page rendering and the click.
    const { BlockedNotice } = await import('@/components/FramingAnalysis');
    const html = renderToStaticMarkup(createElement(BlockedNotice, { why: 'signin', eventId: 'ev1' }));

    expect(html).toContain('href="/login?next=/events/ev1"');
  });

  it('does not name the server’s settings when the layer is off', async () => {
    const { FramingAnalysis } = await import('@/components/FramingAnalysis');
    const html = renderToStaticMarkup(createElement(FramingAnalysis, { ...props, enabled: false, signedIn: true }));

    expect(html).toContain('Not configured');
    expect(html).not.toContain('ANTHROPIC_API_KEY');
  });
});
