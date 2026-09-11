import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
// The page tests below flip NODE_ENV to 'production'. React picks which build of its JSX
// runtime to load from NODE_ENV the first time it is required, and the production build of
// the dev runtime — which vitest compiles JSX against — exports no `jsxDEV`. Loading it
// here, under 'test', leaves the working copy in Node's module cache for every test.
import 'react/jsx-dev-runtime';

// Point the database at a scratch file before lib/db is first imported; it caches the
// connection on first use.
process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-checkout-')), 'test.db');

/** What Next hands a route handler behind a reverse proxy: the server's own address. */
const INTERNAL = 'http://localhost:3000';
/** What the reader actually typed. */
const PUBLIC = 'https://kautilya.example';

/**
 * The session cookie the routes will see. `cookies()` needs a live Next request context,
 * which a test has no business constructing; everything behind it — users, sessions and
 * the plan column — is the real code against a real database.
 */
const jar = new Map<string, string>();

async function fresh() {
  vi.resetModules();
  vi.doMock('next/headers', () => ({
    cookies: async () => ({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    }),
  }));
}

async function loadRoutes() {
  await fresh();
  return {
    checkout: await import('@/app/api/checkout/route'),
    confirm: await import('@/app/api/checkout/confirm/route'),
  };
}

/** A real account with a real session row, signed in through the cookie jar. */
async function signIn(email: string) {
  const { createUser } = await import('@/lib/auth');
  const { getDb } = await import('@/lib/db');
  const user = await createUser(email, 'correct horse battery staple');
  const token = `session-${user.id}`;
  getDb()
    .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, user.id, new Date(Date.now() + 86_400_000).toISOString());
  jar.set('kautilya_session', token);
  return user;
}

async function planOf(userId: string) {
  const { getDb } = await import('@/lib/db');
  return (getDb().prepare('SELECT plan FROM users WHERE id = ?').get(userId) as { plan: string }).plan;
}

/** No billing configured, whatever the shell running the tests happens to export. */
function noStripe() {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('STRIPE_PRICE_ID', '');
}

async function renderPricing() {
  const { default: Page } = await import('@/app/pricing/page');
  return renderToStaticMarkup(await Page());
}

async function renderAccount() {
  const { default: Page } = await import('@/app/account/page');
  return renderToStaticMarkup(await Page());
}

afterEach(() => {
  vi.unstubAllEnvs();
  jar.clear();
});

describe('which checkout runs', () => {
  it('is decided by the keys and the environment together', async () => {
    const { billing } = await import('@/lib/billing');
    const cases: [Record<string, string>, string][] = [
      [{ STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_PRICE_ID: 'price_x', NODE_ENV: 'production' }, 'stripe'],
      [{ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_ID: 'price_x', NODE_ENV: 'development' }, 'stripe'],
      [{ NODE_ENV: 'production' }, 'closed'],
      // A key without a price cannot create a session. The pricing page used to read the key
      // alone and advertise live checkout while the route fell through to test mode.
      [{ STRIPE_SECRET_KEY: 'sk_live_x', NODE_ENV: 'production' }, 'closed'],
      [{ NODE_ENV: 'development' }, 'mock'],
      [{}, 'mock'],
    ];
    for (const [env, want] of cases) expect(billing(env).mode).toBe(want);
  });
});

describe('checkout with no billing configured', () => {
  it('does not hand out Pro in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('KAUTILYA_ORIGIN', PUBLIC);
    noStripe();
    const { checkout } = await loadRoutes();
    const user = await signIn('closed@example.test');

    const res = await checkout.POST(new Request(`${INTERNAL}/api/checkout`, { method: 'POST' }));

    expect(await planOf(user.id)).toBe('free');
    expect(res.headers.get('location')).toBe(`${PUBLIC}/pricing?error=billing_closed`);
  });

  it('still activates Pro in test mode on a development server', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('KAUTILYA_ORIGIN', '');
    noStripe();
    const { checkout } = await loadRoutes();
    const user = await signIn('mock@example.test');

    const res = await checkout.POST(new Request('http://localhost:3111/api/checkout', { method: 'POST' }));

    expect(await planOf(user.id)).toBe('pro');
    expect(res.headers.get('location')).toBe('http://localhost:3111/account');
  });
});

describe('what the plan pages offer', () => {
  it('offers no way to activate Pro in production without billing, and names no settings', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('KAUTILYA_ORIGIN', PUBLIC);
    noStripe();
    await fresh();

    const signedOut = await renderPricing();
    const user = await signIn('pages@example.test');
    const pricing = await renderPricing();
    const account = await renderAccount();

    // Each page did render — a crash or an empty page must not pass as "offers nothing".
    expect(signedOut).toContain('Desk — Pro');
    expect(pricing).toContain('Desk — Pro');
    expect(account).toContain(user.email);

    for (const html of [signedOut, pricing, account]) {
      expect(html).not.toContain('action="/api/checkout"');
      expect(html).not.toMatch(/test mode/i);
      expect(html).not.toContain('STRIPE_');
      expect(html).not.toContain('Create an account to subscribe');
    }
  });

  it('never offers a local "cancel" once billing is live', async () => {
    // Dropping the plan here would leave Stripe charging the card for a subscription the
    // reader believes they cancelled.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('KAUTILYA_ORIGIN', PUBLIC);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_x');
    vi.stubEnv('STRIPE_PRICE_ID', 'price_x');
    await fresh();
    const user = await signIn('subscriber@example.test');
    const { setPlan } = await import('@/lib/auth');
    setPlan(user.id, 'pro');

    const account = await renderAccount();

    expect(account).toContain(user.email);
    expect(account).not.toMatch(/test mode/i);
  });

  it('keeps test-mode activation on a development server', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    noStripe();
    await fresh();
    await signIn('dev-pages@example.test');

    expect(await renderPricing()).toContain('action="/api/checkout"');
    expect(await renderAccount()).toContain('action="/api/checkout"');
  });
});

describe('checkout redirects', () => {
  it('sends a signed-out reader to sign in on the public address, not the server’s own', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('KAUTILYA_ORIGIN', PUBLIC);
    const { checkout } = await loadRoutes();

    const res = await checkout.POST(new Request(`${INTERNAL}/api/checkout`, { method: 'POST' }));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${PUBLIC}/login?next=/pricing`);
  });

  it('brings a reader back from Stripe to the public address', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('KAUTILYA_ORIGIN', PUBLIC);
    const { confirm } = await loadRoutes();

    const res = await confirm.GET(new Request(`${INTERNAL}/api/checkout/confirm?session_id=cs_test_1`));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${PUBLIC}/pricing`);
  });
});
