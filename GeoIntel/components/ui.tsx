import Link from 'next/link';
import type { ReactNode } from 'react';

export function Panel({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`panel ${className}`} {...rest}>{children}</div>;
}

export function SectionTitle({ children, kicker, action }: { children: ReactNode; kicker?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        {kicker && <div className="text-[10px] uppercase tracking-[0.18em] text-faint mb-1">{kicker}</div>}
        <h2 className="text-[15px] font-semibold tracking-tight text-text">{children}</h2>
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, tone = 'var(--color-muted)', title, solid = false }: { children: ReactNode; tone?: string; title?: string; solid?: boolean }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider whitespace-nowrap"
      style={solid
        ? { background: tone, color: '#080b10' }
        : { color: tone, background: `color-mix(in oklab, ${tone} 14%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tone} 30%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="panel px-3.5 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-faint">{label}</div>
      <div className="mono-num text-2xl mt-1 leading-none" style={{ color: tone ?? 'var(--color-text)' }}>{value}</div>
      {sub && <div className="text-[11px] text-muted mt-1.5 leading-snug">{sub}</div>}
    </div>
  );
}

export function Trend({ value, suffix = '' }: { value: number; suffix?: string }) {
  const up = value > 0, flat = value === 0;
  const tone = flat ? 'var(--color-faint)' : up ? 'var(--color-high)' : 'var(--color-low)';
  return (
    <span className="mono-num text-[11px] inline-flex items-center gap-0.5" style={{ color: tone }}>
      {flat ? '–' : up ? '▲' : '▼'}{flat ? '' : Math.abs(value)}{suffix}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="panel px-4 py-8 text-center text-[13px] text-faint">
      {children}
    </div>
  );
}

export function LinkCard({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`panel block transition-colors hover:border-[color:var(--color-accent-dim)] ${className}`}>
      {children}
    </Link>
  );
}
