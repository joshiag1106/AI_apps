'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MapShape } from '@/lib/map';

export interface MapDatum { iso: string; composite: number; eventCount: number; name: string }
export interface MapMarker { id: string; name: string; x: number; y: number; heat: number; count: number }

/** Fill colours for map shading. Not read as text, so the deep alarm red is right here. */
function tone(v: number): string {
  if (v >= 80) return 'var(--color-severe-fill)';
  if (v >= 60) return 'var(--color-high)';
  if (v >= 40) return 'var(--color-elevated)';
  if (v >= 20) return 'var(--color-guarded)';
  return 'var(--color-low)';
}

/**
 * A one-sentence spoken equivalent of the choropleth. A map conveys its data purely
 * through colour and position, neither of which reaches a screen reader, so the summary
 * names the states actually driving the picture and the full table is linked below.
 */
function describeMap(data: MapDatum[]): string {
  const top = [...data].sort((a, b) => b.composite - a.composite).slice(0, 5);
  if (!top.length) return 'World risk map. No events in the current corpus.';
  const list = top.map((d) => `${d.name} ${d.composite}`).join(', ');
  return `World risk map showing composite risk for ${data.length} states. `
    + `Highest: ${list}. A sortable table of every state is on the dashboard.`;
}

export function WorldMap({
  shapes, data, markers, width = 960, height = 400, focus,
}: { shapes: MapShape[]; data: MapDatum[]; markers: MapMarker[]; width?: number; height?: number; focus?: string }) {
  const [hover, setHover] = useState<{ label: string; sub: string; x: number; y: number } | null>(null);
  const byIso = new Map(data.map((d) => [d.iso, d]));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto max-h-[min(52vh,460px)] select-none"
        role="img" aria-label={describeMap(data)}>
        <rect width={width} height={height} fill="transparent" />
        {shapes.map((s, i) => {
          const d = s.iso ? byIso.get(s.iso) : undefined;
          const isFocus = focus && s.iso === focus;
          const fillColor = d
            ? `color-mix(in oklab, ${tone(d.composite)} ${Math.max(16, Math.min(78, d.composite))}%, #0e1622)`
            : '#0e1622';
          return (
            <path
              key={`${s.name}-${i}`}
              d={s.d}
              fill={fillColor}
              stroke={isFocus ? 'var(--color-accent)' : 'var(--color-line)'}
              strokeWidth={isFocus ? 1.4 : 0.5}
              className={d ? 'cursor-pointer transition-[filter]' : ''}
              onMouseEnter={(e) => d && setHover({
                label: d.name,
                sub: `Risk ${d.composite} · ${d.eventCount} events`,
                x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY,
              })}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}

        {markers.map((m) => (
          <g key={m.id} transform={`translate(${m.x},${m.y})`}>
            <circle r={5} fill="var(--color-accent)" opacity="0.25" className="pulse-ring" />
            <circle
              r={Math.max(2.5, Math.min(6, 2 + m.heat / 90))}
              fill="var(--color-accent)" stroke="#0a0d13" strokeWidth="0.8"
              className="cursor-pointer"
              onMouseEnter={() => setHover({ label: m.name, sub: `${m.count} events · heat ${m.heat}`, x: m.x, y: m.y })}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 panel px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: `${(hover.x / width) * 100}%`, top: `${(hover.y / height) * 100}%`, transform: 'translate(10px, -50%)' }}
        >
          <div className="font-medium text-text">{hover.label}</div>
          <div className="text-faint mono-num">{hover.sub}</div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] text-faint">
        <span className="uppercase tracking-[0.16em]">Composite risk</span>
        <span className="flex items-center gap-1.5">
          {[10, 30, 50, 70, 90].map((v) => (
            <i key={v} className="h-2.5 w-6 rounded-sm"
              style={{ background: `color-mix(in oklab, ${tone(v)} ${Math.max(16, v)}%, #0e1622)` }} />
          ))}
        </span>
        <span>low → severe</span>
        <span className="flex items-center gap-1.5 ml-2">
          <i className="h-2 w-2 rounded-full" style={{ background: 'var(--color-accent)' }} />
          active flashpoint
        </span>
        <Link href="/dashboard" className="ml-auto underline decoration-dotted hover:text-muted">
          Same data as a sortable table
        </Link>
        <Link href="/methodology" className="underline decoration-dotted hover:text-muted">
          How these are computed
        </Link>
      </div>
    </div>
  );
}
