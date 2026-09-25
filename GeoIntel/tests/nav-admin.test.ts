import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import 'react/jsx-dev-runtime';

/**
 * The "Admin" link in the header must never appear to a visitor who is not the operator —
 * and in particular must not appear to a signed-out visitor just because ADMIN_EMAIL
 * happens to be unset, which is the default state. `undefined === undefined` is true, so
 * a naive `user?.email === process.env.ADMIN_EMAIL` shows the link to everyone until an
 * admin email is configured — caught by hand in a browser before this test existed.
 */
beforeAll(() => {
  process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-nav-')), 'test.db');
});

const QUOTA = { unlimited: false, previewUnlimited: true, remaining: 5, limit: 5 };

async function renderNav(user: { id: string; email: string; plan: 'free' | 'pro'; createdAt: string } | null) {
  vi.resetModules();
  vi.doMock('@/lib/auth', () => ({ currentUser: async () => user }));
  vi.doMock('@/lib/quota', () => ({ quotaState: async () => QUOTA }));
  // LivePulse is a client component that calls useRouter(), which throws outside a
  // mounted Next app router — exactly the harness renderToStaticMarkup provides here.
  // Its own behaviour is unrelated to the thing under test.
  vi.doMock('@/components/LivePulse', () => ({ LivePulse: () => null }));
  vi.doMock('@/components/CountrySearch', () => ({ CountrySearch: () => null }));
  const { Nav } = await import('@/components/Nav');
  return renderToStaticMarkup(await Nav());
}

const ADMIN = { id: 'a1', email: 'admin@example.com', plan: 'free' as const, createdAt: '' };
const OTHER = { id: 'u1', email: 'someone@example.com', plan: 'free' as const, createdAt: '' };

describe('the Admin nav link', () => {
  it('is hidden from a signed-out visitor when ADMIN_EMAIL is unset (the default)', async () => {
    delete process.env.ADMIN_EMAIL;
    const html = await renderNav(null);
    expect(html).not.toContain('>Admin<');
  });

  it('is hidden from a signed-out visitor even once ADMIN_EMAIL is set', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    const html = await renderNav(null);
    expect(html).not.toContain('>Admin<');
  });

  it('is hidden from a signed-in account that is not the admin', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    const html = await renderNav(OTHER);
    expect(html).not.toContain('>Admin<');
  });

  it('shows for the account whose email matches ADMIN_EMAIL', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    const html = await renderNav(ADMIN);
    expect(html).toContain('>Admin<');
  });
});
