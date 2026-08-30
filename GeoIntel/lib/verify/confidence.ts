import type { Article, ConfidenceSignal, EventFlag } from '@/lib/types';

export interface Verdict {
  confidence: number;
  signals: ConfidenceSignal[];
  flags: EventFlag[];
}

/** Denial vocabulary. Presence alongside an assertion means the accounts conflict. */
const DENIAL = [
  'denies', 'denied', 'denial', 'rejects', 'rejected', 'refutes', 'refuted',
  'dismissed as', 'no such', 'baseless', 'fabricated', 'false claim', 'disputes',
  '否认', '驳斥', '不实', '谣言', '无中生有',
  'खंडन', 'इनकार', 'опроверг', 'تردید', 'نفی',
];

const ASSERTION = [
  'says', 'said', 'confirmed', 'reported', 'announced', 'claims', 'accused', 'alleges',
  '表示', '证实', '通报', '指责',
];

function has(list: string[], text: string): boolean {
  const lower = text.toLowerCase();
  return list.some((t) => (/^[\x20-\x7F]+$/.test(t) ? lower.includes(t) : text.includes(t)));
}

/**
 * Confidence in an event's *reporting*, never in its truth.
 *
 * The design principle is that repetition is not corroboration. Four outlets owned by
 * one government saying the same thing is one source, and the ownership and country
 * signals are what encode that.
 */
export function scoreConfidence(cluster: Article[]): Verdict {
  const outlets = new Set(cluster.map((a) => a.outlet.toLowerCase()));
  // 'ZZZ' marks an outlet we could not place. Unknown provenance must not be counted
  // as a distinct country — that would let unrecognised sources manufacture the very
  // geographic diversity the signal exists to measure.
  const countries = new Set(cluster.map((a) => a.sourceCountry).filter((c) => c !== 'ZZZ'));
  const unplaced = cluster.filter((a) => a.sourceCountry === 'ZZZ').length;
  const languages = new Set(cluster.map((a) => a.language));
  const ownerships = new Set(cluster.map((a) => a.ownership));
  // Think-tank and research output is commentary on events, not independent reporting
  // of them, so it is excluded from corroboration while still being displayed.
  const independents = cluster.filter(
    (a) => a.ownership === 'independent' || a.ownership === 'public',
  );
  const analyses = cluster.filter((a) => a.ownership === 'analysis');
  const independentOutlets = new Set(independents.map((a) => a.outlet.toLowerCase()));
  const primaries = cluster.filter((a) => a.isPrimary);
  const bestTier = Math.min(...cluster.map((a) => a.tier));

  const signals: ConfidenceSignal[] = [];

  // 1. Independent outlet count — the single strongest signal, capped at 25.
  const nInd = independentOutlets.size;
  const outletPts = nInd === 0 ? 0 : nInd === 1 ? 8 : nInd === 2 ? 15 : nInd === 3 ? 20 : 25;
  signals.push({
    key: 'outlets', label: 'Independent outlets', points: outletPts, max: 25,
    detail: (nInd === 0
      ? `No independent outlet among ${outlets.size} reporting.`
      : `${nInd} independent outlet${nInd > 1 ? 's' : ''} of ${outlets.size} reporting.`)
      + (analyses.length ? ` ${analyses.length} think-tank item(s) present but not counted as corroboration.` : ''),
  });

  // 2. Ownership diversity — guards against single-owner amplification.
  const ownPts = (independents.length > 0 ? 12 : 0) + (ownerships.size >= 2 ? 8 : 0);
  signals.push({
    key: 'ownership', label: 'Ownership diversity', points: ownPts, max: 20,
    detail: `${ownerships.size} ownership class(es): ${[...ownerships].join(', ')}.`,
  });

  // 3. Country diversity — one state's press is one perspective.
  const nC = countries.size;
  const ctryPts = nC <= 1 ? 0 : nC === 2 ? 10 : nC === 3 ? 15 : 20;
  signals.push({
    key: 'countries', label: 'Source-country spread', points: ctryPts, max: 20,
    detail: nC === 0
      ? `No outlet in this cluster could be placed to a country of publication${unplaced ? ` (${unplaced} unrecognised).` : '.'}`
      : `${nC} country/countries of publication: ${[...countries].join(', ')}`
        + (unplaced ? `, plus ${unplaced} unrecognised outlet${unplaced > 1 ? 's' : ''}.` : '.'),
  });

  // 4. Language diversity — cross-language pickup is hard to manufacture.
  const nL = languages.size;
  const langPts = nL <= 1 ? 0 : nL === 2 ? 6 : 10;
  signals.push({
    key: 'languages', label: 'Language spread', points: langPts, max: 10,
    detail: `${nL} language(s): ${[...languages].join(', ')}.`,
  });

  // 5. Primary source present.
  const primPts = primaries.length > 0 ? 15 : 0;
  signals.push({
    key: 'primary', label: 'Primary source', points: primPts, max: 15,
    detail: primaries.length
      ? `Official statement present: ${[...new Set(primaries.map((p) => p.outlet))].join(', ')}.`
      : 'No ministry, military or official statement in the cluster.',
  });

  // 6. Track record of the strongest outlet present.
  const tierPts = bestTier === 1 ? 10 : bestTier === 2 ? 5 : 0;
  signals.push({
    key: 'tier', label: 'Outlet track record', points: tierPts, max: 10,
    detail: `Strongest outlet in cluster is tier ${bestTier}.`,
  });

  let score = signals.reduce((s, x) => s + x.points, 0);

  const flags: EventFlag[] = [];
  if (outlets.size <= 1) flags.push('single_source');
  const stateish = cluster.filter((a) => a.ownership === 'state' || a.ownership === 'state_affiliated');
  if (independents.length === 0 && stateish.length > 0) flags.push('state_media_only');
  if (primaries.length > 0) flags.push('primary_sourced');

  // 7. Contradiction: an assertion in one report and a denial in another.
  const allText = cluster.map((a) => `${a.title} ${a.snippet}`);
  const denies = allText.some((t) => has(DENIAL, t));
  const asserts = allText.some((t) => has(ASSERTION, t));
  if (denies && (asserts || cluster.length > 1)) {
    flags.push('disputed');
    score -= 10;
    signals.push({
      key: 'contradiction', label: 'Contradiction penalty', points: -10, max: 0,
      detail: 'Sources in this cluster assert and deny the same claim. Accounts conflict.',
    });
  }

  const confidence = Math.max(0, Math.min(100, Math.round(score)));
  if (confidence < 30) flags.push('uncorroborated');

  return { confidence, signals, flags };
}
