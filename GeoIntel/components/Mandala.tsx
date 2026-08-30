import Link from 'next/link';
import { countryName } from '@/lib/queries';

export interface MandalaNode { iso: string; score: number; eventCount: number; trend: number }

/**
 * Kautilya's mandala: states arranged in concentric rings around the focal power,
 * ordered by measured tension rather than by declared alliance. The inner ring is
 * where friction is highest — in the Arthashastra's terms, the immediate circle.
 *
 * A deterministic radial layout beats a force simulation here: positions stay stable
 * between page loads, so an analyst can learn the picture instead of re-reading it.
 */
export function Mandala({ focus, nodes, size = 460 }: { focus: string; nodes: MandalaNode[]; size?: number }) {
  const cx = size / 2, cy = size / 2;
  const ranked = [...nodes].sort((a, b) => b.score - a.score);

  const ring = (s: number) => (s >= 55 ? 0 : s >= 30 ? 1 : 2);
  const radii = [size * 0.19, size * 0.31, size * 0.43];
  const rings: MandalaNode[][] = [[], [], []];
  for (const n of ranked) rings[ring(n.score)].push(n);

  const tone = (s: number) =>
    s >= 70 ? 'var(--color-severe)' : s >= 55 ? 'var(--color-high)'
      : s >= 40 ? 'var(--color-elevated)' : s >= 20 ? 'var(--color-guarded)' : 'var(--color-low)';

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto" role="img"
      aria-label={`Relationship mandala centred on ${countryName(focus)}`}>
      {radii.map((r, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-line)"
          strokeWidth="1" strokeDasharray={i === 0 ? '' : '2 4'} />
      ))}

      {rings.map((group, ri) =>
        group.map((n, i) => {
          const angle = (Math.PI * 2 * i) / Math.max(group.length, 1) - Math.PI / 2 + ri * 0.35;
          const r = radii[ri];
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          const rad = Math.max(9, Math.min(20, 8 + n.eventCount / 3));
          return (
            <g key={n.iso}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={tone(n.score)}
                strokeWidth={Math.max(0.6, n.score / 45)} opacity="0.35" />
              <Link href={`/dyad/${focus}-${n.iso}`}>
                <circle cx={x} cy={y} r={rad}
                  fill={`color-mix(in oklab, ${tone(n.score)} 30%, #10182390)`}
                  stroke={tone(n.score)} strokeWidth="1.4" className="cursor-pointer" />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                  className="mono-num pointer-events-none" fontSize="9.5" fill="var(--color-text)">
                  {n.iso}
                </text>
                <text x={x} y={y + rad + 9} textAnchor="middle"
                  className="mono-num pointer-events-none" fontSize="8.5" fill={tone(n.score)}>
                  {n.score}
                </text>
              </Link>
            </g>
          );
        }),
      )}

      <circle cx={cx} cy={cy} r={26} fill="var(--color-panel-2)" stroke="var(--color-accent)" strokeWidth="1.6" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        className="mono-num" fontSize="12" fill="var(--color-accent)">{focus}</text>

      <text x={cx} y={size - 6} textAnchor="middle" fontSize="8.5" fill="var(--color-faint)"
        className="uppercase tracking-[0.16em]">
        inner ring = highest measured tension
      </text>
    </svg>
  );
}
