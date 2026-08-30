import { COUNTRIES, HOTSPOTS, CN_COMPOUNDS } from '@/data/countries';

const LATIN = /^[\x20-\x7F]+$/;

/**
 * Alias matching has to work across scripts. Latin aliases need word boundaries or
 * "India" fires on "Indiana"; CJK and Indic scripts have no word boundaries, so those
 * are substring matches. Short aliases like "us" and "lac" are the reason boundaries
 * are mandatory rather than a nicety: a bare substring test finds "us" inside "bus".
 */
function matches(alias: string, haystackLower: string, haystackRaw: string): boolean {
  if (!LATIN.test(alias)) return haystackRaw.includes(alias);
  const a = alias.trim().toLowerCase();
  if (!a) return false;
  const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystackLower);
}

export function extractActors(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const raw = text;
  const hits: string[] = [];
  for (const c of COUNTRIES) {
    if (c.aliases.some((a) => matches(a, lower, raw))) hits.push(c.iso);
  }
  for (const [compound, isos] of Object.entries(CN_COMPOUNDS)) {
    if (raw.includes(compound)) hits.push(...isos);
  }
  return [...new Set(hits)];
}

export function extractHotspots(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const raw = text;
  const hits: string[] = [];
  for (const h of HOTSPOTS) {
    if (h.aliases.some((a) => matches(a, lower, raw))) hits.push(h.id);
  }
  return hits;
}

/**
 * A hotspot implies its parties even when the text never names them: a piece about
 * Galwan is an India-China item whether or not both states are mentioned.
 */
export function resolveActors(text: string): { actors: string[]; hotspots: string[] } {
  const hotspots = extractHotspots(text);
  const direct = extractActors(text);
  const implied = hotspots.flatMap((id) => HOTSPOTS.find((h) => h.id === id)?.parties ?? []);
  return { actors: [...new Set([...direct, ...implied])], hotspots };
}

/** Ordered, deduplicated dyad key so IND/CHN and CHN/IND are the same relationship. */
export function dyadKey(a: string, b: string): string {
  return [a, b].sort().join('-');
}

export function dyadsFrom(actors: string[]): string[] {
  const out: string[] = [];
  const sorted = [...new Set(actors)].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) out.push(dyadKey(sorted[i], sorted[j]));
  }
  return out;
}
