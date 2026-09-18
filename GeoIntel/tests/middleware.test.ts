// tests/middleware.test.ts
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

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
