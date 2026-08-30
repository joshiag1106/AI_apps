/**
 * Constrain a post-login redirect to somewhere on this site.
 *
 * Without this, `/login?next=https://evil.example/` is an open redirect: the victim
 * signs in on the genuine site and is then handed to an attacker's page, which is a
 * far more convincing place to ask for a password "again" than a cold phishing link.
 *
 * Only same-site absolute paths are allowed. Everything else falls back.
 */
export function safeRedirect(target: unknown, fallback = '/account'): string {
  if (typeof target !== 'string' || target.length === 0) return fallback;

  // Reject anything that could resolve off-site. `//evil.com` is protocol-relative and
  // `\\evil.com` is treated as such by some browsers; a backslash can also smuggle past
  // naive checks. A scheme anywhere before the first slash means an absolute URL.
  const t = target.trim();
  if (!t.startsWith('/')) return fallback;
  if (t.startsWith('//') || t.startsWith('/\\') || t.startsWith('/%2f') || t.startsWith('/%2F')) return fallback;
  if (t.includes('\\')) return fallback;
  if (/^\/+[^/]*:/.test(t)) return fallback;
  // Control characters can break out of a header in some stacks.
  if (/[\x00-\x1f\x7f]/.test(t)) return fallback;

  return t;
}

/**
 * Login errors are shown to the user, so they must not be free text from the URL —
 * an attacker could otherwise render their own instructions inside a genuine page.
 */
export const LOGIN_ERRORS = {
  invalid_email: 'Enter a valid email address.',
  bad_credentials: 'Email or password is incorrect.',
  weak_password: 'Password must be at least 8 characters.',
  email_taken: 'An account with that email already exists.',
  failed: 'Something went wrong. Please try again.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERRORS;

export function loginErrorMessage(code: unknown): string | null {
  return typeof code === 'string' && code in LOGIN_ERRORS
    ? LOGIN_ERRORS[code as LoginErrorCode]
    : null;
}
