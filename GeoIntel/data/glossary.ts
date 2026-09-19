// Plain-language glossary for a reader meeting the site's vocabulary for the first time.
//
// Three rules keep it honest.
//
// 1. It is written from the code, not from memory. The confidence weights come from
//    lib/verify/confidence.ts, the vector mapping from lib/risk, the ownership classes from
//    data/sources.ts, and the network wording from the panels' own `reading` strings — so
//    what the glossary says a number means is what the number is.
// 2. The abbreviations were chosen by measuring the corpus: the acronyms that actually recur
//    in stored headlines, not the ones a geopolitics primer would list. Well-known ones
//    (US, UK, FBI, BBC) are left out on purpose; the page is for the ones a reader has to
//    stop and look up.
// 3. Nothing here can drift silently. tests/glossary.test.ts lists every topic tag, ownership
//    class, event flag and network measure the interface can print, and fails until each has
//    an entry. The escalation ladder and the Chinese terms are NOT copied here at all — they
//    are read from data/glossary.zh.ts, the same file the detector uses.
//
// Ids are the deep links (/glossary#lac) and follow a convention the tests rely on:
// domain-*, owner-*, flag-*, measure-* for the vocabularies above.

import type { GlossCategory } from '@/data/glossary.zh';

export interface GlossEntry {
  /** Lower-case, hyphenated. This is the URL fragment. */
  id: string;
  term: string;
  /** What an abbreviation stands for. */
  expansion?: string;
  meaning: string;
  /** The technical name, for a reader who wants to look it up elsewhere. */
  aka?: string;
}

export interface ConceptGroup {
  id: string;
  title: string;
  intro: string;
  entries: GlossEntry[];
}

// Sorted A–Z; tests/glossary.test.ts enforces it.
export const ABBREVIATIONS: GlossEntry[] = [
  { id: 'adiz', term: 'ADIZ', expansion: 'Air Defence Identification Zone',
    meaning: 'Airspace beyond a country’s territory where it demands to identify every aircraft. Chinese military aircraft entering Taiwan’s ADIZ are counted and reported daily, which is why it appears so often.' },
  { id: 'ajk', term: 'AJK', expansion: 'Azad Jammu and Kashmir',
    meaning: 'The part of Kashmir that Pakistan administers, under Pakistan’s own name for it. India calls the same territory PoK. Which name a source uses tells you which side it is speaking from.' },
  { id: 'asean', term: 'ASEAN', expansion: 'Association of Southeast Asian Nations',
    meaning: 'A ten-member bloc of Southeast Asian states, including Indonesia, Vietnam, the Philippines and Thailand. Central to diplomacy over the South China Sea.' },
  { id: 'bjp', term: 'BJP', expansion: 'Bharatiya Janata Party',
    meaning: 'One of India’s two largest national political parties, and the party of Prime Minister Modi.' },
  { id: 'bla', term: 'BLA', expansion: 'Balochistan Liberation Army',
    meaning: 'A Baloch separatist militant group fighting the Pakistani state in Balochistan. Pakistan has blamed it for attacks, including on targets linked to China.' },
  { id: 'bri', term: 'BRI', expansion: 'Belt and Road Initiative',
    meaning: 'China’s programme, launched in 2013, of financing ports, railways and power plants abroad. India objects to its flagship corridor through Pakistan-administered Kashmir.' },
  { id: 'brics', term: 'BRICS', expansion: 'Brazil, Russia, India, China, South Africa',
    meaning: 'A bloc of large non-Western economies. Membership has grown beyond the original five, and each summit is read as a signal about the global order.' },
  { id: 'bsf', term: 'BSF', expansion: 'Border Security Force',
    meaning: 'India’s paramilitary force guarding the borders with Pakistan and Bangladesh. It is separate from the army.' },
  { id: 'ccp', term: 'CCP', expansion: 'Chinese Communist Party',
    meaning: 'The ruling party of the People’s Republic of China. It sits above the state and the army, so “the Party” and “the government” are not separate voices.' },
  { id: 'cds', term: 'CDS', expansion: 'Chief of Defence Staff',
    meaning: 'India’s top uniformed officer, coordinating the army, navy and air force. A “former CDS” in a headline is a retired officer speaking, not the government.' },
  { id: 'cm', term: 'CM', expansion: 'Chief Minister',
    meaning: 'The head of an Indian state government. A Chief Minister speaks for a state, not for the national government in Delhi.' },
  { id: 'crpf', term: 'CRPF', expansion: 'Central Reserve Police Force',
    meaning: 'India’s largest paramilitary force, used for internal security, including in Jammu and Kashmir.' },
  { id: 'dprk', term: 'DPRK', expansion: 'Democratic People’s Republic of Korea',
    meaning: 'North Korea’s official name. Kautilya’s three-letter code for it is PRK.' },
  { id: 'drdo', term: 'DRDO', expansion: 'Defence Research and Development Organisation',
    meaning: 'India’s state agency for developing weapons and military technology, such as missiles. A DRDO test is an Indian capability announcement.' },
  { id: 'duv-euv', term: 'DUV/EUV', expansion: 'Deep / Extreme Ultraviolet lithography',
    meaning: 'The light used in the machines that print advanced computer chips. Those machines, chiefly from the Dutch company ASML, are under export controls aimed at China, which is why chip news counts as geopolitics.' },
  { id: 'eu', term: 'EU', expansion: 'European Union',
    meaning: 'A political and economic bloc of European states that can impose sanctions and trade measures as one.' },
  { id: 'fm', term: 'FM', expansion: 'Foreign Minister',
    meaning: 'A government’s chief diplomat. In Chinese headlines, 外长 is the same office.' },
  { id: 'fo', term: 'FO', expansion: 'Foreign Office',
    meaning: 'Pakistan’s name for its foreign ministry. The “FO spokesperson” gives its weekly briefing, an official primary source.' },
  { id: 'g20', term: 'G20', expansion: 'Group of Twenty',
    meaning: 'A forum of the world’s largest economies, with the EU and African Union. Its summits are where leaders meet without a bilateral agenda.' },
  { id: 'iaea', term: 'IAEA', expansion: 'International Atomic Energy Agency',
    meaning: 'The UN-linked nuclear watchdog. It inspects nuclear programmes, most often Iran’s, and its reports are read as evidence of intent.' },
  { id: 'iaf', term: 'IAF', expansion: 'Indian Air Force',
    meaning: 'India’s air force. Israeli sources use the same letters for their own air force, so the country in the headline decides.' },
  { id: 'icc', term: 'ICC', expansion: 'International Criminal Court',
    meaning: 'The court at The Hague that tries war crimes. In sport-adjacent India–Pakistan stories the same letters can mean the International Cricket Council.' },
  { id: 'idf', term: 'IDF', expansion: 'Israel Defense Forces',
    meaning: 'Israel’s armed forces — army, air force and navy together.' },
  { id: 'irgc', term: 'IRGC', expansion: 'Islamic Revolutionary Guard Corps',
    meaning: 'Iran’s elite force, separate from the regular army, which controls much of Iran’s missile programme and its partner forces abroad.' },
  { id: 'ispr', term: 'ISPR', expansion: 'Inter-Services Public Relations',
    meaning: 'The Pakistani military’s media wing. Its statements are the army’s official voice: a primary source, not independent reporting.' },
  { id: 'iwt', term: 'IWT', expansion: 'Indus Waters Treaty',
    meaning: 'The 1960 agreement sharing the Indus river system between India and Pakistan. It has held through several wars, so any move against it is read as a serious signal.' },
  { id: 'lac', term: 'LAC', expansion: 'Line of Actual Control',
    meaning: 'The de facto, unmarked and disputed frontier between India and China. It is not an agreed border, which is why patrols can meet on land each side considers its own. The 2020 Galwan clash happened along it.' },
  { id: 'loc', term: 'LoC', expansion: 'Line of Control',
    meaning: 'The military ceasefire line dividing Indian-administered from Pakistan-administered Kashmir. The India–Pakistan counterpart of the LAC; the two are easy to confuse.' },
  { id: 'mea', term: 'MEA', expansion: 'Ministry of External Affairs',
    meaning: 'India’s foreign ministry. Its spokesperson’s briefing is where India’s official position is set out, so it counts as a primary source.' },
  { id: 'mofa', term: 'MOFA', expansion: 'Ministry of Foreign Affairs',
    meaning: 'Used for several governments’ foreign ministries. Most often here it is China’s (外交部), whose spokesperson’s daily briefing is where escalation-ladder formulae usually appear first; it can also mean Taiwan’s.' },
  { id: 'nato', term: 'NATO', expansion: 'North Atlantic Treaty Organization',
    meaning: 'The Western military alliance, built on the promise that an attack on one member is an attack on all.' },
  { id: 'nia', term: 'NIA', expansion: 'National Investigation Agency',
    meaning: 'India’s federal agency for terrorism cases. An NIA charge sheet often names a foreign link.' },
  { id: 'notam', term: 'NOTAM', expansion: 'Notice to Air Missions',
    meaning: 'An official warning to pilots that airspace will be restricted. Often the first public hint of a missile test or a military exercise.' },
  { id: 'nsa', term: 'NSA', expansion: 'National Security Adviser, or National Security Agency',
    meaning: 'In Indian headlines, the prime minister’s senior security aide; in American ones, the signals-intelligence agency. The country decides which.' },
  { id: 'paf', term: 'PAF', expansion: 'Pakistan Air Force',
    meaning: 'Pakistan’s air force, the counterpart of India’s IAF in any India–Pakistan air story.' },
  { id: 'pla', term: 'PLA', expansion: 'People’s Liberation Army',
    meaning: 'China’s armed forces, including its navy (PLAN) and air force (PLAAF). It belongs to the Communist Party rather than to the state.' },
  { id: 'pm', term: 'PM', expansion: 'Prime Minister',
    meaning: 'The head of government in a parliamentary system, as distinct from a president who may be head of state.' },
  { id: 'pok', term: 'PoK', expansion: 'Pakistan-occupied Kashmir',
    meaning: 'India’s name for the Pakistan-administered part of Kashmir. Pakistan calls it AJK. Using either term is itself a position.' },
  { id: 'prc', term: 'PRC', expansion: 'People’s Republic of China',
    meaning: 'The government of mainland China. Used to be precise when Taiwan, formally the Republic of China, is part of the story.' },
  { id: 'sco', term: 'SCO', expansion: 'Shanghai Cooperation Organisation',
    meaning: 'A Eurasian security and economic grouping that includes China, Russia, India and Pakistan.' },
  { id: 'tb2', term: 'TB2', expansion: 'Bayraktar TB2',
    meaning: 'A Turkish armed drone, widely exported and used in several recent wars. Its appearance in a story usually signals a Turkish arms relationship.' },
  { id: 'uav', term: 'UAV', expansion: 'Unmanned aerial vehicle',
    meaning: 'A drone: an aircraft flown without a pilot on board. Armed ones are the kind behind most strike and border-incursion headlines.' },
  { id: 'un', term: 'UN', expansion: 'United Nations',
    meaning: 'The body whose Security Council can authorise sanctions and force, subject to a veto by any of its five permanent members.' },
  { id: 'unclos', term: 'UNCLOS', expansion: 'UN Convention on the Law of the Sea',
    meaning: 'The 1982 treaty on ocean rights, including 200-mile exclusive economic zones. The 2016 ruling against China’s South China Sea claims was made under it.' },
  { id: 'unifil', term: 'UNIFIL', expansion: 'UN Interim Force in Lebanon',
    meaning: 'The UN peacekeeping force on the Israel–Lebanon border. Incidents involving it are read as signs of escalation there.' },
  { id: 'vlcc', term: 'VLCC', expansion: 'Very Large Crude Carrier',
    meaning: 'A supertanker carrying around two million barrels of oil. Their passage through the Strait of Hormuz is watched for signs of disruption.' },
];

export const CONCEPT_GROUPS: ConceptGroup[] = [
  {
    id: 'reading-the-evidence',
    title: 'How Kautilya judges reporting',
    intro: 'Kautilya scores how well a story is reported, never whether it is true. These are the words it uses to do that.',
    entries: [
      { id: 'event', term: 'Event',
        meaning: 'A cluster of articles about the same development, from different outlets and often different languages. Everything on the site is built from events, and each one links back to the headlines that formed it.' },
      { id: 'corroboration', term: 'Corroboration',
        meaning: 'Independent confirmation. An outlet only corroborates another if it is independent of it: five outlets owned by one government are one source, not five. Think-tank commentary is shown but never counted.' },
      { id: 'confidence', term: 'Confidence',
        meaning: 'A 0–100 score for how well an event is reported, not for how likely it is to be true. It adds six signals — independent outlets (up to 25), ownership mix (20), countries of publication (20), an official statement (15), languages (10) and the record of the best outlet (10) — and takes 10 off for a contradiction.' },
      { id: 'provenance', term: 'Provenance',
        meaning: 'Where a report came from and who owns it: the outlet, its country, and whether it is state-run or independent. It is how Kautilya tells a story that started in one government’s media from one that reached independent newsrooms in several countries.' },
      { id: 'primary-source', term: 'Primary source',
        meaning: 'The official statement itself — a ministry, a military or a spokesperson — rather than someone reporting on it. Strong evidence of what a government says, and no evidence at all of whether it is true.' },
      { id: 'source-tier', term: 'Tier',
        meaning: 'A rating of an outlet’s record: tier 1 is a strong record, tier 2 mixed, tier 3 weak. An event takes the best tier among the outlets reporting it.' },
      { id: 'unplaced-outlet', term: 'ZZZ (unplaced outlet)',
        meaning: 'An outlet Kautilya cannot yet tie to a country of publication, shown with the code ZZZ. It is never counted as a separate country, because that would let unrecognised sources manufacture geographic spread.' },
      { id: 'owner-state', term: 'Ownership: state',
        meaning: 'Owned or run by a government, such as Xinhua. Shows what a government wants said; never counted as independent corroboration.' },
      { id: 'owner-state-affiliated', term: 'Ownership: state-affiliated',
        meaning: 'Supervised by a party or state without being a ministry, such as the Global Times. Treated with the same caution as state media.' },
      { id: 'owner-public', term: 'Ownership: public',
        meaning: 'Publicly funded but protected by an editorial-independence charter, such as the BBC, DW or NHK. Counts as independent.' },
      { id: 'owner-independent', term: 'Ownership: independent',
        meaning: 'Commercially or privately owned, with its own editorial control. The strongest kind of corroboration.' },
      { id: 'owner-tabloid', term: 'Ownership: tabloid',
        meaning: 'Commercial but with low editorial rigour. Treated as weak corroboration.' },
      { id: 'owner-analysis', term: 'Ownership: analysis',
        meaning: 'Think tanks and research institutes. They comment on events rather than witnessing them, so they are shown but never counted as corroboration.' },
      { id: 'flag-single-source', term: 'Flag: single source',
        meaning: 'Only one outlet reports this. Treat it as a claim, not yet a fact.' },
      { id: 'flag-state-media-only', term: 'Flag: state media only',
        meaning: 'Every report comes from government-run or party-supervised outlets. It shows what a government is saying, not that anyone independent has confirmed it.' },
      { id: 'flag-disputed', term: 'Flag: disputed',
        meaning: 'Sources in the same event assert and deny the same claim, so the accounts conflict. Confidence drops by 10 points.' },
      { id: 'flag-uncorroborated', term: 'Flag: uncorroborated',
        meaning: 'Confidence is below 30: too little independent confirmation to lean on.' },
      { id: 'flag-primary-sourced', term: 'Flag: primary sourced',
        meaning: 'An official statement — a ministry, a military or a spokesperson — is part of the event.' },
    ],
  },
  {
    id: 'measuring-tension',
    title: 'How Kautilya measures tension',
    intro: 'The numbers on the Threat Board, the dashboard and the country pages.',
    entries: [
      { id: 'escalation-score', term: 'Escalation score',
        meaning: 'How strongly the wording of an event points toward conflict (up to +100) or away from it (down to −100). A peace summit scores negative; troops crossing a border score high.' },
      { id: 'framing', term: 'Framing',
        meaning: 'Wording that asserts a position rather than only reporting, such as calling Arunachal Pradesh “Southern Tibet”. A government’s choice of name is itself a claim, so loaded wording is scored.' },
      { id: 'risk-index', term: 'Risk index',
        aka: 'composite risk',
        meaning: 'A 0–100 score for a country: how much recent, well-corroborated escalation involves it. Confidence gates it, so one dramatic single-source claim moves it far less than a corroborated one, and it has diminishing returns — the gap between 0 and 5 incidents matters more than between 20 and 30.' },
      { id: 'risk-vector', term: 'Risk vector',
        meaning: 'One of the six strands a country’s risk is split into: Military, Economic, Cyber, Internal, Diplomatic and Energy. Maritime, Nuclear and Space events count toward Military; Technology events count toward Economic.' },
      { id: 'half-life', term: 'Half-life',
        meaning: 'How quickly an event stops counting. Its weight halves every 14 days, so a three-week-old incident does not read as today’s risk.' },
      { id: 'trend', term: 'Trend',
        meaning: 'The change in a country’s score, in points, comparing the last 30 days with the period before.' },
      { id: 'dyad', term: 'Dyad',
        meaning: 'A pair of states treated as one relationship, such as India–China. Kautilya scores the tension in each pair and marks the events that moved it.' },
      { id: 'hotspot', term: 'Hotspot',
        meaning: 'A named flashpoint that is not itself a state — the Line of Actual Control, Doklam, the Taiwan Strait. Kautilya uses hotspots to decide which pair of states an event belongs to.' },
      { id: 'escalation-ladder', term: 'Escalation ladder',
        meaning: 'The fixed sequence of formulae Beijing uses in official statements, from “expresses concern” to “do not say you were not forewarned”. Which rung is used matters more than how loudly or often. The full ladder is below.' },
      { id: 'rung', term: 'Rung',
        meaning: 'One step on the escalation ladder, numbered from 1 (the mildest) to 13. A country or relationship “moving up” is a new, higher rung than it used before.' },
    ],
  },
  {
    id: 'topics',
    title: 'Topics',
    intro: 'Every event is tagged with one topic. Six of these are also the risk vectors above.',
    entries: [
      { id: 'domain-military', term: 'Military', meaning: 'Force and the threat of it: clashes, troop movements, strikes, exercises and deployments.' },
      { id: 'domain-maritime', term: 'Maritime', meaning: 'Seas and shipping: naval activity, coast guards, disputed waters and choke points such as the Strait of Hormuz.' },
      { id: 'domain-cyber', term: 'Cyber', meaning: 'Hacking, network attacks and cyber-espionage.' },
      { id: 'domain-economic', term: 'Economic', meaning: 'Sanctions, tariffs, trade restrictions, supply chains and finance used as pressure.' },
      { id: 'domain-energy', term: 'Energy', meaning: 'Oil, gas, pipelines and power, and the routes they travel.' },
      { id: 'domain-space', term: 'Space', meaning: 'Satellites, anti-satellite weapons and launches with a security use.' },
      { id: 'domain-nuclear', term: 'Nuclear', meaning: 'Nuclear weapons, tests, doctrine and the diplomacy around nuclear programmes.' },
      { id: 'domain-diplomatic', term: 'Diplomatic', meaning: 'Talks, summits, protests, expulsions, treaties and official statements between governments.' },
      { id: 'domain-internal', term: 'Internal', meaning: 'Unrest and security inside a state: protests, insurgencies, coups and crackdowns.' },
      { id: 'domain-technology', term: 'Technology', meaning: 'Chips, AI and export controls: technology treated as a strategic asset.' },
    ],
  },
  {
    id: 'codes',
    title: 'Countries and codes',
    intro: 'How places and parties are named on the site.',
    entries: [
      { id: 'iso3', term: 'Country code',
        aka: 'ISO 3166-1 alpha-3',
        meaning: 'Three letters standing for a country: CHN for China, IND for India, USA for the United States, PAK for Pakistan. They let a relationship be named compactly, as IND–CHN.' },
      { id: 'actor', term: 'Actor',
        meaning: 'A state an event involves, tagged from the text of the reports rather than assumed. An event can have several.' },
    ],
  },
  {
    id: 'watching',
    title: 'Watching and alerts',
    intro: 'For readers who follow particular countries, relationships or people.',
    entries: [
      { id: 'watchlist', term: 'Watchlist',
        meaning: 'The countries, relationships and people you have pinned. Pins stay on your device until you sign in, and then follow your account across machines.' },
      { id: 'ladder-alert', term: 'Ladder alert',
        meaning: 'An email, for a Desk Pro reader who has opted in, when a watched country or relationship moves up the PRC ladder. Repeating a rung it has already used does not trigger one.' },
    ],
  },
];

/**
 * The measures printed beside the network graph and on the person pages. `term` matches the
 * panel's own label exactly — tests/glossary.test.ts reads the labels out of the panels and
 * fails on any that is missing here. `aka` is the name a network scientist would use.
 */
export const NETWORK_MEASURES: GlossEntry[] = [
  { id: 'measure-connections', term: 'Connections', aka: 'degree',
    meaning: 'How many other states share at least one event with this one. A count of relationships, not of their strength.' },
  { id: 'measure-total-friction', term: 'Total friction', aka: 'weighted degree',
    meaning: 'The tension across every connection, added together. Compare it with the risk index: a gap between the two is worth a look.' },
  { id: 'measure-cross-border-friction', term: 'Cross-border friction', aka: 'weighted degree, excluding the home tie',
    meaning: 'The same total for a person, but leaving out their own country. The home tie says who someone is, not where they are active.' },
  { id: 'measure-brokerage', term: 'Brokerage', aka: 'betweenness centrality',
    meaning: 'How often a state lies on the shortest route between two others. A high rank means it connects disputes that otherwise would not touch.' },
  { id: 'measure-contagion-exposure', term: 'Contagion exposure', aka: 'eigenvector centrality',
    meaning: 'Being embroiled with states that are themselves embroiled, rather than merely with many. High exposure means trouble nearby is likely to reach it.' },
  { id: 'measure-reach', term: 'Reach', aka: 'closeness centrality',
    meaning: 'How near a state sits to the rest of the network along the strongest available paths. High reach means few steps from almost anywhere.' },
  { id: 'measure-entanglement', term: 'Entanglement', aka: 'clustering coefficient',
    meaning: 'Whether a state’s counterparts are also in dispute with each other. High: one entangled theatre. Low: separate fronts that do not feed one another.' },
  { id: 'measure-core-depth', term: 'Core depth', aka: 'k-core',
    meaning: 'How deep a state sits inside the densely connected middle of the network. Higher means further from the periphery.' },
  { id: 'measure-conflict-cluster', term: 'Conflict cluster',
    meaning: 'A group of states most embroiled with one another. These are mutual antagonists, not a bloc or an alliance.' },
];

/** Section headings for the Chinese terms page, one per category in data/glossary.zh.ts. */
export const ZH_CATEGORY_LABELS: Record<GlossCategory, { label: string; blurb: string }> = {
  territorial: { label: 'Territory and borders',
    blurb: 'Names for disputed places and lines. Which name a government uses is itself a claim.' },
  framing: { label: 'Framing and sovereignty language',
    blurb: 'Words that assert a position. What a government calls something tells you where it stands.' },
  military: { label: 'Military and security',
    blurb: 'Forces, weapons, exercises and the vocabulary of confrontation.' },
  diplomatic: { label: 'Diplomacy and statements',
    blurb: 'The language of talks, protests and official positions.' },
  economic: { label: 'Economy and technology',
    blurb: 'Trade, sanctions, supply chains and the technology contest.' },
  org: { label: 'Institutions and bodies',
    blurb: 'The ministries, commands and organisations that issue statements.' },
};

export function allEntries(): GlossEntry[] {
  return [...ABBREVIATIONS, ...CONCEPT_GROUPS.flatMap((g) => g.entries), ...NETWORK_MEASURES];
}
