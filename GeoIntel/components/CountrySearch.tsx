'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export interface SearchCountry { iso: string; name: string; region: string; aliases: string[] }

/**
 * Search accepts native-script names too — typing 中国 or भारत finds the country,
 * because an analyst reading a Chinese source shouldn't have to translate first.
 */
export function CountrySearch({ countries, className = '' }: { countries: SearchCountry[]; className?: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return countries
      .map((c) => {
        const name = c.name.toLowerCase();
        let score = 0;
        if (name === s || c.iso.toLowerCase() === s) score = 100;
        else if (name.startsWith(s)) score = 80;
        else if (name.includes(s)) score = 60;
        else if (c.aliases.some((a) => a.toLowerCase().startsWith(s))) score = 55;
        else if (c.aliases.some((a) => a.includes(q.trim()))) score = 50;
        return { c, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.c);
  }, [q, countries]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const go = (iso: string) => {
    setOpen(false); setQ('');
    router.push(`/country/${iso}`);
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setCursor(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
          if (e.key === 'Enter' && results[cursor]) go(results[cursor].iso);
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Search a country — India, 中国, भारत…"
        aria-label="Search countries"
        className="w-full rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-panel)] px-3 py-1.5 text-[12.5px] text-text placeholder:text-faint outline-none focus:border-[color:var(--color-accent-dim)]"
      />
      {open && results.length > 0 && (
        <ul className="panel absolute z-50 mt-1 w-full overflow-hidden p-1 shadow-2xl">
          {results.map((c, i) => (
            <li key={c.iso}>
              <button
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(c.iso)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] ${i === cursor ? 'bg-[color:var(--color-panel-2)] text-[color:var(--color-accent)]' : 'text-text'}`}
              >
                <span className="mono-num text-[10px] text-faint">{c.iso}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-[10px] text-faint">{c.region}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
