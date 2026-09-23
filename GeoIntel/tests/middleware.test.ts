// tests/middleware.test.ts
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, config } from '../middleware';

/**
 * NextResponse.next({ request: { headers } }) does not put an overridden request header
 * under its own name on the returned response — it encodes it as
 * `x-middleware-request-<name>`, alongside `x-middleware-override-headers` listing which
 * names were touched. That is Next's own internal convention for "forward this to the
 * page render", confirmed by inspecting a real response rather than assumed; the actual
 * downstream Server Component sees the plain `x-pathname` header, but a test asserting on
 * the response object directly has to read the same encoding Next itself writes.
 */
function forwardedHeader(res: Response, name: string) {
  return res.headers.get(`x-middleware-request-${name}`);
}

function req(path: string, cookie?: string) {
  return new NextRequest(`https://x${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe('the pathname header', () => {
  // Added 2026-09-18 so app/layout.tsx can tell whether it is rendering the splash (app/page.tsx)
  // without a Server Component needing its own way to read the URL — Next does not give the
  // root layout the current path for free. Piggybacking on this file rather than adding a
  // second middleware, because Next runs at most one and a second would silently replace it.
  it('is forwarded on a request that already has the device cookie', () => {
    const res = middleware(req('/board', 'kautilya_device=existing-id'));
    expect(forwardedHeader(res, 'x-pathname')).toBe('/board');
  });

  it('is forwarded on a first-ever request too, alongside minting the device cookie', () => {
    // This is the branch the header would have been silently dropped from if it were only
    // added to the early-return path above: a fresh visitor with no cookie yet takes a
    // different branch through this function, and that branch used to return early without
    // touching the request headers at all.
    const res = middleware(req('/'));
    expect(forwardedHeader(res, 'x-pathname')).toBe('/');
    expect(res.cookies.get('kautilya_device')?.value).toBeTruthy();
  });

  it('reports the exact path, not a prefix, so /board never reads as the splash', () => {
    const res = middleware(req('/board', 'kautilya_device=x'));
    expect(forwardedHeader(res, 'x-pathname')).not.toBe('/');
  });
});

/**
 * Found by curling a real build with basePath set, not by any unit test: with `basePath:
 * '/kautilya'` in next.config.mjs, Next concatenates that prefix directly onto a matcher
 * pattern's own leading "/" to decide whether to run this middleware at all. A pattern of
 * only `/((?!...).*)"` becomes, in effect, "/kautilya/((?!...).*)"` — which requires a SECOND
 * "/" after the prefix, so it never matches a request for exactly "/kautilya" (no trailing
 * slash, nothing after it). Middleware silently never ran for that one request shape: no
 * x-pathname header (app/layout.tsx couldn't tell the splash was chromeless, so it kept its
 * Nav and footer), and no device cookie minted either.
 *
 * Calling `middleware()` directly, as every test above does, cannot reproduce this — that
 * decision is Next's own routing layer, upstream of ever invoking this function. This pins
 * the actual fix (a bare '/' entry, matched as its own pattern rather than concatenated onto
 * the general one) so it cannot quietly disappear in a later "simplification".
 */
describe('the matcher, with a basePath in front of it', () => {
  it('matches the exact basePath root as its own entry, not folded into the general pattern', () => {
    expect(config.matcher).toContain('/');
  });
});
