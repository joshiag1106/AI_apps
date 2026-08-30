import Link from 'next/link';
import { Badge } from '@/components/ui';
import { timeAgo, confidenceBand, escalationLabel, FLAG_LABEL } from '@/lib/format';
import { countryName } from '@/lib/queries';
import type { GeoEvent } from '@/lib/types';

export function ConfidenceChip({ value }: { value: number }) {
  const band = confidenceBand(value);
  return (
    <span className="inline-flex items-center gap-1.5"
      title={`Corroboration score ${value}/100 — a measure of reporting depth and provenance, not of truth.`}>
      <span className="sr-only">Corroboration score {value} of 100.</span>
      <span className="relative h-1.5 w-12 rounded-full bg-[color:var(--color-line)] overflow-hidden">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${value}%`, background: band.color }} />
      </span>
      <span className="mono-num text-[11px]" style={{ color: band.color }}>{value}</span>
    </span>
  );
}

export function EventCard({ event, compact = false }: { event: GeoEvent; compact?: boolean }) {
  const esc = escalationLabel(event.escalation);
  const actors = event.actors.slice(0, 3).map(countryName);

  return (
    <Link href={`/events/${event.id}`} className="panel group block p-3.5 transition-colors hover:border-[color:var(--color-accent-dim)]">
      <div className="flex items-start gap-3">
        {!compact && event.imageUrl && (
          /* Thumbnails come from the publisher's own feed metadata. */
          <img src={event.imageUrl} alt="" loading="lazy"
            className="h-16 w-24 flex-none rounded object-cover ring-1 ring-[color:var(--color-line)]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={esc.color}>{esc.label}</Badge>
            <Badge tone="var(--color-muted)">{event.domain}</Badge>
            {event.ladderRung && (
              <Badge tone="var(--color-zh)" title={`PRC official escalation ladder, rung ${event.ladderRung}`}>
                PRC rung {event.ladderRung}
              </Badge>
            )}
            {event.flags.filter((f) => f !== 'uncorroborated').map((f) => (
              <Badge key={f} tone={FLAG_LABEL[f]?.tone} title={FLAG_LABEL[f]?.help}>{FLAG_LABEL[f]?.label ?? f}</Badge>
            ))}
          </div>

          <h3 className="text-[13.5px] leading-snug text-text group-hover:text-[color:var(--color-accent)] line-clamp-2">
            {event.title}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
            <ConfidenceChip value={event.confidence} />
            <span className="mono-num">{event.articleIds.length} source{event.articleIds.length > 1 ? 's' : ''}</span>
            {event.languages.includes('zh') && <span className="zh-text text-[11px]">中文</span>}
            <span>{actors.join(' · ')}</span>
            <time dateTime={event.lastSeen} className="ml-auto">{timeAgo(event.lastSeen)}</time>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function EventRow({ event }: { event: GeoEvent }) {
  const esc = escalationLabel(event.escalation);
  return (
    <Link href={`/events/${event.id}`} className="hairline group flex items-center gap-3 py-2 px-1 hover:bg-[color:var(--color-panel-2)] rounded transition-colors">
      {/* The dot carries escalation level. Colour alone is not an accessible encoding,
          so the label travels with it for screen readers and on hover. */}
      <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: esc.color }}
        title={`${esc.label} escalation`} aria-hidden />
      <span className="sr-only">{esc.label} escalation.</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-text group-hover:text-[color:var(--color-accent)]">{event.title}</span>
      {event.languages.includes('zh') && <span className="zh-text text-[10px] flex-none">中</span>}
      <ConfidenceChip value={event.confidence} />
      <time dateTime={event.lastSeen}
        className="mono-num w-14 flex-none text-right text-[10.5px] text-faint">{timeAgo(event.lastSeen)}</time>
    </Link>
  );
}
