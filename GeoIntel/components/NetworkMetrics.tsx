import type { MetricRow } from '@/lib/graph/panel';

/**
 * What the measures mean, beside what they are. A number with no reading is a number
 * nobody can act on, and these are unfamiliar enough that the reading is the product.
 *
 * The row shape and every value/reading in it are owned by lib/graph/panel.ts, which is
 * also the only place allowed to compute a measure (see that file's header for why). This
 * component is a pure renderer of whatever it is handed — it imports MetricRow rather
 * than redeclaring it, so the two cannot silently drift apart.
 */
export function NetworkMetrics({ rows, degree }: { rows: MetricRow[]; degree: number }) {
  // `degree` is the full-graph degree, not the count of what is drawn. Degree 0 gets its
  // own, blunter caveat: it used to get none at all, which meant the one state the engine
  // knows nothing about was also the one state whose panel carried no warning.
  const caveat = degree === 0
    ? 'No connections are recorded for this state in the current corpus. The measures below are the defined values for a state with no edges — they are not a finding about it.'
    : degree <= 2
      ? 'This state has one or two recorded connections. Network measures are reported for completeness, but they rest on too little evidence to compare against a well-connected state.'
      : null;

  return (
    <div className="space-y-3">
      {caveat && (
        <p className="rounded border border-[color:var(--color-line)] px-3 py-2 text-[11px] text-muted">
          {caveat}
        </p>
      )}
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded border border-[color:var(--color-line)] p-3">
            <dt className="text-[10px] uppercase tracking-wider text-faint">{r.label}</dt>
            <dd className="mono-num mt-0.5 text-[18px] text-text">{r.value}</dd>
            <dd className="mt-1 text-[11px] leading-snug text-muted">{r.reading}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
