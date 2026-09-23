import { isLoopbackOrigin, siteUrl, BASE_PATH } from '@/lib/site';

/** Used when no real origin is available. `.example` is reserved and can never be a real host. */
export const PLACEHOLDER_ORIGIN = 'https://kautilya.example';

/** `PLACEHOLDER_ORIGIN` with this app's own path prefix, matching what `siteUrl` returns. */
const PLACEHOLDER_URL = PLACEHOLDER_ORIGIN + BASE_PATH;

/**
 * The origin printed in the example alert email.
 *
 * renderDigest refuses a loopback origin (a link to the sending machine is dead in an inbox), and
 * siteOrigin throws in production when KAUTILYA_ORIGIN is unset. A public demo page must do
 * neither, so this takes the configured origin when it is a usable one and the placeholder in every
 * other case — including a malformed value, where throwing would take the whole page down.
 */
export function demoOrigin(env: Record<string, string | undefined> = process.env): string {
  try {
    // The bare origin, not PLACEHOLDER_URL: siteUrl appends BASE_PATH itself, unconditionally,
    // so a fallback that already carried it would come back with the path doubled.
    const url = siteUrl(PLACEHOLDER_ORIGIN, env);
    return isLoopbackOrigin(url) ? PLACEHOLDER_URL : url;
  } catch {
    return PLACEHOLDER_URL;
  }
}
