import { confidenceBand, FLAG_LABEL } from '@/lib/format';
import { Badge } from '@/components/ui';
import type { ConfidenceSignal, EventFlag } from '@/lib/types';

/**
 * The full verification breakdown. Every point in the score is attributable to a named
 * signal — an analyst has to be able to disagree with the arithmetic, which means
 * seeing it.
 */
export function ConfidenceMeter({ value, signals, flags }: { value: number; signals: ConfidenceSignal[]; flags: EventFlag[] }) {
  const band = confidenceBand(value);
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-faint">Corroboration score</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="mono-num text-3xl leading-none" style={{ color: band.color }}>{value}</span>
            <span className="text-[13px]" style={{ color: band.color }}>{band.label}</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5 max-w-[55%]">
          {flags.map((f) => (
            <Badge key={f} tone={FLAG_LABEL[f]?.tone} title={FLAG_LABEL[f]?.help}>{FLAG_LABEL[f]?.label ?? f}</Badge>
          ))}
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[color:var(--color-line)]">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${value}%`, background: band.color }} />
      </div>

      <div className="mt-4 space-y-2.5">
        {signals.map((s) => (
          <div key={s.key}>
            <div className="flex items-center justify-between gap-3 text-[11.5px]">
              <span className="text-text">{s.label}</span>
              <span className="mono-num text-faint">
                <span style={{ color: s.points < 0 ? 'var(--color-high)' : s.points > 0 ? 'var(--color-text)' : 'var(--color-faint)' }}>
                  {s.points > 0 ? '+' : ''}{s.points}
                </span>
                {s.max > 0 && <span className="text-faint"> / {s.max}</span>}
              </span>
            </div>
            {s.max > 0 && (
              <div className="mt-1 h-1 w-full rounded-full bg-[color:var(--color-line-soft)]">
                <div className="h-full rounded-full" style={{ width: `${Math.max(0, (s.points / s.max) * 100)}%`, background: 'var(--color-accent)', opacity: 0.75 }} />
              </div>
            )}
            <p className="mt-1 text-[11px] leading-snug text-muted">{s.detail}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 border-t border-[color:var(--color-line-soft)] pt-3 text-[10.5px] leading-relaxed text-faint">
        This score measures how well an event is <em>reported</em> — how many genuinely independent
        outlets, in how many countries and languages, and whether a primary source is present.
        It is not a judgement of whether the claim is true. A widely repeated falsehood can score
        highly; a correct exclusive will score low.
      </p>
    </div>
  );
}
