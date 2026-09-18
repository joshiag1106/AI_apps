import { NextResponse, type NextRequest } from 'next/server';

const DEVICE_COOKIE = 'kautilya_device';

/**
 * Assigns the anonymous device id used to meter the free allowance.
 *
 * This must happen in middleware: a Server Component cannot set a cookie during render,
 * so doing it there silently failed and minted a fresh id on every request — which meant
 * the free-usage counter never advanced and the paywall never fired.
 *
 * The id is written to both the forwarded request headers (so `cookies()` sees it during
 * this same render) and the response (so the browser keeps it).
 */
export function middleware(req: NextRequest) {
  const existing = req.cookies.get(DEVICE_COOKIE)?.value;

  /*
   * Forwarded on every request, both branches below, so app/layout.tsx can tell whether it
   * is rendering the splash (app/page.tsx, the one route with no Nav or footer) without a
   * Server Component needing its own way to read the current URL — Next does not hand the
   * root layout the path for free. This has to be set on BOTH branches: the early return
   * for a visitor who already has the device cookie is the common case on every request
   * after the first, and setting it only in the mint-a-cookie branch below would have left
   * the header silently absent almost all the time.
   */
  const headers = new Headers(req.headers);
  headers.set('x-pathname', req.nextUrl.pathname);

  if (existing) return NextResponse.next({ request: { headers } });

  const device = crypto.randomUUID();
  const cookie = req.headers.get('cookie');
  headers.set('cookie', `${cookie ? `${cookie}; ` : ''}${DEVICE_COOKIE}=${device}`);

  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(DEVICE_COOKIE, device, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
