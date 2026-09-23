import { isLoopbackOrigin, siteOrigin } from '@/lib/site';

/** Used when no real origin is available. `.example` is reserved and can never be a real host. */
export const PLACEHOLDER_ORIGIN = 'https://kautilya.example';

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
    const origin = siteOrigin(PLACEHOLDER_ORIGIN, env);
    return isLoopbackOrigin(origin) ? PLACEHOLDER_ORIGIN : origin;
  } catch {
    return PLACEHOLDER_ORIGIN;
  }
}
