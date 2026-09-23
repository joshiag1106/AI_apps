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
/**
 * Whether an address can only be opened from the machine that produced it.
 *
 * `siteOrigin` answers "is the configured value well-formed?", and `http://localhost:3111` is.
 * That is not the same as "can a reader reach it?" — a link in an inbox is opened from
 * somewhere else, so a loopback address is dead on arrival. The first real alert shipped
 * with exactly that, because the local config said so and nothing asked the second question.
 *
 * Deliberately a question rather than a throw: it is asked of values that may already be wrong.
 * Private-network addresses (192.168.x.x) are left alone — an intranet deployment is a
 * legitimate reason to mail one.
 */
export function isLoopbackOrigin(origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === 'localhost' || host.endsWith('.localhost')
    || host === '0.0.0.0' || host === '[::1]'
    // A full dotted quad, not a "127." prefix: 127.example.com is a real host.
    || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

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

/**
 * Must match next.config.mjs's `basePath`. The app is mounted under this path rather than at
 * its host's root, because the host also serves other things (the production company site,
 * at "/").
 */
export const BASE_PATH = '/kautilya';

/**
 * The address to build a link to one of this app's OWN routes from: `siteOrigin` plus
 * `BASE_PATH`. Every caller that appends a path of its own — a redirect out of an API route,
 * a link inside alert mail — wants this, not `siteOrigin` alone, or the link lands one level
 * up from where the app actually lives.
 */
export function siteUrl(fallback: string, env: Record<string, string | undefined> = process.env): string {
  return siteOrigin(fallback, env) + BASE_PATH;
}
