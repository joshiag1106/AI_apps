import { ESCALATION_LADDER } from '@/data/glossary.zh';
import { ChineseText, chineseTitle } from '@/components/ChineseText';

/**
 * The PRC official escalation ladder, with the detected rung marked.
 * Showing the whole ladder is the point: a rung means little without the rungs
 * above and below it for scale.
 */
export function LadderGauge({ rung, compact = false }: { rung: number; compact?: boolean }) {
  const shown = compact
    ? ESCALATION_LADDER.filter((r) => Math.abs(r.rung - rung) <= 2 || r.rung === 13)
    : ESCALATION_LADDER;
  const hit = ESCALATION_LADDER.find((r) => r.rung === rung);

  return (
    <div className="panel p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-faint">PRC official escalation ladder</div>
      {hit && (
        <div className="mt-2 flex items-baseline gap-2.5">
          <span className="text-xl">
            <ChineseText text={hit.zh} accent clamp={false} />
          </span>
          <span className="text-[13px] text-text">{hit.en}</span>
          <span className="mono-num ml-auto text-[11px] text-faint">rung {hit.rung}/13</span>
        </div>
      )}
      {hit && <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{hit.gloss}</p>}

      <div className="mt-3.5 space-y-1">
        {shown.map((r) => {
          const active = r.rung === rung;
          const below = r.rung < rung;
          return (
            <div key={r.rung} className="flex items-center gap-2">
              <span className="mono-num w-5 text-right text-[10px] text-faint">{r.rung}</span>
              <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-[color:var(--color-line-soft)]">
                <div className="absolute inset-y-0 left-0 rounded-sm"
                  style={{
                    width: `${r.severity}%`,
                    background: active ? 'var(--color-zh)' : below ? 'color-mix(in oklab, var(--color-zh) 22%, transparent)' : 'var(--color-line)',
                  }} />
                <span className={`absolute inset-y-0 left-1.5 flex items-center text-[10px] ${active ? 'text-[#0a0d13] font-semibold' : 'text-muted'}`}>
                  <span className="zh-text" title={chineseTitle(r.zh, r.en)}
                    style={active ? { color: '#0a0d13' } : undefined}>{r.zh}</span>
                  <span className="ml-1.5 opacity-70">{r.en}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 border-t border-[color:var(--color-line-soft)] pt-2.5 text-[10.5px] leading-relaxed text-faint">
        PRC official statements move through a fixed set of formulae. The rung chosen is a
        deliberate signal and carries more information than volume or tone. Rung 13
        (<span className="zh-text">勿谓言之不预也</span>) was carried by People&apos;s Daily before the
        1962 war with India and the 1979 war with Vietnam — treat any appearance as a priority
        signal and verify the outlet and date directly before acting on it.
      </p>
    </div>
  );
}
