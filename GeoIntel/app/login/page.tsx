import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Panel } from '@/components/ui';
import { createUser, verifyCredentials, startSession, currentUser } from '@/lib/auth';
import { safeRedirect, loginErrorMessage } from '@/lib/security/redirect';
import { isThrottled, recordFailure, clearFailures } from '@/lib/security/throttle';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect('/account');

  async function submit(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const mode = String(formData.get('mode') ?? 'signin');
    // Only same-site paths: a `next` of https://evil.example would otherwise turn a
    // genuine sign-in into the first half of a phishing flow.
    const next = safeRedirect(formData.get('next'));

    const fail = (code: string) => redirect(`/login?error=${code}&mode=${mode}`);

    if (!email.includes('@')) fail('invalid_email');
    if (isThrottled(email)) fail('rate_limited');

    try {
      if (mode === 'register') {
        const user = await createUser(email, password);
        await startSession(user.id);
      } else {
        const user = await verifyCredentials(email, password);
        if (!user) {
          recordFailure(email);
          fail('bad_credentials');
        }
        clearFailures(email);
        await startSession(user!.id);
      }
    } catch (e) {
      // redirect() signals by throwing; let that pass through untouched.
      if ((e as { digest?: string })?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
      const msg = e instanceof Error ? e.message : '';
      const code = /already exists/i.test(msg) ? 'email_taken'
        : /at least 8/i.test(msg) ? 'weak_password'
        : 'failed';
      fail(code);
    }
    redirect(next);
  }

  const register = sp.mode === 'register';

  return (
    <div className="mx-auto max-w-sm py-8">
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[0.22em] text-faint">
          {register ? 'Create account' : 'Sign in'}
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {register ? 'Start an analyst account' : 'Welcome back'}
        </h1>
      </div>

      <Panel className="mt-5 p-5">
        <form action={submit} className="space-y-3">
          <input type="hidden" name="mode" value={register ? 'register' : 'signin'} />
          <input type="hidden" name="next" value={safeRedirect(sp.next)} />

          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-faint">Email</span>
            <input name="email" type="email" required autoComplete="email"
              className="mt-1 w-full rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-[13px] outline-none focus:border-[color:var(--color-accent-dim)]" />
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-faint">Password</span>
            <input name="password" type="password" required minLength={8}
              autoComplete={register ? 'new-password' : 'current-password'}
              className="mt-1 w-full rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-[13px] outline-none focus:border-[color:var(--color-accent-dim)]" />
            {register && <span className="mt-1 block text-[10.5px] text-faint">At least 8 characters.</span>}
          </label>

          {loginErrorMessage(sp.error) && (
            <p className="rounded border border-[color:var(--color-high)]/40 bg-[color:var(--color-high)]/10 px-3 py-2 text-[12px] text-[color:var(--color-high)]">
              {loginErrorMessage(sp.error)}
            </p>
          )}

          <button className="w-full rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0a0d13] hover:opacity-90">
            {register ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-[12px] text-muted">
          {register ? (
            <>Already have an account? <Link href="/login" className="text-[color:var(--color-accent)] hover:underline">Sign in</Link></>
          ) : (
            <>No account? <Link href="/login?mode=register" className="text-[color:var(--color-accent)] hover:underline">Create one</Link></>
          )}
        </p>
      </Panel>

      <p className="mt-4 text-center text-[10.5px] leading-relaxed text-faint">
        Accounts exist to make the free allowance meaningful and to carry a subscription.
        Passwords are hashed with bcrypt; no email is sent anywhere.
      </p>
    </div>
  );
}
