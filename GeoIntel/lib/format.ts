export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Confidence bands describe how well an event is *reported*, never whether it is true.
 * The wording is deliberate: "single report" is a statement about corroboration depth,
 * where "unverified" would imply a judgement on the claim itself.
 */
export function confidenceBand(c: number): { label: string; color: string } {
  if (c >= 85) return { label: 'Strongly corroborated', color: 'var(--color-verified)' };
  if (c >= 70) return { label: 'Well corroborated', color: '#4fb477' };
  if (c >= 50) return { label: 'Corroborated', color: 'var(--color-guarded)' };
  if (c >= 30) return { label: 'Limited corroboration', color: 'var(--color-elevated)' };
  return { label: 'Single report', color: 'var(--color-faint)' };
}

export function escalationLabel(e: number): { label: string; color: string } {
  if (e >= 60) return { label: 'Severe', color: 'var(--color-severe)' };
  if (e >= 35) return { label: 'High', color: 'var(--color-high)' };
  if (e >= 15) return { label: 'Elevated', color: 'var(--color-elevated)' };
  if (e > -10) return { label: 'Routine', color: 'var(--color-muted)' };
  return { label: 'De-escalatory', color: 'var(--color-low)' };
}

export const FLAG_LABEL: Record<string, { label: string; tone: string; help: string }> = {
  single_source:    { label: 'Single source', tone: 'var(--color-elevated)', help: 'Only one outlet is reporting this. Treat as a lead, not an established fact.' },
  state_media_only: { label: 'State media only', tone: 'var(--color-high)',  help: 'Every reporting outlet is state-owned or state-affiliated. Repetition within one state’s media is not corroboration.' },
  disputed:         { label: 'Disputed', tone: 'var(--color-severe)',        help: 'Sources in this cluster assert and deny the same claim. The accounts conflict.' },
  uncorroborated:   { label: 'Uncorroborated', tone: 'var(--color-faint)',   help: 'Below the corroboration threshold — too few independent sources to assess.' },
  primary_sourced:  { label: 'Primary source', tone: 'var(--color-verified)', help: 'An official statement from a ministry, military or spokesperson is in the cluster.' },
};
