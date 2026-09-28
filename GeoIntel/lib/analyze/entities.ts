import { COUNTRIES, HOTSPOTS, CN_COMPOUNDS, OWN_NAMES, NO_STATE_NAMES } from '@/data/countries';
import { PEOPLE } from '@/data/people';

const LATIN = /^[\x20-\x7F]+$/;
/** Latin letters with a diacritic — Latin-1 Supplement and Latin Extended-A. */
const LATIN_ACCENTED = /^[\x20-\x7FÀ-ſ]+$/;

/**
 * Accents folded out: "México" becomes "mexico". Only ever applied to the haystack that
 * PLAIN Latin aliases are matched against — NFD would also split Hangul syllables and
 * strip Arabic hamza, so the other scripts keep the unfolded text.
 */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function wordIn(alias: string, haystack: string, sep: string, flags: string): boolean {
  const a = alias.trim().toLowerCase();
  if (!a) return false;
  const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|${sep})${escaped}(${sep}|$)`, flags).test(haystack);
}

/**
 * Alias matching has to work across scripts. Latin aliases need word boundaries or
 * "India" fires on "Indiana"; CJK and Indic scripts have no word boundaries, so those
 * are substring matches. Short aliases like "us" and "lac" are the reason boundaries
 * are mandatory rather than a nicety: a bare substring test finds "us" inside "bus".
 *
 * The non-Latin branch matches the LOWERCASED text, and that word is doing real work.
 * It used to test the raw text, which is identical for every script that has no letter
 * case — Han, Arabic, Devanagari — and wrong for the one on this roster that does.
 * Cyrillic has case, Russian and Ukrainian capitalise surnames, and so all ten Cyrillic
 * aliases here had never matched anything: 'песков' can only fire on text no outlet
 * publishes. Found 2026-09-09 by asking why Peskov was silent in a corpus containing
 * Песков. Lowercasing is a no-op for the caseless scripts, so nothing else changes.
 *
 * It stays a SUBSTRING test rather than gaining word boundaries, for two reasons that
 * pull the same way. Han glues names to their neighbours — 张又侠案 is "the Zhang Youxia
 * case" and must match — and Russian declines them, so Пескова is the genitive of
 * Песков and should match too. Boundaries would break both.
 *
 * Latin aliases come in two kinds (2026-09-28). A PLAIN alias is matched against the text
 * with its accents folded out, so 'mexico' meets "México" and 'iran' meets "Irán" — the
 * Spanish, Portuguese and French press accent names English spells plain. An alias written
 * WITH an accent is matched only against the unfolded text, accent and all: it is written
 * that way precisely because its plain spelling is a common word ('irã', whose plain form
 * would fire on Portuguese "irá", will go). See ROMANCE_NAMES in data/countries.ts.
 */
function matches(alias: string, lower: string, folded: string): boolean {
  if (LATIN.test(alias)) return wordIn(alias, folded, '[^a-z0-9]', 'i');
  if (LATIN_ACCENTED.test(alias)) return wordIn(alias, lower, '[^\\p{L}\\p{N}]', 'iu');
  return lower.includes(alias.toLowerCase());
}

/**
 * Longest first, so "people's republic of china" is claimed before "republic of china".
 * NO_STATE_NAMES ride along with a null state: blanked out, credited to nobody.
 */
const OWN_NAME_PATTERNS = [
  ...Object.entries(OWN_NAMES),
  ...NO_STATE_NAMES.map((name) => [name, null] as const),
]
  .sort(([a], [b]) => b.length - a.length)
  .map(([name, iso]) => ({
    iso,
    re: new RegExp(`(?<![a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'g'),
  }));

/**
 * Credits each state named by one of its OWN_NAMES and blanks the name out, so the other
 * state's alias inside it ("chinese" in "Chinese Taipei") is never seen by the matcher.
 */
function claimOwnNames(lower: string, claimed: Set<string>): string {
  let out = lower;
  for (const { iso, re } of OWN_NAME_PATTERNS) {
    const next = out.replace(re, ' ');
    if (next !== out) {
      if (iso) claimed.add(iso);
      out = next;
    }
  }
  return out;
}

export function extractActors(text: string): string[] {
  const claimed = new Set<string>();
  const lower = claimOwnNames(` ${text.toLowerCase()} `, claimed);
  const folded = fold(lower);
  const raw = text;
  const hits: string[] = [];
  for (const c of COUNTRIES) {
    if (claimed.has(c.iso) || c.aliases.some((a) => matches(a, lower, folded))) hits.push(c.iso);
  }
  for (const [compound, isos] of Object.entries(CN_COMPOUNDS)) {
    if (raw.includes(compound)) hits.push(...isos);
  }
  return [...new Set(hits)];
}

export function extractHotspots(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const folded = fold(lower);
  const hits: string[] = [];
  for (const h of HOTSPOTS) {
    if (h.aliases.some((a) => matches(a, lower, folded))) hits.push(h.id);
  }
  return hits;
}

/**
 * Named officials in a headline. Same alias machinery as extractActors — Latin aliases need
 * word boundaries, CJK and Indic scripts are matched as substrings because they have none.
 *
 * People are returned SEPARATELY from actors and must stay that way. lib/verify/cluster.ts
 * forms events by testing whether two reports share an actor, so folding a person id into
 * that array would change which reports cluster together — the one subsystem on this project
 * whose stability was expensive to win. tests/people.test.ts asserts the separation directly.
 */
export function extractPeople(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const folded = fold(lower);
  const hits: string[] = [];
  for (const p of PEOPLE) {
    if (p.aliases.some((a) => matches(a, lower, folded))) hits.push(p.id);
  }
  return [...new Set(hits)];
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
