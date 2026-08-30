// Source registry.
//
// The verification engine is only as honest as this table. Ownership class is the
// single most important field: five state outlets from one country repeating a claim
// is not corroboration, and the engine must be able to tell that apart from five
// independent outlets in five countries.
//
// Classes:
//   state            - owned/operated by a government (Xinhua, PIB, TASS)
//   state_affiliated - editorially controlled or party-supervised but not a ministry
//   public           - publicly funded with editorial independence charter (BBC, DW, NHK)
//   independent      - commercial/private with independent editorial control
//   tabloid          - commercial but low editorial rigour; treated as weak corroboration
//   analysis         - think tanks and research institutes. Commentary on events, not
//                      witnesses to them, so they never count as corroboration.

export type Ownership =
  | 'state' | 'state_affiliated' | 'public' | 'independent' | 'tabloid' | 'analysis';

export interface SourceMeta {
  /** Match keys — substrings tested against the outlet name RSS gives us. */
  match: string[];
  name: string;
  country: string;   // ISO3
  language: string;
  ownership: Ownership;
  /** 1 = strong record, 2 = mixed, 3 = weak. Feeds the confidence score. */
  tier: 1 | 2 | 3;
  /** True for ministries, militaries and official spokespeople. */
  primary?: boolean;
}

export const SOURCES: SourceMeta[] = [
  // ---- China: state and party ----
  { match: ['xinhua', '新华社', '新华网'], name: 'Xinhua', country: 'CHN', language: 'zh', ownership: 'state', tier: 2, primary: true },
  { match: ['people\'s daily', '人民日报', '人民网'], name: "People's Daily", country: 'CHN', language: 'zh', ownership: 'state', tier: 2, primary: true },
  { match: ['global times', '环球时报', '环球网'], name: 'Global Times', country: 'CHN', language: 'zh', ownership: 'state_affiliated', tier: 3 },
  { match: ['cctv', '央视', '中央电视台'], name: 'CCTV', country: 'CHN', language: 'zh', ownership: 'state', tier: 2 },
  { match: ['cgtn'], name: 'CGTN', country: 'CHN', language: 'en', ownership: 'state', tier: 3 },
  { match: ['china daily', '中国日报'], name: 'China Daily', country: 'CHN', language: 'en', ownership: 'state', tier: 2 },
  { match: ['解放军报', 'pla daily', '中国军网'], name: 'PLA Daily', country: 'CHN', language: 'zh', ownership: 'state', tier: 2, primary: true },
  { match: ['观察者网', 'guancha', '风闻'], name: 'Guancha', country: 'CHN', language: 'zh', ownership: 'state_affiliated', tier: 3 },
  { match: ['澎湃', 'thepaper'], name: 'The Paper (澎湃新闻)', country: 'CHN', language: 'zh', ownership: 'state_affiliated', tier: 2 },
  { match: ['财新', 'caixin'], name: 'Caixin', country: 'CHN', language: 'zh', ownership: 'independent', tier: 1 },
  { match: ['南华早报', 'south china morning post', 'scmp'], name: 'South China Morning Post', country: 'HKG', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['联合早报', 'zaobao'], name: 'Lianhe Zaobao', country: 'SGP', language: 'zh', ownership: 'independent', tier: 1 },
  { match: ['中央社', 'cna', 'focus taiwan'], name: 'CNA Taiwan', country: 'TWN', language: 'zh', ownership: 'public', tier: 1 },
  { match: ['自由时报', 'liberty times'], name: 'Liberty Times', country: 'TWN', language: 'zh', ownership: 'independent', tier: 2 },

  // ---- India ----
  { match: ['pib', 'press information bureau'], name: 'Press Information Bureau', country: 'IND', language: 'en', ownership: 'state', tier: 2, primary: true },
  { match: ['the hindu'], name: 'The Hindu', country: 'IND', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['indian express'], name: 'The Indian Express', country: 'IND', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['times of india', 'toi'], name: 'The Times of India', country: 'IND', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['hindustan times'], name: 'Hindustan Times', country: 'IND', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['ndtv'], name: 'NDTV', country: 'IND', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['the print', 'theprint'], name: 'ThePrint', country: 'IND', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['the wire'], name: 'The Wire', country: 'IND', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['economic times'], name: 'The Economic Times', country: 'IND', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['firstpost'], name: 'Firstpost', country: 'IND', language: 'en', ownership: 'independent', tier: 3 },
  { match: ['republic world', 'zee news', 'times now'], name: 'Indian broadcast (partisan)', country: 'IND', language: 'en', ownership: 'tabloid', tier: 3 },
  { match: ['ani', 'asian news international'], name: 'ANI', country: 'IND', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['dainik', 'amar ujala', 'navbharat', 'jagran'], name: 'Hindi press', country: 'IND', language: 'hi', ownership: 'independent', tier: 2 },

  // ---- Pakistan / South Asia ----
  { match: ['dawn'], name: 'Dawn', country: 'PAK', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['the express tribune'], name: 'Express Tribune', country: 'PAK', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['geo news', 'geo.tv'], name: 'Geo News', country: 'PAK', language: 'ur', ownership: 'independent', tier: 2 },
  { match: ['the nation', 'app.com.pk'], name: 'APP / The Nation', country: 'PAK', language: 'en', ownership: 'state', tier: 3, primary: true },
  { match: ['daily star', 'prothom alo'], name: 'Bangladesh press', country: 'BGD', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['kathmandu post', 'the himalayan'], name: 'Nepal press', country: 'NPL', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['daily mirror', 'ada derana', 'colombo'], name: 'Sri Lanka press', country: 'LKA', language: 'en', ownership: 'independent', tier: 2 },

  // ---- Wires and international ----
  { match: ['reuters'], name: 'Reuters', country: 'GBR', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['associated press', 'ap news', 'apnews'], name: 'Associated Press', country: 'USA', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['agence france', 'afp'], name: 'AFP', country: 'FRA', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['bloomberg'], name: 'Bloomberg', country: 'USA', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['financial times', 'ft.com'], name: 'Financial Times', country: 'GBR', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['wall street journal', 'wsj'], name: 'Wall Street Journal', country: 'USA', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['new york times', 'nytimes'], name: 'The New York Times', country: 'USA', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['washington post'], name: 'The Washington Post', country: 'USA', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['the guardian'], name: 'The Guardian', country: 'GBR', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['bbc'], name: 'BBC', country: 'GBR', language: 'en', ownership: 'public', tier: 1 },
  { match: ['dw.com', 'deutsche welle', 'dw '], name: 'Deutsche Welle', country: 'DEU', language: 'en', ownership: 'public', tier: 1 },
  { match: ['rfi', 'radio france'], name: 'RFI', country: 'FRA', language: 'zh', ownership: 'public', tier: 1 },
  { match: ['voice of america', 'voa'], name: 'VOA', country: 'USA', language: 'en', ownership: 'state', tier: 2 },
  { match: ['radio free asia', 'rfa'], name: 'Radio Free Asia', country: 'USA', language: 'zh', ownership: 'state', tier: 2 },
  { match: ['nikkei'], name: 'Nikkei', country: 'JPN', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['kyodo', 'nhk', 'japan times', 'asahi', 'yomiuri'], name: 'Japanese press', country: 'JPN', language: 'ja', ownership: 'independent', tier: 1 },
  { match: ['yonhap', 'korea herald', 'chosun'], name: 'Korean press', country: 'KOR', language: 'ko', ownership: 'independent', tier: 1 },
  { match: ['al jazeera'], name: 'Al Jazeera', country: 'QAT', language: 'en', ownership: 'state_affiliated', tier: 2 },
  { match: ['tass', 'ria novosti', 'sputnik', 'rt.com', 'russia today'], name: 'Russian state media', country: 'RUS', language: 'ru', ownership: 'state', tier: 3 },
  { match: ['the moscow times', 'meduza'], name: 'Russian independent', country: 'RUS', language: 'ru', ownership: 'independent', tier: 2 },
  { match: ['press tv', 'irna', 'tasnim', 'mehr news'], name: 'Iranian state media', country: 'IRN', language: 'fa', ownership: 'state', tier: 3 },
  { match: ['anadolu', 'trt', 'daily sabah'], name: 'Turkish state media', country: 'TUR', language: 'en', ownership: 'state_affiliated', tier: 3 },
  { match: ['abc.net.au', 'sydney morning herald', 'the australian'], name: 'Australian press', country: 'AUS', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['cnn', 'nbc news', 'cbs news', 'abc news', 'politico', 'axios', 'the hill'], name: 'US press', country: 'USA', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['fox news', 'newsweek', 'daily mail', 'the sun', 'express.co.uk'], name: 'Tabloid / partisan', country: 'USA', language: 'en', ownership: 'tabloid', tier: 3 },
  { match: ['defense news', 'janes', 'breaking defense'], name: 'Defence trade press', country: 'USA', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['war on the rocks'], name: 'War on the Rocks', country: 'USA', language: 'en', ownership: 'analysis', tier: 1 },
  { match: ['the diplomat'], name: 'The Diplomat', country: 'USA', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['nikkei asia', 'channel news asia', 'straits times'], name: 'Asian regional press', country: 'SGP', language: 'en', ownership: 'independent', tier: 1 },

  // ---- Added from corpus analysis: the outlets actually appearing in ingested data ----
  // Chinese commercial portals are privately owned but operate under content licensing
  // and censorship obligations, so they are state_affiliated rather than independent.
  { match: ['美国之音'], name: 'VOA Chinese', country: 'USA', language: 'zh', ownership: 'state', tier: 2 },
  { match: ['观察者'], name: 'Guancha', country: 'CHN', language: 'zh', ownership: 'state_affiliated', tier: 3 },
  { match: ['搜狐', 'sohu'], name: 'Sohu', country: 'CHN', language: 'zh', ownership: 'state_affiliated', tier: 3 },
  { match: ['qq news', '腾讯'], name: 'Tencent QQ News', country: 'CHN', language: 'zh', ownership: 'state_affiliated', tier: 3 },
  { match: ['凤凰网', 'ifeng'], name: 'Phoenix (Ifeng)', country: 'CHN', language: 'zh', ownership: 'state_affiliated', tier: 3 },
  { match: ['京报网', '北京日报'], name: 'Beijing Daily', country: 'CHN', language: 'zh', ownership: 'state', tier: 2 },
  { match: ['新京报'], name: 'Beijing News', country: 'CHN', language: 'zh', ownership: 'state_affiliated', tier: 2 },
  { match: ['香港01', 'hk01'], name: 'HK01', country: 'HKG', language: 'zh', ownership: 'independent', tier: 2 },
  { match: ['纽约时报中文网'], name: 'NYT Chinese', country: 'USA', language: 'zh', ownership: 'independent', tier: 1 },
  { match: ['网易', 'netease'], name: 'NetEase', country: 'CHN', language: 'zh', ownership: 'state_affiliated', tier: 3 },
  { match: ['新浪', 'sina'], name: 'Sina', country: 'CHN', language: 'zh', ownership: 'state_affiliated', tier: 3 },
  { match: ['习近平外交思想'], name: 'Xi Jinping Thought on Diplomacy (official)', country: 'CHN', language: 'zh', ownership: 'state', tier: 2, primary: true },
  { match: ['中华军事', '中国军网'], name: 'China Military Online', country: 'CHN', language: 'zh', ownership: 'state', tier: 2, primary: true },
  { match: ['中国网', 'china.org'], name: 'China.org.cn', country: 'CHN', language: 'zh', ownership: 'state', tier: 2 },
  { match: ['财联社', '第一财经'], name: 'Cailianshe / Yicai', country: 'CHN', language: 'zh', ownership: 'state_affiliated', tier: 2 },
  { match: ['大纪元', 'epoch times'], name: 'Epoch Times', country: 'USA', language: 'zh', ownership: 'tabloid', tier: 3 },
  { match: ['太報', 'taisounds', '自由軍武'], name: 'Taiwan digital press', country: 'TWN', language: 'zh', ownership: 'independent', tier: 3 },
  { match: ['朝日新聞', '日本経済新聞', '読売新聞', '産経'], name: 'Japanese national press', country: 'JPN', language: 'ja', ownership: 'independent', tier: 1 },
  { match: ['france 24', 'france24'], name: 'France 24', country: 'FRA', language: 'en', ownership: 'public', tier: 1 },
  { match: ['cnbc'], name: 'CNBC', country: 'USA', language: 'en', ownership: 'independent', tier: 2 },

  // Indian outlets seen in the corpus.
  { match: ['india today'], name: 'India Today', country: 'IND', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['news18'], name: 'News18', country: 'IND', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['wion'], name: 'WION', country: 'IND', language: 'en', ownership: 'independent', tier: 3 },
  { match: ['etv bharat'], name: 'ETV Bharat', country: 'IND', language: 'en', ownership: 'independent', tier: 3 },
  { match: ['abp news', 'aaj tak', 'india tv'], name: 'Indian Hindi broadcast', country: 'IND', language: 'hi', ownership: 'independent', tier: 3 },
  { match: ['moneycontrol', 'business standard', 'mint'], name: 'Indian business press', country: 'IND', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['frontline'], name: 'Frontline', country: 'IND', language: 'en', ownership: 'independent', tier: 1 },
  { match: ['swarajya', 'opindia'], name: 'Indian opinion press', country: 'IND', language: 'en', ownership: 'tabloid', tier: 3 },
  { match: ['eurasian times', 'eurasia review'], name: 'EurAsian Times / Eurasia Review', country: 'IND', language: 'en', ownership: 'tabloid', tier: 3 },

  // Research institutes. Commentary, not reporting — see the 'analysis' class above.
  { match: ['orfonline', 'observer research'], name: 'Observer Research Foundation', country: 'IND', language: 'en', ownership: 'analysis', tier: 1 },
  { match: ['csis', 'center for strategic'], name: 'CSIS', country: 'USA', language: 'en', ownership: 'analysis', tier: 1 },
  { match: ['lowy institute'], name: 'Lowy Institute', country: 'AUS', language: 'en', ownership: 'analysis', tier: 1 },
  { match: ['council on foreign relations', 'foreign affairs'], name: 'Council on Foreign Relations', country: 'USA', language: 'en', ownership: 'analysis', tier: 1 },
  { match: ['usni news', 'naval institute'], name: 'USNI News', country: 'USA', language: 'en', ownership: 'analysis', tier: 1 },
  { match: ['china-global south'], name: 'China-Global South Project', country: 'ZZZ', language: 'en', ownership: 'analysis', tier: 2 },
  { match: ['carnegie', 'brookings', 'chatham house', 'rand corporation', 'stimson', 'idsa', 'manohar parrikar'], name: 'Policy research institute', country: 'ZZZ', language: 'en', ownership: 'analysis', tier: 1 },
  { match: ['indo-pacific defense forum'], name: 'Indo-Pacific Defense FORUM (USINDOPACOM)', country: 'USA', language: 'en', ownership: 'state', tier: 2 },
];

const UNKNOWN: SourceMeta = {
  match: [], name: 'Unknown source', country: 'ZZZ', language: 'en',
  ownership: 'independent', tier: 3,
};

/**
 * Hosts whose URLs are opaque redirects, not publisher addresses.
 * Their base64 paths contain letter sequences that collide with outlet names by pure
 * chance — 'cnn' turns up inside Google News tokens often enough to have mislabelled
 * Chinese-language articles as US press. Never match a name against these.
 */
const AGGREGATOR_HOSTS = new Set([
  'news.google.com', 'news.yahoo.com', 'flipboard.com', 'apple.news', 't.co',
]);

/**
 * Resolve an outlet name (as printed by the feed) to registry metadata.
 * Unknown outlets are deliberately given tier 3 — unrecognised does not mean trusted.
 *
 * Only the outlet name and a real publisher *hostname* are matched. Paths are excluded
 * entirely: a substring appearing somewhere in a long URL is not evidence of provenance.
 */
export function resolveSource(outletRaw: string, url = ''): SourceMeta {
  let host = '';
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (!AGGREGATOR_HOSTS.has(h)) host = h;
  } catch {
    // Not a parseable URL; fall back to the outlet name alone.
  }
  const hay = `${outletRaw} ${host}`.toLowerCase();
  let best: SourceMeta | null = null;
  let bestLen = 0;
  for (const s of SOURCES) {
    for (const m of s.match) {
      if (hay.includes(m.toLowerCase()) && m.length > bestLen) {
        best = s;
        bestLen = m.length;
      }
    }
  }
  return best ?? { ...UNKNOWN, name: outletRaw || 'Unknown source' };
}
