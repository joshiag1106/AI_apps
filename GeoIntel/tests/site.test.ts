import { describe, it, expect } from 'vitest';
import { siteOrigin, siteUrl, isLoopbackOrigin } from '@/lib/site';

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

/**
 * The app is mounted under /kautilya, not at its host's root — the host also serves the
 * production company site at "/". Every link that leaves the page wants the app's own
 * base, not the bare origin, or it lands one level up from where the app actually lives.
 */
describe('the address to link into the app itself', () => {
  const DEV = 'http://localhost:3111';

  it('appends the app\'s own path to the configured origin', () => {
    expect(siteUrl(DEV, { KAUTILYA_ORIGIN: 'https://kautilya.example', NODE_ENV: 'production' }))
      .toBe('https://kautilya.example/kautilya');
    // A path on the configured value is still reduced to its origin first.
    expect(siteUrl(DEV, { KAUTILYA_ORIGIN: 'https://kautilya.example/events', NODE_ENV: 'production' }))
      .toBe('https://kautilya.example/kautilya');
  });

  it('appends it to the fallback too, outside production', () => {
    expect(siteUrl(DEV, {})).toBe(`${DEV}/kautilya`);
  });

  it('still throws in production with nothing configured', () => {
    expect(() => siteUrl(DEV, { NODE_ENV: 'production' })).toThrow(/KAUTILYA_ORIGIN/);
  });
});

/**
 * A link in an inbox is opened from somewhere else. An address that only the sending machine
 * can reach — localhost, 127.x, ::1 — is dead the moment it leaves it, and the first alert
 * ever delivered carried exactly that: valid in every way except that nobody could click it.
 */
describe('an address only this machine can reach', () => {
  it('recognises every spelling of the local machine', () => {
    for (const o of [
      'http://localhost:3111', 'http://localhost', 'https://localhost:3000',
      'http://LOCALHOST:3111', 'http://app.localhost:3000',
      'http://127.0.0.1:3000', 'http://127.1.2.3', 'http://[::1]:3000', 'http://0.0.0.0:3000',
    ]) {
      expect(isLoopbackOrigin(o), o).toBe(true);
    }
  });

  it('lets a public address through', () => {
    // The last two are the near-misses a sloppy prefix test would block: a real host that merely
    // begins with "localhost" or "127.".
    for (const o of ['https://kautilya.example', 'http://203.0.113.7:3000', 'https://localhost.example', 'https://127.example.com']) {
      expect(isLoopbackOrigin(o), o).toBe(false);
    }
  });

  it('does not throw on something that is not an address', () => {
    // It is a question ("is this local?"), asked of values that may already be wrong.
    expect(isLoopbackOrigin('not a url')).toBe(false);
  });
});
