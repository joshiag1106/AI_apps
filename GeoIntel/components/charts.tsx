/*
  Hand-rolled SVG charts. No charting library: this keeps the bundle small, avoids
  React peer-dependency churn, and lets every mark match the design system exactly.
  All of these are server-renderable — they take data and emit static SVG.
*/

export function Sparkline({
  data, width = 220, height = 40, color = 'var(--color-accent)', fill = true,
}: { data: number[]; width?: number; height?: number; color?: string; fill?: boolean }) {
  if (!data.length) return <svg width={width} height={height} aria-hidden />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const dx = width / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => [i * dx, height - ((v - min) / span) * (height - 4) - 2] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const gid = `sg-${Math.abs(data.reduce((a, b, i) => a + b * (i + 1), 0)) % 100000}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="trend">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Dial({ value, size = 84, label, color }: { value: number; size?: number; label?: string; color?: string }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const tone = color ?? (value >= 80 ? 'var(--color-severe)' : value >= 60 ? 'var(--color-high)'
    : value >= 40 ? 'var(--color-elevated)' : value >= 20 ? 'var(--color-guarded)' : 'var(--color-low)');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? 'score'} ${value}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth="6" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${(c * pct).toFixed(2)} ${c.toFixed(2)}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        className="mono-num" fontSize={size * 0.28} fill="var(--color-text)">{Math.round(value)}</text>
    </svg>
  );
}

export function BarList({ items, max, unit = '' }: { items: { label: string; value: number; tone?: string; href?: string }[]; max?: number; unit?: string }) {
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="grid grid-cols-[1fr_auto] gap-2 items-center">
          <div className="relative h-6 rounded bg-[color:var(--color-line-soft)] overflow-hidden">
            <div className="absolute inset-y-0 left-0 rounded"
              style={{ width: `${Math.max(2, (it.value / top) * 100)}%`, background: `color-mix(in oklab, ${it.tone ?? 'var(--color-accent)'} 34%, transparent)` }} />
            <span className="absolute inset-y-0 left-2 flex items-center text-[11px] text-text truncate pr-2">{it.label}</span>
          </div>
          <span className="mono-num text-[11px] text-muted w-12 text-right">{it.value}{unit}</span>
        </div>
      ))}
    </div>
  );
}

/** Six-vector risk radar. Axis order is fixed so profiles are comparable at a glance. */
export function Radar({ axes, size = 210 }: { axes: { label: string; value: number }[]; size?: number }) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 34;
  const n = axes.length;
  const pt = (i: number, frac: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * R * frac, cy + Math.sin(a) * R * frac] as const;
  };
  const poly = axes.map((ax, i) => pt(i, Math.max(0.02, ax.value / 100)).join(',')).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="risk vectors">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={axes.map((_, i) => pt(i, f).join(',')).join(' ')}
          fill="none" stroke="var(--color-line)" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-line)" strokeWidth="1" />;
      })}
      <polygon points={poly} fill="color-mix(in oklab, var(--color-accent) 22%, transparent)"
        stroke="var(--color-accent)" strokeWidth="1.5" />
      {axes.map((ax, i) => {
        const [x, y] = pt(i, 1.26);
        return (
          <text key={ax.label} x={x} y={y} textAnchor="middle" dominantBaseline="central"
            fontSize="9" fill="var(--color-muted)" className="uppercase tracking-wider">
            {ax.label}
          </text>
        );
      })}
    </svg>
  );
}

/** Stacked proportion strip — used for language and domain mixes. */
export function Ribbon({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {parts.map((p) => (
          <div key={p.label} title={`${p.label}: ${p.value}`}
            style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <i className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.label}
            <span className="mono-num text-faint">{p.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** 90-day column chart for dyad tension. */
export function Columns({ data, height = 90, color = 'var(--color-high)' }: { data: { date: string; value: number }[]; height?: number; color?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="90-day tension">
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 2);
        return <rect key={d.date} x={i * w} y={height - h} width={w * 0.82} height={Math.max(0.6, h)}
          fill={color} opacity={0.35 + 0.65 * (d.value / max)} />;
      })}
    </svg>
  );
}
