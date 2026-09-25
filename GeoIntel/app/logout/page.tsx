import { redirect } from 'next/navigation';
import { Panel, SectionTitle } from '@/components/ui';
import { currentUser, endSession } from '@/lib/auth';
import { needsSurvey, submitFeedback, skipFeedback, FEATURE_LABELS, type LikedFeature } from '@/lib/feedback/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign out' };

/**
 * The one-time exit survey, on the way out.
 *
 * A dedicated route rather than a modal on /account: the session is still live while this
 * page is shown (endSession() is only called from the two actions below), so someone who
 * navigates away without answering stays signed in and simply sees the account page again —
 * there is no half-signed-out state to reason about.
 *
 * Skippable, and asked once ever per account (Josh's call): `needsSurvey` reads the
 * `survey_done` flag set by either action, so a user who has already answered or skipped is
 * signed out immediately with no interstitial at all.
 */
export default async function LogoutPage() {
  const user = await currentUser();
  if (!user) redirect('/');

  if (!needsSurvey(user.id)) {
    await endSession();
    redirect('/');
  }

  async function submit(formData: FormData) {
    'use server';
    const u = await currentUser();
    if (!u) redirect('/');
    const rating = Number(formData.get('rating'));
    const likedFeature = String(formData.get('likedFeature') ?? 'other') as LikedFeature;
    const missingText = String(formData.get('missingText') ?? '').slice(0, 2000);
    const featureRequestText = String(formData.get('featureRequestText') ?? '').slice(0, 2000);
    if (rating >= 1 && rating <= 5) {
      submitFeedback(u.id, { rating, likedFeature, missingText, featureRequestText });
    } else {
      // A malformed rating still ends the survey rather than trapping the user on this
      // page — the same outcome as clicking Skip.
      skipFeedback(u.id);
    }
    await endSession();
    redirect('/');
  }

  async function skip() {
    'use server';
    const u = await currentUser();
    if (u) skipFeedback(u.id);
    await endSession();
    redirect('/');
  }

  return (
    <div className="mx-auto max-w-lg py-8">
      <div className="text-center">
        <div className="text-[12px] uppercase tracking-[0.22em] text-faint">Before you go</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">One minute of feedback?</h1>
        <p className="mt-1 text-[14px] text-muted">
          Asked once, ever — this won&rsquo;t come up again after you answer or skip.
        </p>
      </div>

      <Panel className="mt-5 p-5">
        <form action={submit} className="space-y-4">
          <fieldset>
            <SectionTitle kicker="1 is poor, 5 is excellent">Overall experience</SectionTitle>
            <div className="mt-2 flex gap-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex flex-1 flex-col items-center gap-1 rounded-md border border-[color:var(--color-line)] py-2 text-[14px] text-muted has-[:checked]:border-[color:var(--color-accent)] has-[:checked]:text-text">
                  <input type="radio" name="rating" value={n} required className="sr-only" />
                  {n}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-[13px] uppercase tracking-wider text-faint">Which feature did you like most?</span>
            <select name="likedFeature" defaultValue="board"
              className="mt-1 w-full rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-[15px] outline-none focus:border-[color:var(--color-accent-dim)]">
              {Object.entries(FEATURE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[13px] uppercase tracking-wider text-faint">What was confusing or missing?</span>
            <textarea name="missingText" rows={3} maxLength={2000}
              className="mt-1 w-full rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-[15px] outline-none focus:border-[color:var(--color-accent-dim)]" />
          </label>

          <label className="block">
            <span className="text-[13px] uppercase tracking-wider text-faint">A feature you&rsquo;d like to see? (optional)</span>
            <textarea name="featureRequestText" rows={2} maxLength={2000}
              className="mt-1 w-full rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-[15px] outline-none focus:border-[color:var(--color-accent-dim)]" />
          </label>

          <div className="flex gap-3 pt-1">
            <button className="flex-1 rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-[15px] font-medium text-[#0a0d13] hover:opacity-90">
              Submit and sign out
            </button>
          </div>
        </form>

        <form action={skip} className="mt-3 text-center">
          <button className="text-[13px] text-faint underline decoration-dotted hover:text-muted">
            Skip and sign out
          </button>
        </form>
      </Panel>
    </div>
  );
}
