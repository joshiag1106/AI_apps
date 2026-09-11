import { describe, it, expect } from 'vitest';
import { siteOrigin } from '@/lib/site';

/**
 * Behind a reverse proxy, Next builds a route handler's `req.url` from the host and port the
 * server itself listens on — http://localhost:3000 — never from the address the reader typed.
 * So an address that leaves the page (a redirect out of an API route, a link in alert mail)
 * cannot be derived from the request in production. It comes from KAUTILYA_ORIGIN, and a
 * missing or malformed value has to fail loudly rather than send a reader to localhost.
 */
describe('the public origin', () => {
  const DEV = 'http://localhost:3111';

  it('uses the configured address, reduced to its origin', () => {
    // A trailing slash or a path would otherwise leak into every link as "//login".
    const cases: [string, string][] = [
      ['https://kautilya.example', 'https://kautilya.example'],
      ['https://kautilya.example/', 'https://kautilya.example'],
      ['https://kautilya.example/events?lang=zh', 'https://kautilya.example'],
      ['  https://kautilya.example  ', 'https://kautilya.example'],
      ['http://203.0.113.7:3000', 'http://203.0.113.7:3000'],
    ];
    for (const [raw, want] of cases) {
      expect(siteOrigin(DEV, { KAUTILYA_ORIGIN: raw, NODE_ENV: 'production' })).toBe(want);
    }
  });

  it('keeps the request address outside production, where nothing sits in front of the server', () => {
    expect(siteOrigin(DEV, { NODE_ENV: 'development' })).toBe(DEV);
    expect(siteOrigin(DEV, {})).toBe(DEV);
    expect(siteOrigin(DEV, { KAUTILYA_ORIGIN: '   ', NODE_ENV: 'development' })).toBe(DEV);
  });

  it('refuses to guess in production', () => {
    // The fallback is the server's own listening address, which is wrong by construction
    // behind a proxy — so there is no safe default to fall back to.
    expect(() => siteOrigin(DEV, { NODE_ENV: 'production' })).toThrow(/KAUTILYA_ORIGIN/);
  });

  it('rejects a value that is not a web address', () => {
    // A bare host such as 'kautilya.example' is the likeliest slip, and does not parse. 'localhost:3111'
    // does parse — with 'localhost:' as its scheme — and its origin is the string "null",
    // so checking only that it parses would let "null/login" through.
    for (const raw of ['kautilya.example', 'localhost:3111', 'ftp://kautilya.example']) {
      expect(() => siteOrigin(DEV, { KAUTILYA_ORIGIN: raw, NODE_ENV: 'development' })).toThrow(/KAUTILYA_ORIGIN/);
    }
  });
});
