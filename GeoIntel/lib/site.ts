/**
 * The address readers reach this site at, for any link that leaves the page they are on:
 * a redirect out of an API route, or a link inside alert mail.
 *
 * It cannot come from the request. Behind a reverse proxy — which is how this runs in
 * production — Next builds a route handler's `req.url` from the host and port the server
 * itself listens on, so `new URL(req.url).origin` is http://localhost:3000 however the reader
 * arrived. Checkout built its redirects that way, and would have sent a reader who had just
 * paid to localhost.
 *
 * So production requires KAUTILYA_ORIGIN and throws without it, rather than falling back to
 * an address that is wrong by construction. Outside production the caller's fallback is kept:
 * nothing sits in front of the dev server, so the request's own address is the right one.
 */
export function siteOrigin(fallback: string, env: Record<string, string | undefined> = process.env): string {
  const raw = env.KAUTILYA_ORIGIN?.trim();
  if (!raw) {
    if (env.NODE_ENV === 'production') {
      throw new Error('KAUTILYA_ORIGIN must be set in production, to the address readers use (e.g. https://example.com).');
    }
    return fallback;
  }

  let url: URL | null = null;
  try {
    url = new URL(raw);
  } catch {
    // Reported below, together with the other way a value can be unusable.
  }
  // Parsing alone is not enough: 'localhost:3111' parses with 'localhost:' as its scheme,
  // and the origin of that is the string "null".
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new Error(`KAUTILYA_ORIGIN must be a full web address such as https://example.com, not "${raw}".`);
  }
  return url.origin;
}
