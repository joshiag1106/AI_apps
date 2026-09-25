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
  /*
   * Added 2026-09-18, after measuring the production database: 387 distinct outlets were
   * resolving to ZZZ. Unplaced outlets are excluded from the independent-country count in
   * lib/verify/confidence.ts, so each one was contributing nothing to corroboration. These
   * are the ones identifiable with confidence; the rest stay unplaced deliberately.
   *
   * NOT added, and this is the important half: Head Topics, facebook.com, Yahoo!ニュース,
   * ｄメニューニュース and similar. They republish rather than report, so placing them as
   * independent would manufacture corroboration out of one story echoed — the exact failure
   * the ownership column exists to prevent. ZZZ already means "does not count", which is
   * the correct treatment for an aggregator.
   */
  { match: ['patrika'], name: 'Rajasthan Patrika', country: 'IND', language: 'hi', ownership: 'independent', tier: 3 },
  { match: ['tv9'], name: 'TV9', country: 'IND', language: 'hi', ownership: 'independent', tier: 3 },
  { match: ['newindianexpress', 'new indian express'], name: 'The New Indian Express', country: 'IND', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['rediff'], name: 'Rediff', country: 'IND', language: 'en', ownership: 'independent', tier: 3 },
  { match: ['theweek.in'], name: 'The Week (India)', country: 'IND', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['prabhatkhabar'], name: 'Prabhat Khabar', country: 'IND', language: 'hi', ownership: 'independent', tier: 3 },
  { match: ['bhaskarhindi', 'dainik bhaskar'], name: 'Dainik Bhaskar', country: 'IND', language: 'hi', ownership: 'independent', tier: 3 },
  { match: ['4pm.co.in'], name: '4PM News', country: 'IND', language: 'hi', ownership: 'independent', tier: 3 },
  // Doordarshan is the state broadcaster. A .gov.in outlet is a primary government source,
  // never independent corroboration of the government that runs it.
  { match: ['ddnews'], name: 'DD News', country: 'IND', language: 'en', ownership: 'state', tier: 2 },

  { match: ['ynet'], name: 'Ynet', country: 'ISR', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['times of israel'], name: 'The Times of Israel', country: 'ISR', language: 'en', ownership: 'independent', tier: 2 },
  // Added 2026-09-25, the outlets the new he-IL beat query actually surfaced (verified
  // live). mako is Keshet Media Group's commercial news site; Globes is Israel's
  // business daily; Makor Rishon is a religious-nationalist paper — three genuinely
  // separate Hebrew-language newsrooms, not one outlet republished three ways.
  // Bare 'mako', not 'mako.co.il' — Google News' aggregator link is excluded from
  // host-matching entirely (AGGREGATOR_HOSTS), so the only string this can ever match
  // against is the outlet name the feed prints, which is the bare word. Same precedent
  // as bare 'ani' above: a short key, accepted because the alternative is unreachable.
  { match: ['mako'], name: 'mako', country: 'ISR', language: 'he', ownership: 'independent', tier: 2 },
  { match: ['globes'], name: 'Globes', country: 'ISR', language: 'he', ownership: 'independent', tier: 1 },
  { match: ['מקור ראשון', 'makor rishon'], name: 'Makor Rishon', country: 'ISR', language: 'he', ownership: 'independent', tier: 3 },
  // Kikar HaShabbat — Haredi/religious-affairs news site, seen in the same live ingest.
  { match: ['כיכר השבת', 'kikar hashabat'], name: 'Kikar HaShabbat', country: 'ISR', language: 'he', ownership: 'independent', tier: 3 },

  // 'the kyiv independent' must be matched by a LONGER key than 'the independent', or the
  // longest-match rule would place a Ukrainian outlet in Britain and let the two corroborate
  // each other as separate countries.
  { match: ['kyiv independent'], name: 'The Kyiv Independent', country: 'UKR', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['ua.news'], name: 'UA.NEWS', country: 'UKR', language: 'uk', ownership: 'independent', tier: 3 },
  // United24 is an official Ukrainian government platform, not a newsroom.
  { match: ['united24'], name: 'United24 Media', country: 'UKR', language: 'en', ownership: 'state_affiliated', tier: 3 },
  // Added 2026-09-25, for the new uk-UA beat query — Ukraine's own language, not just
  // Moscow's or the West's. Suspilne is the public broadcaster (like the BBC: publicly
  // funded, editorially independent by charter), Ukrayinska Pravda a long-running
  // independent investigative outlet — two genuinely different kinds of newsroom.
  { match: ['суспільне', 'suspilne'], name: 'Suspilne', country: 'UKR', language: 'uk', ownership: 'public', tier: 1 },
  { match: ['українська правда', 'ukrayinska pravda', 'ukrainska pravda'], name: 'Ukrayinska Pravda', country: 'UKR', language: 'uk', ownership: 'independent', tier: 1 },
  // Added 2026-09-25, from the first real ingest against the new uk-UA query — outlets
  // that actually appeared, not guessed at.
  { match: ['liga.net'], name: 'LIGA.net', country: 'UKR', language: 'uk', ownership: 'independent', tier: 2 },
  { match: ['24 канал', '24tv.ua'], name: '24 Kanal', country: 'UKR', language: 'uk', ownership: 'independent', tier: 3 },
  { match: ['112.ua'], name: '112.ua', country: 'UKR', language: 'uk', ownership: 'independent', tier: 3 },

  { match: ['taipei times'], name: 'Taipei Times', country: 'TWN', language: 'en', ownership: 'independent', tier: 2 },
  { match: ['三立'], name: 'SET News', country: 'TWN', language: 'zh', ownership: 'independent', tier: 3 },
  { match: ['on.cc', '東網'], name: 'Oriental Daily (on.cc)', country: 'HKG', language: 'zh', ownership: 'tabloid', tier: 3 },
  { match: ['星島'], name: 'Sing Tao', country: 'HKG', language: 'zh', ownership: 'independent', tier: 3 },
  // China News Service is the second state wire after Xinhua, run by the United Front Work
  // Department. State, not merely state-affiliated.
  { match: ['chinanews'], name: 'China News Service', country: 'CHN', language: 'zh', ownership: 'state', tier: 2 },

  { match: ['朝鮮日報', 'chosun'], name: 'Chosun Ilbo', country: 'KOR', language: 'zh', ownership: 'independent', tier: 2 },
  { match: ['아시아경제'], name: 'Asia Economy', country: 'KOR', language: 'ko', ownership: 'independent', tier: 3 },
  { match: ['매일경제'], name: 'Maeil Business', country: 'KOR', language: 'ko', ownership: 'independent', tier: 3 },
  // World Journal is US-published Chinese-language press, not a PRC outlet. Placing it in
  // CHN would let it corroborate Beijing's own wires on the country count.
  { match: ['世界新聞網'], name: 'World Journal', country: 'USA', language: 'zh', ownership: 'independent', tier: 3 },
  { match: ['sin chew'], name: 'Sin Chew Daily', country: 'MYS', language: 'zh', ownership: 'independent', tier: 3 },
  { match: ['orientaldaily.com.my'], name: 'Oriental Daily (Malaysia)', country: 'MYS', language: 'zh', ownership: 'independent', tier: 3 },

  { match: ['vietnam.vn'], name: 'Vietnam.vn', country: 'VNM', language: 'vi', ownership: 'state', tier: 3 },

  { match: ['department of defense', 'defense.gov'], name: 'US Department of Defense', country: 'USA', language: 'en', ownership: 'state', tier: 1 },
  { match: ['pbs'], name: 'PBS', country: 'USA', language: 'en', ownership: 'public', tier: 2 },
  { match: ['the independent'], name: 'The Independent', country: 'GBR', language: 'en', ownership: 'independent', tier: 2 },
  // Academic commentary, never a witness to an event.
  { match: ['the conversation'], name: 'The Conversation', country: 'AUS', language: 'en', ownership: 'analysis', tier: 2 },
  /*
   * Iran International is London-based and Persian-language, and its funding has been the
   * subject of public dispute. Placing it in IRN would be wrong twice: it is not Iranian
   * state media, and treating it as an Iranian domestic source would let it corroborate
   * Tehran's own outlets on a count that exists to measure independence.
   */
  { match: ['iran international'], name: 'Iran International', country: 'GBR', language: 'fa', ownership: 'independent', tier: 3 },
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
  /*
   * A second, punctuation-blind view of the same string. Feeds give the outlet as a
   * masthead ("Times of India") or as a bare hostname ("timesofindia.indiatimes.com"), and
   * a key written in one shape cannot see the other: "times of india" does not occur in the
   * hostname, and neither does "toi". That left the largest Indian daily unplaced — and so
   * contributing nothing to corroboration — despite being registered here from the start.
   *
   * This is an ADDITIONAL pass, never a replacement, so it can only add a match. Collapsing
   * separators does not merge distinct mastheads that share a word: "theindependent" still
   * does not occur inside "thekyivindependent", which is the collision worth worrying about
   * because it would place a Ukrainian outlet in Britain and let the two corroborate each
   * other as separate countries. tests/provenance.test.ts pins exactly that case.
   */
  const flat = hay.replace(/[^a-z0-9\u00c0-\uffff]/g, '');
  let best: SourceMeta | null = null;
  let bestLen = 0;
  for (const s of SOURCES) {
    for (const m of s.match) {
      const key = m.toLowerCase();
      const flatKey = key.replace(/[^a-z0-9\u00c0-\uffff]/g, '');
      const hit = hay.includes(key) || (flatKey.length >= 6 && flat.includes(flatKey));
      if (hit && m.length > bestLen) {
        best = s;
        bestLen = m.length;
      }
    }
  }
  return best ?? { ...UNKNOWN, name: outletRaw || 'Unknown source' };
}
