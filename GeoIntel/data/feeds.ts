// Ingestion configuration: direct feeds plus the multilingual query matrix.
//
// Every direct feed here was checked for real <item> content, not just HTTP 200.
// Several official ministry feeds (PRC MOFA, mod.gov.cn, MEA India) advertise RSS
// but serve HTML or maintenance pages, so they are deliberately absent. PRC official
// material is reached through zh-CN aggregator queries instead — see docs/specs.
// `npm run ingest -- --health` re-checks every entry.

export interface DirectFeed {
  id: string;
  url: string;
  outlet: string;
  language: string;
}

/**
 * Official broadcaster video channels, via YouTube's Atom feeds.
 *
 * These carry a mixed diet — a channel's geopolitical reporting alongside its lifestyle
 * and entertainment output. Nothing special filters them: the same relevance gate that
 * drops a bread-dumping story drops a cat feature, because neither names two states nor
 * uses any security vocabulary.
 */
export const VIDEO_FEEDS: DirectFeed[] = [
  { id: 'yt-aljazeera', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCNye-wNBqNL5ZzHSJj3l8Bg', outlet: 'Al Jazeera', language: 'en' },
  { id: 'yt-dw', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCknLrEdhRCp1aegoMqRaCZg', outlet: 'Deutsche Welle', language: 'en' },
  { id: 'yt-scmp', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC4SUWizzKc1tptprBkWjX2Q', outlet: 'South China Morning Post', language: 'en' },
];

export const DIRECT_FEEDS: DirectFeed[] = [
  { id: 'dod', url: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=30', outlet: 'US Department of Defense', language: 'en' },
  { id: 'un-ap', url: 'https://news.un.org/feed/subscribe/en/news/region/asia-pacific/feed/rss.xml', outlet: 'UN News', language: 'en' },
  { id: 'diplomat', url: 'https://thediplomat.com/feed/', outlet: 'The Diplomat', language: 'en' },
  { id: 'aljazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', outlet: 'Al Jazeera', language: 'en' },
  { id: 'bbc-world', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', outlet: 'BBC', language: 'en' },
  { id: 'scmp-china', url: 'https://www.scmp.com/rss/91/feed', outlet: 'South China Morning Post', language: 'en' },
  { id: 'pib', url: 'https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3', outlet: 'Press Information Bureau', language: 'en' },

  // Chinese-language reporting from outlets that are NOT PRC state or state-affiliated.
  // This is the highest-value addition in the whole feed list: without it, Chinese-topic
  // clusters contain only PRC-controlled outlets and can never score on ownership
  // diversity, however many of them repeat the story.
  { id: 'bbc-zh', url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml', outlet: 'BBC', language: 'zh' },
  { id: 'dw-zh', url: 'https://rss.dw.com/rdf/rss-chi-all', outlet: 'Deutsche Welle', language: 'zh' },
  { id: 'rfi-zh', url: 'https://www.rfi.fr/cn/rss', outlet: 'RFI', language: 'zh' },
  { id: 'voa-zh', url: 'https://www.voachinese.com/api/epiqq', outlet: '美国之音', language: 'zh' },
  { id: 'nyt-zh', url: 'https://cn.nytimes.com/rss/', outlet: '纽约时报中文网', language: 'zh' },

  // Independent and public-broadcaster reporting, for country and ownership spread.
  { id: 'guardian', url: 'https://www.theguardian.com/world/rss', outlet: 'The Guardian', language: 'en' },
  { id: 'dw-en', url: 'https://rss.dw.com/rdf/rss-en-world', outlet: 'Deutsche Welle', language: 'en' },
  { id: 'france24', url: 'https://www.france24.com/en/rss', outlet: 'France 24', language: 'en' },
  { id: 'nikkei-asia', url: 'https://asia.nikkei.com/rss/feed/nar', outlet: 'Nikkei Asia', language: 'en' },
  { id: 'yonhap', url: 'https://en.yna.co.kr/RSS/news.xml', outlet: 'Yonhap', language: 'en' },
  // Both 403 from the VPS's IP as of 2026-09-25 — Indian Express (CloudFront) and Dawn
  // (Cloudflare) both flat-block the whole site, not just this feed path, confirmed by
  // hand (both return 200 from a residential connection, so it's IP-reputation blocking
  // of the hosting provider, not a broken URL). Left in place at Josh's call rather than
  // removed: `npm run ingest -- --health` already reports a feed like this as failed
  // without breaking the run, and the block may not be permanent.
  { id: 'indian-express', url: 'https://indianexpress.com/section/india/feed/', outlet: 'The Indian Express', language: 'en' },
  { id: 'dawn', url: 'https://www.dawn.com/feeds/home', outlet: 'Dawn', language: 'en' },

  // Defence and policy analysis. Classed 'analysis' in the registry, so these inform
  // the reader but never count as corroboration.
  { id: 'usni', url: 'https://news.usni.org/feed', outlet: 'USNI News', language: 'en' },
  { id: 'lowy', url: 'https://www.lowyinstitute.org/the-interpreter/rss.xml', outlet: 'Lowy Institute', language: 'en' },
  { id: 'wotr', url: 'https://warontherocks.com/feed/', outlet: 'War on the Rocks', language: 'en' },
];

/** Aggregator locales. `ceid` must match `hl`/`gl` or results silently fall back to en. */
export const LOCALES = {
  'en-IN': { hl: 'en-IN', gl: 'IN', ceid: 'IN:en', language: 'en', label: 'India (English)' },
  'hi-IN': { hl: 'hi', gl: 'IN', ceid: 'IN:hi', language: 'hi', label: 'India (Hindi)' },
  'zh-CN': { hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans', language: 'zh', label: 'China (Simplified)' },
  'zh-TW': { hl: 'zh-TW', gl: 'TW', ceid: 'TW:zh-Hant', language: 'zh', label: 'Taiwan (Traditional)' },
  'ur-PK': { hl: 'ur', gl: 'PK', ceid: 'PK:ur', language: 'ur', label: 'Pakistan (Urdu)' },
  'ru-RU': { hl: 'ru', gl: 'RU', ceid: 'RU:ru', language: 'ru', label: 'Russia (Russian)' },
  'ar-EG': { hl: 'ar', gl: 'EG', ceid: 'EG:ar', language: 'ar', label: 'Middle East (Arabic)' },
  'ja-JP': { hl: 'ja', gl: 'JP', ceid: 'JP:ja', language: 'ja', label: 'Japan (Japanese)' },
  'ko-KR': { hl: 'ko', gl: 'KR', ceid: 'KR:ko', language: 'ko', label: 'Korea (Korean)' },
  'en-US': { hl: 'en-US', gl: 'US', ceid: 'US:en', language: 'en', label: 'United States (English)' },
  'en-GB': { hl: 'en-GB', gl: 'GB', ceid: 'GB:en', language: 'en', label: 'United Kingdom (English)' },
  // Added 2026-09-25, the same principle that added bbc-zh/dw-zh/rfi-zh to DIRECT_FEEDS:
  // a beat that only ever reads one side's own language cannot corroborate across the
  // divide that makes it interesting. Russia–Ukraine had ru-RU and en-GB but no
  // Ukrainian-language source at all; Middle East had ar-EG and en-GB but no
  // Hebrew-language source. Both verified live against Google News RSS before being
  // added: 'iw' (the old ISO code) 302-redirects and returns nothing; 'he' returns 200
  // with real, current items.
  'uk-UA': { hl: 'uk', gl: 'UA', ceid: 'UA:uk', language: 'uk', label: 'Ukraine (Ukrainian)' },
  'he-IL': { hl: 'he', gl: 'IL', ceid: 'IL:he', language: 'he', label: 'Israel (Hebrew)' },
} as const;

export type LocaleKey = keyof typeof LOCALES;

/**
 * How far back an aggregator query may reach.
 *
 * Google News search is ranked by relevance over all time, not by recency. Left
 * unconstrained it returns archives: measured against the live feed, `台海 军演` came
 * back with a median item 242 days old and 97 of 100 results older than a month, and
 * every single `Taiwan Strait PLA incursion` result was older than 30 days, the oldest
 * from 2019. That is how the corpus came to span 23 years.
 *
 * Archival results do not merely add noise — they suppress the corroboration this
 * product is built on. Two reports group into one event only if they fall inside the
 * 60-hour clustering window, so coverage of one event scattered across years can never
 * corroborate itself. The volume looked healthy and was hollow.
 *
 * Seven days is deliberately wider than that 60-hour window: it absorbs feed lag and
 * lets a slow-moving story accumulate reports across several ingests, while staying
 * short enough that last year's coverage of a recurring topic cannot merge into this
 * week's event.
 */
export const QUERY_WINDOW_DAYS = 7;

/** Append the recency operator, unless the caller already pinned its own window. */
export function withRecency(query: string, days = QUERY_WINDOW_DAYS): string {
  return /\bwhen:\d+[dhm]\b/.test(query) ? query : `${query} when:${days}d`;
}

export function googleNewsUrl(query: string, locale: LocaleKey): string {
  const l = LOCALES[locale];
  const q = encodeURIComponent(withRecency(query));
  return `https://news.google.com/rss/search?q=${q}&hl=${l.hl}&gl=${l.gl}&ceid=${l.ceid}`;
}

/**
 * A beat is one watched relationship or theme, queried in every language that has a
 * stake in it. Querying the same event in Chinese and in English is what surfaces
 * divergent framing — and divergence is the signal.
 */
export interface Beat {
  id: string;
  label: string;
  dyad?: [string, string];
  priority: 1 | 2 | 3;
  /**
   * `en` glosses a non-English query in English. The ingest never reads it; Language Lens shows it,
   * because a comparison between languages is only readable alongside what each was actually asked.
   */
  queries: { locale: LocaleKey; q: string; en?: string }[];
}

export const BEATS: Beat[] = [
  {
    id: 'ind-chn', label: 'India–China', dyad: ['IND', 'CHN'], priority: 1,
    queries: [
      { locale: 'en-IN', q: 'India China border LAC' },
      { locale: 'en-IN', q: 'India China relations' },
      { locale: 'zh-CN', q: '中印边境', en: 'China–India border' },
      { locale: 'zh-CN', q: '中印关系', en: 'China–India relations' },
      { locale: 'zh-CN', q: '印度 边界 谈判', en: 'India border negotiations' },
      { locale: 'hi-IN', q: 'भारत चीन सीमा', en: 'India China border' },
      { locale: 'en-US', q: 'India China Himalayan border' },
    ],
  },
  {
    id: 'ind-pak', label: 'India–Pakistan', dyad: ['IND', 'PAK'], priority: 1,
    queries: [
      { locale: 'en-IN', q: 'India Pakistan Line of Control' },
      { locale: 'ur-PK', q: 'بھارت پاکستان کشیدگی', en: 'India Pakistan tension' },
      { locale: 'hi-IN', q: 'भारत पाकिस्तान तनाव', en: 'India Pakistan tension' },
      { locale: 'zh-CN', q: '印巴 冲突', en: 'India–Pakistan conflict' },
    ],
  },
  {
    id: 'chn-twn', label: 'China–Taiwan', dyad: ['CHN', 'TWN'], priority: 1,
    queries: [
      { locale: 'zh-CN', q: '台海 军演', en: 'Taiwan Strait military drills' },
      { locale: 'zh-TW', q: '共機 台海 中線', en: 'Chinese military aircraft, Taiwan Strait, median line' },
      { locale: 'en-US', q: 'Taiwan Strait PLA incursion' },
      { locale: 'ja-JP', q: '台湾海峡 中国軍', en: 'Taiwan Strait, Chinese military' },
    ],
  },
  {
    id: 'chn-usa', label: 'China–United States', dyad: ['CHN', 'USA'], priority: 1,
    queries: [
      { locale: 'en-US', q: 'US China export controls semiconductors' },
      { locale: 'zh-CN', q: '中美关系 出口管制', en: 'China–US relations, export controls' },
      { locale: 'zh-CN', q: '美国 制裁 中国 反制', en: 'US sanctions China, countermeasures' },
    ],
  },
  {
    id: 'scs', label: 'South China Sea', priority: 1,
    queries: [
      { locale: 'en-US', q: 'South China Sea Philippines coast guard' },
      { locale: 'zh-CN', q: '南海 仁爱礁 菲律宾', en: 'South China Sea, Second Thomas Shoal, Philippines' },
      { locale: 'en-GB', q: 'South China Sea freedom of navigation' },
    ],
  },
  {
    id: 'ior', label: 'Indian Ocean & PLAN', priority: 1,
    queries: [
      { locale: 'en-IN', q: 'Chinese navy Indian Ocean research vessel' },
      { locale: 'zh-CN', q: '印度洋 海军 补给', en: 'Indian Ocean, navy, resupply' },
      { locale: 'en-IN', q: 'Gwadar Hambantota port China' },
    ],
  },
  {
    id: 'ind-neighbours', label: 'India’s Neighbourhood', priority: 2,
    queries: [
      { locale: 'en-IN', q: 'Bangladesh Nepal Sri Lanka Maldives India relations' },
      { locale: 'en-IN', q: 'Myanmar border India insurgency' },
      { locale: 'zh-CN', q: '中国 尼泊尔 斯里兰卡 马尔代夫 合作', en: 'China, Nepal, Sri Lanka, Maldives cooperation' },
    ],
  },
  {
    id: 'ind-defence', label: 'India Defence & Security', priority: 1,
    queries: [
      { locale: 'en-IN', q: 'Indian Army Navy Air Force procurement deployment' },
      { locale: 'en-IN', q: 'India defence missile test DRDO' },
      { locale: 'hi-IN', q: 'भारतीय सेना सुरक्षा', en: 'Indian Army security' },
    ],
  },
  {
    id: 'pla', label: 'PLA Activity', priority: 1,
    queries: [
      { locale: 'zh-CN', q: '解放军 演习 战备', en: 'PLA exercises, combat readiness' },
      { locale: 'zh-CN', q: '西部战区', en: 'Western Theatre Command' },
      { locale: 'en-US', q: 'PLA military exercise' },
    ],
  },
  {
    id: 'prc-mofa', label: 'PRC Official Statements', priority: 1,
    queries: [
      { locale: 'zh-CN', q: '外交部 发言人 表示', en: 'Foreign Ministry spokesperson says' },
      { locale: 'zh-CN', q: '严正交涉 抗议', en: 'solemn representations, protest' },
      { locale: 'zh-CN', q: '国防部 回应', en: 'Defence Ministry responds' },
    ],
  },
  {
    id: 'rus-ukr', label: 'Russia–Ukraine', dyad: ['RUS', 'UKR'], priority: 2,
    queries: [
      { locale: 'en-GB', q: 'Ukraine Russia front line' },
      { locale: 'ru-RU', q: 'Украина фронт переговоры', en: 'Ukraine front, negotiations' },
      // Kyiv's own language on its own war, not just Moscow's or the West's — see the
      // note on LOCALES above.
      { locale: 'uk-UA', q: 'Україна Росія фронт переговори', en: 'Ukraine Russia front, negotiations' },
    ],
  },
  {
    id: 'mideast', label: 'Middle East', priority: 2,
    queries: [
      { locale: 'en-GB', q: 'Israel Iran Lebanon escalation' },
      { locale: 'ar-EG', q: 'إسرائيل إيران تصعيد', en: 'Israel Iran escalation' },
      { locale: 'en-GB', q: 'Red Sea Houthi shipping' },
      // Israel's own language, not just the Arabic and Western wire framings — see the
      // note on LOCALES above.
      { locale: 'he-IL', q: 'ישראל איראן לבנון הסלמה', en: 'Israel Iran Lebanon escalation' },
    ],
  },
  {
    id: 'korea', label: 'Korean Peninsula', dyad: ['PRK', 'KOR'], priority: 3,
    queries: [
      { locale: 'ko-KR', q: '북한 미사일 도발', en: 'North Korea missile provocation' },
      { locale: 'en-US', q: 'North Korea missile launch' },
    ],
  },
  {
    id: 'cyber', label: 'Cyber & Information Operations', priority: 2,
    queries: [
      { locale: 'en-US', q: 'state-sponsored cyberattack critical infrastructure' },
      { locale: 'en-IN', q: 'India cyberattack China hackers' },
      { locale: 'zh-CN', q: '网络攻击 黑客 国家', en: 'cyberattack, hackers, state' },
    ],
  },
  {
    id: 'tech', label: 'Technology & Export Controls', priority: 2,
    queries: [
      { locale: 'en-US', q: 'semiconductor export controls entity list' },
      { locale: 'zh-CN', q: '芯片 出口管制 稀土', en: 'chips, export controls, rare earths' },
    ],
  },
];

/** Ad-hoc query set for a country the user searches that no beat covers. */
export function countryQueries(name: string, zhName?: string): { locale: LocaleKey; q: string }[] {
  const out: { locale: LocaleKey; q: string }[] = [
    { locale: 'en-US', q: `${name} security military diplomatic` },
    { locale: 'en-IN', q: `${name} India relations` },
  ];
  if (zhName) out.push({ locale: 'zh-CN', q: `${zhName} 局势` });
  return out;
}
