// components/demo/scenes/EventScene.tsx
import { ConfidenceMeter } from '@/components/ConfidenceMeter';
import { EvidenceFamily } from '@/components/EvidenceFamily';
import type { EventData, Report } from '@/lib/demo/types';
import { Beat, SceneFrame } from './Beat';

function Row({ r }: { r: Report }) {
  return (
    <div className="py-2">
      <div className="text-[15px] text-text">{r.title}</div>
      <div className="text-[12px] text-faint">{r.outlet}</div>
    </div>
  );
}

/**
 * Chapter 4. Reports group under one event; a reprint folds under the report it repeats (EvidenceFamily's
 * own fold, closed by RevealOnView), counted once; the confidence meter fills from its named signals.
 * "Also printed by", never "copied from" — which outlet copied which cannot be known from a headline.
 *
 * The lead row (with its fold) and the meter panel have no Beat around them on purpose: both animate
 * themselves on mount (the fold closes and the bars fill via RevealOnView), and `.demo-beat`/`.demo-slide`
 * hold an element at opacity 0 until its delay and then fade it in over 520 ms, so their own animation
 * would finish before anyone could see it. This gives up the "meter fills after the reports" sequencing:
 * a Server Component cannot delay a MOUNT, only a fade. The other reports are plain text rows, so they
 * still slide in one after another. ConfidenceMeter supplies its own panel, so it is rendered bare under
 * the title, as on the event page.
 */
export function EventScene({ data }: { data: EventData }) {
  const [lead, ...rest] = data.reports;
  const outlets = [...new Set(data.reprints.map((r) => r.outlet).filter((o) => o !== lead.outlet))];

  return (
    <SceneFrame className="sm:flex-row sm:items-start">
      <div className="w-full divide-y divide-[color:var(--color-line-soft)] sm:w-1/2">
        <div>
          {data.reprints.length > 0 ? (
            <EvidenceFamily lead={<Row r={lead} />} outlets={outlets} sameOutlet={lead.outlet} count={data.reprints.length}>
              {data.reprints.map((r, i) => <Row key={i} r={r} />)}
            </EvidenceFamily>
          ) : (
            <Row r={lead} />
          )}
        </div>
        {rest.map((r, i) => (
          <Beat key={i} at={500 + i * 450} kind="slide"><Row r={r} /></Beat>
        ))}
      </div>

      <div className="w-full sm:w-1/2">
        <h2 className="mb-2 text-[17px] font-semibold text-text">{data.title}</h2>
        <ConfidenceMeter value={data.confidence} signals={data.signals} flags={data.flags} />
      </div>
    </SceneFrame>
  );
}
