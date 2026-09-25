import { notFound } from 'next/navigation';
import { Panel, SectionTitle, Stat } from '@/components/ui';
import { currentUser } from '@/lib/auth';
import { visitStats } from '@/lib/visits/store';
import { feedbackSummary, FEATURE_LABELS } from '@/lib/feedback/store';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin' };

/**
 * Josh's own view: how many people have visited, and what they said on the way out.
 *
 * Gated by ADMIN_EMAIL rather than a role column — there is exactly one operator, and a
 * whole roles table for one person would be the kind of complexity this codebase's own
 * comments repeatedly warn against building ahead of need. Unset ADMIN_EMAIL means nobody
 * can reach this page, not everybody; see .env.example.
 *
 * 404s rather than redirecting to /login for a non-admin visitor, so the page's existence
 * is not advertised to a signed-in reader who is not Josh.
 */
export default async function AdminPage() {
  const user = await currentUser();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || user?.email !== adminEmail) notFound();

  const visits = visitStats();
  const feedback = feedbackSummary();

  return (
    <div className="space-y-5 py-2">
      <SectionTitle level={1} kicker="Visible only to ADMIN_EMAIL">Visitors &amp; feedback</SectionTitle>

      <Panel className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
        <Stat label="Accounts (people)" value={visits.totalUsers} />
        <Stat label="Total visits" value={visits.totalVisits} />
        <Stat label="Visits, last 30 days" value={visits.last30Days} />
      </Panel>

      <Panel className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
        <Stat label="Survey responses" value={feedback.responses} />
        <Stat label="Skipped" value={feedback.skipped} />
        <Stat label="Average rating"
          value={feedback.avgRating !== null ? feedback.avgRating.toFixed(1) : '—'} />
      </Panel>

      <Panel className="p-4">
        <SectionTitle kicker="Among those who answered">Most-liked feature</SectionTitle>
        {Object.keys(feedback.byFeature).length ? (
          <ul className="space-y-1 text-[14px]">
            {Object.entries(feedback.byFeature)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => (
                <li key={key} className="flex justify-between gap-3">
                  <span className="text-text">{FEATURE_LABELS[key as keyof typeof FEATURE_LABELS] ?? key}</span>
                  <span className="mono-num text-faint">{count}</span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-[15px] text-muted">No answers yet.</p>
        )}
      </Panel>

      <Panel className="p-4">
        <SectionTitle kicker="What was confusing, missing, or requested">Recent responses</SectionTitle>
        {feedback.recent.filter((r) => r.rating !== null).length ? (
          <div className="divide-y divide-[color:var(--color-line-soft)]">
            {feedback.recent.filter((r) => r.rating !== null).map((r, i) => (
              <div key={i} className="space-y-1 py-3 text-[14px]">
                <div className="flex items-center gap-3">
                  <span className="mono-num font-medium text-text">{r.rating}/5</span>
                  <span className="text-faint">{FEATURE_LABELS[r.likedFeature as keyof typeof FEATURE_LABELS] ?? r.likedFeature}</span>
                  <span className="mono-num ml-auto text-[13px] text-faint">{fmtDate(r.createdAt)}</span>
                </div>
                {r.missingText && <p className="text-muted">Confusing/missing: {r.missingText}</p>}
                {r.featureRequestText && <p className="text-muted">Wants: {r.featureRequestText}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[15px] text-muted">No answered surveys yet.</p>
        )}
      </Panel>
    </div>
  );
}
