import { Panel, SectionTitle, Stat } from '@/components/ui';
import type { AdminForecast, ForecastAdminView } from '@/lib/forecast/admin';
import type { GoLive, Summary } from '@/lib/forecast/score';

const pct = (p: number | null) => (p === null ? '—' : `${Math.round(p * 100)}%`);
const num = (x: number | null) => (x === null ? '—' : x.toFixed(3));
const KIND_LABEL = { incident: 'Incidents', beijing: 'Beijing statements' } as const;

/** Below this many forecasts a Brier score says nothing, and a "0.010" from one forecast would mislead. */
export const MIN_SCORED = 30;

export function ScoreCells({ s }: { s: Summary }) {
  if (s.n > 0 && s.n < MIN_SCORED) {
    return (<>
      <td className="py-1 pr-3 tabular-nums">{s.n}</td>
      <td className="py-1 text-muted" colSpan={4}>too few to score (fewer than {MIN_SCORED} forecasts)</td>
    </>);
  }
  return (<>
    <td className="py-1 pr-3 tabular-nums">{s.n}</td>
    <td className="py-1 pr-3 tabular-nums">{num(s.brier.model)}</td>
    <td className="py-1 pr-3 tabular-nums">{num(s.brier.usual)}</td>
    <td className="py-1 pr-3 tabular-nums">{num(s.brier.persistence)}</td>
    <td className="py-1 tabular-nums">{s.skill === null ? '—' : s.skill.toFixed(2)}</td>
  </>);
}

function ScoreRow({ label, s }: { label: string; s: Summary }) {
  return (
    <tr className="border-t border-line">
      <td className="py-1 pr-3">{label}</td>
      <ScoreCells s={s} />
    </tr>
  );
}

function GoLiveStat({ kind, g }: { kind: keyof typeof KIND_LABEL; g: GoLive }) {
  return <Stat label={`${KIND_LABEL[kind]}: readers`} value={g.live ? 'Live' : 'Not yet'}
    sub={g.live ? 'shown to readers' : `needs ${g.needs.join('; ')}`} />;
}

function ForecastTable({ rows }: { rows: AdminForecast[] }) {
  return (
    <table className="w-full text-[13px]">
      <thead><tr className="text-left text-faint">
        <th className="pr-3 font-normal">Question</th><th className="pr-3 font-normal">Model</th>
        <th className="pr-3 font-normal">Usual</th><th className="pr-3 font-normal">Same</th><th className="font-normal">Why</th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.questionId} className="border-t border-line align-top">
            <td className="py-1 pr-3">{r.question}</td>
            <td className="py-1 pr-3 tabular-nums">{pct(r.model)}</td>
            <td className="py-1 pr-3 tabular-nums">{pct(r.usual)}</td>
            <td className="py-1 pr-3 tabular-nums">{pct(r.persistence)}</td>
            <td className="py-1 text-muted">{r.why ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Josh's view of the forecast record: what was issued, how it scores, and whether it may be shown. */
export function ForecastPanel({ view }: { view: ForecastAdminView }) {
  const check = view.ledger.check;
  const label = 'mb-1.5 text-[12px] uppercase tracking-[0.16em] text-faint';
  return (
    <Panel className="space-y-4 p-4">
      <SectionTitle kicker="Recorded before the outcome; readers see them only once they beat the baselines">Forecasts</SectionTitle>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Record chain" value={check === null ? 'Not yet checked' : check.ok ? 'Intact' : 'BROKEN'}
          sub={check ? (check.ok ? `${check.forecasts} forecasts, ${check.outcomes} outcomes` : `first break: ${check.brokenAt?.table} #${check.brokenAt?.seq}`) : undefined} />
        <Stat label="History weeks" value={view.historyWeeks}
          sub={view.reconstruction.done ? 'reconstruction complete' : `rebuilding from ${view.reconstruction.next ?? 'the start'}`} />
        <GoLiveStat kind="incident" g={view.live.incident} />
        <GoLiveStat kind="beijing" g={view.live.beijing} />
      </div>

      <div>
        <div className={label}>Brier score (lower is better) · skill vs usual rate</div>
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-faint">
            <th className="pr-3 font-normal">Scored on</th><th className="pr-3 font-normal">n</th>
            <th className="pr-3 font-normal">Signal model</th><th className="pr-3 font-normal">Usual rate</th>
            <th className="pr-3 font-normal">Same as last week</th><th className="font-normal">Skill</th>
          </tr></thead>
          <tbody>
            <ScoreRow label="Incidents — live record" s={view.live.incident} />
            <ScoreRow label="Incidents — backtest" s={view.backtest.incident} />
            <ScoreRow label="Beijing — live record" s={view.live.beijing} />
            <ScoreRow label="Beijing — backtest" s={view.backtest.beijing} />
          </tbody>
        </table>
      </div>

      <div>
        <div className={label}>{view.week ? `Recorded for ${view.week}` : 'No forecasts issued yet'}</div>
        {view.issued.length > 0 && <ForecastTable rows={view.issued} />}
      </div>

      <div>
        <div className={label}>Preview: the next 7 days · computed {view.preview.asOf.slice(0, 16).replace('T', ' ')} UTC · not recorded</div>
        <p className="mb-2 text-[13px] text-muted">
          What the forecasters would say if asked now. The record holds only forecasts issued at the start of their week;
          this preview is never written to it.
        </p>
        <ForecastTable rows={view.preview.rows} />
      </div>

      {view.skipped.length > 0 && (
        <p className="text-[13px] text-muted">Skipped weeks (first chance came more than 24 hours late): {view.skipped.join(', ')}</p>
      )}
    </Panel>
  );
}
