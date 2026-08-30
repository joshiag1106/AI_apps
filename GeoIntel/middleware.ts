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
  if (existing) return NextResponse.next();

  const device = crypto.randomUUID();
  const headers = new Headers(req.headers);
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
