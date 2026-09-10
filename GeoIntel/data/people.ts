// Multilingual roster of senior officials.
//
// Mirrors data/countries.ts, whose shape is already proven against this corpus's scripts.
// `aliases` carries the forms outlets actually print in their own language — that is what
// lets a Xinhua piece and a PIB release resolve to the same person.
//
// NO LATIN ALIAS SHORTER THAN FOUR CHARACTERS. 'xi' and 'lai' are ordinary English words
// and fire inside 'taxi' and 'malaise'. Use a qualified form ('lai ching-te') or a
// script-specific one ('赖清德'). tests/people.test.ts pins this for every entry, not just
// for the two known offenders, so a future addition cannot reintroduce the class.
//
// The same hazard applies to common surnames. 'singh', 'shah', 'wong', 'kim', 'lee' and
// 'dar' are all real officials' names AND ordinary words or extremely common names, so they
// appear here only in qualified form ('amit shah', 'penny wong'). An alias that matches the
// wrong article is worse than one that matches nothing: a missing person is invisible and
// disclosed, a false match is a wrong edge presented as evidence.
//
// `id` must never contain '|': lib/graph/build.ts's edgeKey joins participants with it, so
// a pipe in an id would silently merge two different people's edges. Also pinned.
//
// ROSTER LAST REVIEWED: see ROSTER_REVIEWED below, which is the single source for this date.
// Update that constant when you re-check the roles; every page that shows the date reads it
// from there. It used to be restated in the page copy as well, and within a day the People
// page was telling readers a date a day older than the file's own.
//
// READ THIS BEFORE TRUSTING A ROLE. `role` and `home` are correct as of the review date
// above and go stale as cabinets change — a minister who has left office keeps appearing in
// archived reporting, so the node stays real while the label quietly becomes wrong. That is
// why the review date is printed on /methodology and on /person rather than kept only here.
// Re-checking the roles is the recurring maintenance cost of this feature; it is not
// optional, and nothing in the code can detect that it has fallen overdue.
//
// `npm run roster:audit` is the tool for that pass. It prints every entry beside the
// headlines and snippets that name them, and flags the two cases a machine CAN catch:
// FORMER, where something retitles a serving official (Ex-CDS, पूर्व CDS — that is how Anil
// Chauhan was caught on 2026-09-07), and DISMISSED, where something says they were removed
// (免职, 落马, 双开 — that is how Zhang Youxia was caught on 2026-09-09). It never edits
// anything; the judgement, and the rule below, stay with the reviewer.
//
// DO NOT READ A CLEAN FLAG AS A CLEAN ROSTER. Both flags look for a WORD marking a seat as
// ended, and the most common way a label goes wrong prints no such word. A superseded seat
// is simply reported in the new holder's name, as though it always had been: Min Aung
// Hlaing was captioned Commander-in-Chief beside headlines calling him Myanmar's President;
// Keir Starmer held the UK Prime Minister seat here while 8 articles put Andy Burnham in it;
// Jared Kushner was captioned "Envoy, Middle East" over 45 articles, 44 of them Ukraine and
// none of them Middle East. Three findings, no flag possible on any of them, and coverage
// volume warned of nothing either — Starmer and Min Aung Hlaing both looked healthily NAMED.
//
// So the flags are the cheap half. The half that finds things is reading each printed label
// against the headlines under it.
//
// PART OF THAT READING IS NOW AUTOMATED, and this comment claimed it could never be for
// about two hours. `scripts/roster-seats.ts` resolves the seat Chinese copy names —
// 日本首相高市早苗 is country, office and name in one adjacent run — and asks whether the
// holder listed here is the one named in it. It prints SEAT MISMATCH, UNCLAIMED SEAT and a
// list of the seats the corpus positively confirms, which is the first mechanical
// confirmation this roster has ever had. It found two dead Chinese aliases on its first run.
//
// It covers Chinese only, so it ranks the reading pass rather than replacing it: the
// adjacency is a property of Chinese headline grammar, and 45 of the 120 entries are named
// by no article at all in any language. Read the printed labels anyway.
//
// Every `home` must be an ISO3 present in data/countries.ts, which tracks 68 states. That
// is why some obvious figures are absent: Cambodia, for one, is not a tracked state, so its
// prime minister has no valid home and is left off rather than filed under a neighbour.
//
// After editing this file run `npm run backfill:people`. The ingest analyses only articles
// it fetches, and articles age out of feeds, so a new name will not reach stored rows
// without it.

/**
 * When the roles and home states below were last checked against reality.
 *
 * Exported rather than written into the page copy because it is a claim the product makes
 * to readers about how current its coverage is — the one number a reader needs in order to
 * judge an absence. Two pages display it and both import it, so it cannot drift from the
 * file it describes.
 *
 * WHAT THE DATE CAN AND CANNOT MEAN, measured on 2026-09-10: the review is made against
 * this corpus, and the corpus names only 75 of the 120 people here. For those, a headline
 * states or contradicts the role and the check is evidence. For the other 45 it returns
 * nothing at all — and silence is not confirmation, it is absence of a source. Their labels
 * rest on whichever earlier review last had evidence for them.
 *
 * MOST OF THAT SILENCE IS REAL ABSENCE, AND SOME OF IT HAS BEEN A BROKEN ALIAS LIST. The
 * distinction matters because 45 unmatched names look exactly like a matcher fault, and this
 * comment asserted the reassuring half of it — "nothing is missing from the aliases" — for a
 * day after that had been disproven. Both halves, with their evidence:
 *
 * The absence is usually real. Checked by going around the matcher rather than through it:
 * search the stored title, snippet and translated title of every article for the name as
 * text. Erdogan appears ZERO times across 6,291 articles while 'Turkey' appears 12, and
 * 'bin Salman' zero while 'Saudi' appears 109. Outlets name the state and leave the official
 * out.
 *
 * BUT THAT CHECK CANNOT SEE THE CASE IT MOST NEEDS TO. It searches the LATIN form of a name,
 * and `title_en` is populated only for Chinese — so hi/ar/ja/ru articles carry no Latin
 * rendering of their headline for the matcher OR the check to read. A Latin-only alias is
 * therefore invisible in precisely the articles that most need it, and the check that would
 * catch that is blind in the same place, for the same reason. Two entries were hiding behind
 * this on 2026-09-09: Anura Kumara Dissanayake, named राष्ट्रपति दिसानायके, and Theresa Lazaro,
 * named 拉扎罗. Both were listed silent; both were being named all along.
 *
 * 27 of the 120 entries still carry Latin-only aliases. They were swept once, on 2026-09-09,
 * by reading their home state's non-Latin coverage — which is a weaker instrument than it
 * sounds, because it only surfaces articles carrying an office word, so a bare-name mention
 * would still hide. Treat those 27 as consistent with absence and NOT as proven absent, and
 * treat any new Latin-only entry as unverifiable until it has an alias in the scripts its
 * home state is actually covered in.
 *
 * AND HAVING AN ALIAS IN THE RIGHT SCRIPT IS NOT SUFFICIENT EITHER — found 2026-09-10, one day
 * after the paragraph above was written, which is why it sits here rather than replacing it.
 * Anwar Ibrahim carried 安瓦尔 and was still invisible in 马来西亚首相安华: both are current
 * Chinese renderings of his name, and the outlet chose the other one. Transliteration is a
 * choice each publisher makes, not a property of the language, so a per-entry script-coverage
 * check would have passed him. The exposure is therefore wider than "Latin-only": it is every
 * transliterated name with fewer renderings listed than its outlets use, and this file cannot
 * tell you how many of those there are.
 *
 * This is a property of a narrow corpus, not a defect to fix: the feeds cover India-China,
 * the South China Sea and the Gulf, so Singapore's and Sri Lanka's foreign ministers may
 * never once be named no matter how long it runs. Verifying them means going outside this
 * corpus, which is a different and looser standard than the one the rest of the product
 * holds — so the honest move is to say the date is uneven, not to imply it is uniform.
 */
export const ROSTER_REVIEWED = '2026-09-10';

export interface Person {
  id: string;
  name: string;
  role: string;
  /** ISO3 of the state they serve. Must exist in data/countries.ts. Drawn as affiliation. */
  home: string;
  aliases: string[];
  /**
   * How the name is drawn on a graph node, where the full form does not fit.
   *
   * Set it wherever a shortened form is unambiguous and conventional — the family name for
   * a Western name, the family name FIRST for a surname-first name. Omit it and the full
   * name is used, which is always safe and merely wider.
   *
   * OMISSION IS THE DEFAULT, and it is not laziness. Three things force it: a collision
   * (Amit Shah and Balen Shah, Penny Wong and Lawrence Wong, the two Kims, the two Lins all
   * reduce to one word), a convention that cannot be shortened safely (the Gulf patronymics
   * — 'bin Zayed' names two different people on this roster), or a name already short enough
   * that shortening buys nothing. A label naming the wrong person is far worse than a wide
   * one. tests/people.test.ts pins the collision rule.
   */
  short?: string;
}

export const PEOPLE: Person[] = [
  // ---- China ----
  { id: 'xi-jinping', name: 'Xi Jinping', role: 'President', home: 'CHN', short: 'Xi',
    aliases: ['xi jinping', '习近平', 'शी जिनपिंग', 'شي جين بينغ'] },
  { id: 'li-qiang', name: 'Li Qiang', role: 'Premier', home: 'CHN',
    aliases: ['li qiang', '李强'] },
  { id: 'wang-yi', name: 'Wang Yi', role: 'Foreign Minister', home: 'CHN',
    aliases: ['wang yi', '王毅', 'वांग यी', 'وانغ يي'] },
  { id: 'lin-jian', name: 'Lin Jian', role: 'MFA Spokesperson', home: 'CHN',
    aliases: ['lin jian', '林剑'] },
  { id: 'mao-ning', name: 'Mao Ning', role: 'MFA Spokesperson', home: 'CHN',
    aliases: ['mao ning', '毛宁'] },
  { id: 'dong-jun', name: 'Dong Jun', role: 'Defence Minister', home: 'CHN',
    aliases: ['dong jun', '董军'] },
  { id: 'ding-xuexiang', name: 'Ding Xuexiang', role: 'Executive Vice Premier', home: 'CHN',
    aliases: ['ding xuexiang', '丁薛祥'] },
  { id: 'he-lifeng', name: 'He Lifeng', role: 'Vice Premier, economic policy', home: 'CHN',
    aliases: ['he lifeng', '何立峰'] },
  // Corrected 2026-09-09 from 'CMC Vice Chairman'. VOA Chinese reports him 被正式免职
  // ("formally dismissed from office") on 2026-08-31 and 被免职 again on 2026-09-01, both
  // times paired with Liu Zhenli, amid a Rocket Force purge; 禁闻网 heads a third item
  // 张又侠案 ("the Zhang Youxia case"). Neither Liu Zhenli nor Zhong Shaojun is on this
  // roster, so nothing else here needed changing.
  //
  // THE EVIDENCE IS THINNER THAN CHAUHAN'S AND THAT IS RECORDED ON PURPOSE: his was three
  // outlets across two languages, this is one outlet twice plus an aggregator's headline.
  // It is still decisive against the OLD label, which had zero corpus support and is
  // contradicted by every sentence that mentions his status — but if a source later names
  // him serving, this entry is the one to re-read rather than assume.
  //
  // The serving seat is UNLISTED: no source in the window names a successor.
  //
  // Two blind spots hid this through the 2026-09-09 pass, both since fixed in
  // scripts/roster-audit.ts. The audit read only titles while the MATCHER reads title +
  // snippet, so evidence living in a snippet was invisible to the reviewer; and 免职 and
  // 落马 are dismissal verbs, not "former X" constructions, so the detector had no word for
  // them. A Chinese official is removed, not retitled.
  { id: 'zhang-youxia', name: 'Zhang Youxia', role: 'Former CMC Vice Chairman', home: 'CHN',
    aliases: ['zhang youxia', '张又侠'] },
  { id: 'cai-qi', name: 'Cai Qi', role: 'Politburo Standing Committee', home: 'CHN',
    aliases: ['cai qi', '蔡奇'] },

  // ---- India ----
  { id: 'modi', name: 'Narendra Modi', role: 'Prime Minister', home: 'IND', short: 'Modi',
    aliases: ['narendra modi', 'modi', '莫迪', 'मोदी', 'مودي'] },
  { id: 'jaishankar', name: 'S. Jaishankar', role: 'External Affairs Minister', home: 'IND', short: 'Jaishankar',
    aliases: ['jaishankar', '苏杰生', 'जयशंकर'] },
  { id: 'rajnath-singh', name: 'Rajnath Singh', role: 'Defence Minister', home: 'IND',
    aliases: ['rajnath', '拉杰纳特', 'राजनाथ'] },
  { id: 'ajit-doval', name: 'Ajit Doval', role: 'National Security Adviser', home: 'IND', short: 'Doval',
    aliases: ['ajit doval', 'doval', '多瓦尔', 'डोभाल'] },
  { id: 'amit-shah', name: 'Amit Shah', role: 'Home Minister', home: 'IND',
    aliases: ['amit shah', 'अमित शाह'] },
  { id: 'nirmala-sitharaman', name: 'Nirmala Sitharaman', role: 'Finance Minister', home: 'IND', short: 'Sitharaman',
    aliases: ['sitharaman', 'निर्मला सीतारमण'] },
  { id: 'vikram-misri', name: 'Vikram Misri', role: 'Foreign Secretary', home: 'IND', short: 'Misri',
    aliases: ['vikram misri', 'मिस्री'] },
  { id: 'randhir-jaiswal', name: 'Randhir Jaiswal', role: 'MEA Spokesperson', home: 'IND', short: 'Jaiswal',
    aliases: ['randhir jaiswal'] },
  // Listed as the SERVING Chief of Defence Staff until 2026-09-07, when the corpus was
  // finally read against the label: five of his seven headlines call him "Ex-CDS" or
  // "Former CDS", in English and in Hindi (पूर्व CDS), from three outlets across two days.
  // He is still heavily quoted, which is exactly why the wrong label survived — the node
  // never went quiet the way a departed official's usually does. No source in the window
  // names a successor, so the serving seat is left UNLISTED rather than guessed at.
  { id: 'anil-chauhan', name: 'Anil Chauhan', role: 'Former Chief of Defence Staff', home: 'IND', short: 'Chauhan',
    aliases: ['anil chauhan'] },
  { id: 'shashi-tharoor', name: 'Shashi Tharoor', role: 'MP, external affairs committee', home: 'IND', short: 'Tharoor',
    aliases: ['tharoor', 'थरूर'] },
  { id: 'droupadi-murmu', name: 'Droupadi Murmu', role: 'President', home: 'IND', short: 'Murmu',
    aliases: ['droupadi murmu', 'murmu', 'मुर्मू'] },
  { id: 'piyush-goyal', name: 'Piyush Goyal', role: 'Commerce Minister', home: 'IND', short: 'Goyal',
    aliases: ['piyush goyal', 'गोयल'] },

  // ---- United States ----
  { id: 'trump', name: 'Donald Trump', role: 'President', home: 'USA', short: 'Trump',
    aliases: ['trump', '特朗普', 'ट्रंप', 'ट्रम्प', 'ترامب'] },
  { id: 'vance', name: 'JD Vance', role: 'Vice President', home: 'USA', short: 'Vance',
    aliases: ['vance', '万斯'] },
  { id: 'rubio', name: 'Marco Rubio', role: 'Secretary of State', home: 'USA', short: 'Rubio',
    aliases: ['rubio', '鲁比奥', 'روبيو'] },
  { id: 'hegseth', name: 'Pete Hegseth', role: 'Secretary of Defense', home: 'USA', short: 'Hegseth',
    aliases: ['hegseth', '赫格塞思'] },
  { id: 'steve-witkoff', name: 'Steve Witkoff', role: 'Special Envoy', home: 'USA', short: 'Witkoff',
    aliases: ['witkoff', '威特科夫'] },
  // Was 'Envoy, Middle East' until 2026-09-10. The corpus does not support the qualifier and
  // contradicts it by portfolio: of his 45 articles, ZERO contain "Middle East", "Gaza" or 中东,
  // and 44 are Russia-Ukraine. Outlets call him a "US envoy", a "US peace envoy" and 美国总统特使
  // ("US presidential special envoy"), never a regional one, and they name him beside Witkoff in
  // nearly every one — same shuttle, Moscow then Kyiv, same office word.
  //
  // A third shape of stale role, after Chauhan's VACATED and Min Aung Hlaing's SUPERSEDED: the
  // office is right and the QUALIFIER is unsupported. No flag can see it. FORMER and DISMISSED
  // both look for a word marking a seat as ended, and nothing marks a portfolio as moved; the
  // page simply captioned 45 Ukraine articles "Envoy, Middle East". Dropping the qualifier is the
  // minimal correction the evidence licenses — it claims only what the corpus says, and does not
  // assert he stopped Middle East work, which no source in the window addresses either way.
  { id: 'jared-kushner', name: 'Jared Kushner', role: 'Special Envoy', home: 'USA', short: 'Kushner',
    aliases: ['kushner', '库什纳'] },
  { id: 'scott-bessent', name: 'Scott Bessent', role: 'Treasury Secretary', home: 'USA', short: 'Bessent',
    aliases: ['bessent', '贝森特'] },
  { id: 'tulsi-gabbard', name: 'Tulsi Gabbard', role: 'Director of National Intelligence', home: 'USA', short: 'Gabbard',
    aliases: ['gabbard', '加巴德'] },
  { id: 'john-ratcliffe', name: 'John Ratcliffe', role: 'CIA Director', home: 'USA', short: 'Ratcliffe',
    aliases: ['ratcliffe'] },
  { id: 'howard-lutnick', name: 'Howard Lutnick', role: 'Commerce Secretary', home: 'USA', short: 'Lutnick',
    aliases: ['lutnick', '卢特尼克'] },

  // ---- Russia ----
  { id: 'putin', name: 'Vladimir Putin', role: 'President', home: 'RUS', short: 'Putin',
    aliases: ['putin', 'путин', '普京', 'पुतिन', 'بوتين'] },
  { id: 'lavrov', name: 'Sergey Lavrov', role: 'Foreign Minister', home: 'RUS', short: 'Lavrov',
    aliases: ['lavrov', 'лавров', '拉夫罗夫', 'لافروف'] },
  { id: 'peskov', name: 'Dmitry Peskov', role: 'Kremlin Spokesman', home: 'RUS', short: 'Peskov',
    aliases: ['peskov', 'песков', '佩斯科夫'] },
  { id: 'medvedev', name: 'Dmitry Medvedev', role: 'Deputy Security Council Chairman', home: 'RUS', short: 'Medvedev',
    aliases: ['medvedev', 'медведев', '梅德韦杰夫'] },
  { id: 'belousov', name: 'Andrei Belousov', role: 'Defence Minister', home: 'RUS', short: 'Belousov',
    aliases: ['belousov', 'белоусов', '别洛乌索夫'] },
  { id: 'shoigu', name: 'Sergei Shoigu', role: 'Security Council Secretary', home: 'RUS', short: 'Shoigu',
    aliases: ['shoigu', 'шойгу', '绍伊古'] },
  { id: 'zakharova', name: 'Maria Zakharova', role: 'MFA Spokeswoman', home: 'RUS', short: 'Zakharova',
    aliases: ['zakharova', 'захарова', '扎哈罗娃'] },

  // ---- Pakistan ----
  { id: 'shehbaz-sharif', name: 'Shehbaz Sharif', role: 'Prime Minister', home: 'PAK',
    aliases: ['shehbaz', 'shahbaz sharif', '夏巴兹', 'शहबाज'] },
  { id: 'asim-munir', name: 'Asim Munir', role: 'Chief of Army Staff', home: 'PAK', short: 'Munir',
    aliases: ['asim munir', 'منیر'] },
  { id: 'ishaq-dar', name: 'Ishaq Dar', role: 'Deputy PM and Foreign Minister', home: 'PAK',
    aliases: ['ishaq dar', 'اسحاق ڈار'] },
  { id: 'bilawal-bhutto', name: 'Bilawal Bhutto Zardari', role: 'PPP Chairman', home: 'PAK', short: 'Bilawal Bhutto',
    aliases: ['bilawal', 'بلاول'] },
  { id: 'asif-ali-zardari', name: 'Asif Ali Zardari', role: 'President', home: 'PAK', short: 'Zardari',
    aliases: ['zardari', 'زرداری'] },

  // ---- Taiwan ----
  { id: 'lai-ching-te', name: 'Lai Ching-te', role: 'President', home: 'TWN', short: 'Lai',
    aliases: ['lai ching-te', 'william lai', '赖清德'] },
  { id: 'hsiao-bi-khim', name: 'Hsiao Bi-khim', role: 'Vice President', home: 'TWN', short: 'Hsiao',
    aliases: ['hsiao bi-khim', '萧美琴'] },
  { id: 'lin-chia-lung', name: 'Lin Chia-lung', role: 'Foreign Minister', home: 'TWN',
    aliases: ['lin chia-lung', '林佳龙'] },
  { id: 'wellington-koo', name: 'Wellington Koo', role: 'Defence Minister', home: 'TWN', short: 'Koo',
    aliases: ['wellington koo', '顾立雄'] },

  // ---- Japan ----
  // Corrected 2026-09-06 against the corpus, not from memory. The four entries here were
  // Ishiba's cabinet and had gone stale. Reporting in the current window names 高市早苗 as
  // prime minister ("日本首相高市早苗", multiple zh and ja items) and Shinjiro Koizumi as
  // defence minister (Yonhap, 4 September). Those two are corrected below.
  //
  // The foreign minister is deliberately NOT listed. Ishiba's appointee is certainly gone,
  // the corpus names no successor, and putting a guess here would be the one failure this
  // roster must avoid: an unlisted official is invisible and disclosed, a wrongly-labelled
  // one is a false claim rendered to readers as fact. Add them when a source names them.
  { id: 'takaichi-sanae', name: 'Takaichi Sanae', role: 'Prime Minister', home: 'JPN', short: 'Takaichi',
    aliases: ['takaichi', '高市早苗'] },
  // Full name only: bare '小泉' would also match his father, a former prime minister who
  // still appears in retrospective coverage, and merge two people into one node.
  { id: 'shinjiro-koizumi', name: 'Shinjiro Koizumi', role: 'Defence Minister', home: 'JPN', short: 'Koizumi',
    aliases: ['shinjiro koizumi', '小泉進次郎', '小泉进次郎'] },

  // ---- South Korea ----
  { id: 'lee-jae-myung', name: 'Lee Jae-myung', role: 'President', home: 'KOR', short: 'Lee',
    aliases: ['lee jae-myung', '李在明', '이재명'] },
  { id: 'cho-hyun', name: 'Cho Hyun', role: 'Foreign Minister', home: 'KOR',
    aliases: ['cho hyun', '조현'] },
  { id: 'ahn-gyu-back', name: 'Ahn Gyu-back', role: 'Defence Minister', home: 'KOR', short: 'Ahn',
    aliases: ['ahn gyu-back', '안규백'] },

  // ---- North Korea ----
  { id: 'kim-jong-un', name: 'Kim Jong Un', role: 'Supreme Leader', home: 'PRK',
    aliases: ['kim jong un', 'kim jong-un', '金正恩', '김정은'] },
  { id: 'kim-yo-jong', name: 'Kim Yo Jong', role: "Vice Department Director, Workers' Party", home: 'PRK',
    aliases: ['kim yo jong', 'kim yo-jong', '金与正', '김여정'] },
  { id: 'choe-son-hui', name: 'Choe Son Hui', role: 'Foreign Minister', home: 'PRK', short: 'Choe',
    aliases: ['choe son hui', 'choe son-hui', '崔善姬'] },

  // ---- Israel ----
  { id: 'netanyahu', name: 'Benjamin Netanyahu', role: 'Prime Minister', home: 'ISR', short: 'Netanyahu',
    aliases: ['netanyahu', '内塔尼亚胡', 'नेतन्याहू', 'نتنياهو'] },
  { id: 'israel-katz', name: 'Israel Katz', role: 'Defence Minister', home: 'ISR', short: 'Katz',
    aliases: ['israel katz'] },
  { id: 'gideon-saar', name: "Gideon Sa'ar", role: 'Foreign Minister', home: 'ISR', short: "Sa'ar",
    aliases: ['gideon saar', "gideon sa'ar"] },

  // ---- Iran ----
  { id: 'khamenei', name: 'Ali Khamenei', role: 'Supreme Leader', home: 'IRN', short: 'Khamenei',
    aliases: ['khamenei', '哈梅内伊', 'خامنئی'] },
  // 佩泽什基扬 and 阿拉格齐 added 2026-09-10, both extracted from the articles. Each entry
  // ALREADY carried a Chinese alias and neither had ever matched anything: 佩泽希齐扬 occurs
  // ZERO times in 6,315 articles and 阿拉格奇 zero, while the forms outlets actually print —
  // 伊朗总统佩泽什基扬 and 伊朗外长阿拉格齐 — occur and state the office besides.
  //
  // Found by scripts/roster-seats.ts on its FIRST live run, which is the point worth keeping.
  // These are the Anwar case again (a right-script, wrong-rendering alias, invisible to any
  // check that asks only whether an entry covers a script) and three careful hand sweeps had
  // missed all three. A dead alias is the worst kind of roster fault: the entry looks
  // complete, the audit lists the person as silent, and the silence reads as absence of
  // coverage rather than as a typo. The old forms are kept — an outlet may yet use them.
  { id: 'pezeshkian', name: 'Masoud Pezeshkian', role: 'President', home: 'IRN', short: 'Pezeshkian',
    aliases: ['pezeshkian', '佩泽希齐扬', '佩泽什基扬', 'پزشکیان'] },
  { id: 'araghchi', name: 'Abbas Araghchi', role: 'Foreign Minister', home: 'IRN', short: 'Araghchi',
    aliases: ['araghchi', '阿拉格奇', '阿拉格齐', 'عراقچی'] },
  { id: 'larijani', name: 'Ali Larijani', role: 'Supreme National Security Council Secretary', home: 'IRN', short: 'Larijani',
    aliases: ['larijani', 'لاریجانی'] },
  { id: 'esmail-baghaei', name: 'Esmail Baghaei', role: 'MFA Spokesman', home: 'IRN', short: 'Baghaei',
    aliases: ['baghaei', 'بقایی'] },

  // ---- Ukraine ----
  { id: 'zelensky', name: 'Volodymyr Zelensky', role: 'President', home: 'UKR', short: 'Zelensky',
    aliases: ['zelensky', 'zelenskyy', 'зеленский', '泽连斯基'] },
  { id: 'andrii-sybiha', name: 'Andrii Sybiha', role: 'Foreign Minister', home: 'UKR', short: 'Sybiha',
    aliases: ['sybiha', 'сибіга'] },
  { id: 'rustem-umerov', name: 'Rustem Umerov', role: 'National Security and Defence Council Secretary', home: 'UKR', short: 'Umerov',
    aliases: ['umerov', 'умєров'] },

  // ---- Turkey ----
  { id: 'erdogan', name: 'Recep Tayyip Erdogan', role: 'President', home: 'TUR', short: 'Erdogan',
    aliases: ['erdogan', 'erdoğan', '埃尔多安', 'أردوغان'] },
  { id: 'hakan-fidan', name: 'Hakan Fidan', role: 'Foreign Minister', home: 'TUR', short: 'Fidan',
    aliases: ['hakan fidan'] },

  // ---- Gulf and Middle East ----
  { id: 'mohammed-bin-salman', name: 'Mohammed bin Salman', role: 'Crown Prince and Prime Minister', home: 'SAU',
    aliases: ['mohammed bin salman', 'محمد بن سلمان'] },
  { id: 'faisal-bin-farhan', name: 'Faisal bin Farhan', role: 'Foreign Minister', home: 'SAU',
    aliases: ['faisal bin farhan', 'فيصل بن فرحان'] },
  { id: 'mohamed-bin-zayed', name: 'Mohamed bin Zayed', role: 'President', home: 'ARE',
    aliases: ['mohamed bin zayed', 'محمد بن زايد'] },
  { id: 'abdullah-bin-zayed', name: 'Abdullah bin Zayed', role: 'Foreign Minister', home: 'ARE',
    aliases: ['abdullah bin zayed', 'عبدالله بن زايد'] },
  { id: 'tamim-bin-hamad', name: 'Tamim bin Hamad Al Thani', role: 'Emir', home: 'QAT',
    aliases: ['tamim bin hamad', 'تميم بن حمد'] },
  { id: 'mohammed-bin-abdulrahman', name: 'Mohammed bin Abdulrahman Al Thani', role: 'Prime Minister and Foreign Minister', home: 'QAT',
    aliases: ['mohammed bin abdulrahman'] },
  { id: 'sisi', name: 'Abdel Fattah el-Sisi', role: 'President', home: 'EGY', short: 'el-Sisi',
    aliases: ['el-sisi', 'al-sisi', 'السيسي', '塞西'] },

  { id: 'badr-abdelatty', name: 'Badr Abdelatty', role: 'Foreign Minister', home: 'EGY', short: 'Abdelatty',
    aliases: ['abdelatty', 'عبد العاطي'] },

  // ---- Europe ----
  { id: 'yvette-cooper', name: 'Yvette Cooper', role: 'Foreign Secretary', home: 'GBR', short: 'Cooper',
    aliases: ['yvette cooper'] },
  // Corrected 2026-09-09 from the corpus. Keir Starmer was listed here as Prime Minister; the
  // corpus puts ANDY BURNHAM in the office across 8 articles in two languages — "the first EU
  // leader to meet new Prime Minister Andy Burnham in Downing Street", "New UK Prime Minister
  // Andy Burnham", "hosted by Prime Minister Andy Burnham", and 会见英国新首相伯纳姆.
  //
  // A SUPERSEDED seat, not a vacated one: nothing writes "former Starmer", so the audit's
  // FORMER/DISMISSED flags could never fire on it. Starmer also counted as NAMED on 2 articles,
  // neither of which called him PM, so coverage volume gave no warning either — the same shape
  // as Anil Chauhan. Starmer is UNLISTED rather than relabelled, because no source in the window
  // says what office he holds now, if any. Found while sweeping the Latin-only silent entries.
  //
  // The bare surname is kept here, unlike 'albanese': every Burnham mention in the corpus is him.
  { id: 'andy-burnham', name: 'Andy Burnham', role: 'Prime Minister', home: 'GBR', short: 'Burnham',
    aliases: ['andy burnham', 'burnham', '伯纳姆'] },
  { id: 'macron', name: 'Emmanuel Macron', role: 'President', home: 'FRA', short: 'Macron',
    aliases: ['macron', '马克龙', 'ماكرون'] },
  { id: 'jean-noel-barrot', name: 'Jean-Noel Barrot', role: 'Foreign Minister', home: 'FRA', short: 'Barrot',
    aliases: ['jean-noel barrot', 'barrot'] },
  { id: 'friedrich-merz', name: 'Friedrich Merz', role: 'Chancellor', home: 'DEU', short: 'Merz',
    aliases: ['friedrich merz', '默茨'] },
  { id: 'johann-wadephul', name: 'Johann Wadephul', role: 'Foreign Minister', home: 'DEU', short: 'Wadephul',
    aliases: ['wadephul'] },
  { id: 'meloni', name: 'Giorgia Meloni', role: 'Prime Minister', home: 'ITA', short: 'Meloni',
    aliases: ['meloni', '梅洛尼'] },
  { id: 'antonio-tajani', name: 'Antonio Tajani', role: 'Foreign Minister', home: 'ITA', short: 'Tajani',
    aliases: ['tajani'] },
  { id: 'pedro-sanchez', name: 'Pedro Sanchez', role: 'Prime Minister', home: 'ESP', short: 'Sanchez',
    aliases: ['pedro sanchez', 'pedro sánchez'] },

  { id: 'jose-manuel-albares', name: 'Jose Manuel Albares', role: 'Foreign Minister', home: 'ESP', short: 'Albares',
    aliases: ['albares'] },

  // ---- Australia, Canada, New Zealand ----
  // The bare surname was dropped 2026-09-09. It matched UN Special Rapporteur Francesca
  // Albanese ("UN expert Francesca Albanese calls for a 'true paradigm shift'"), putting an
  // Israel/UK story on Australia's PM and counting him NAMED on another person's coverage.
  // Same rule as the bare 'shah' below, with one difference: Balen Shah keeps a distinctive
  // given name to fall back on and this entry has none, since 'anthony' is far commoner than
  // the surname. So a surname-only mention now needs a title or 'government' beside it, and
  // one written as plain "Albanese said" will be missed. That costs nothing measurable today
  // - the corpus names him zero times in any script - and the alternative is a known false
  // positive on a figure this beat keeps covering.
  { id: 'anthony-albanese', name: 'Anthony Albanese', role: 'Prime Minister', home: 'AUS', short: 'Albanese',
    aliases: ['anthony albanese', 'pm albanese', 'prime minister albanese', 'albanese government', '阿尔巴尼斯'] },
  { id: 'penny-wong', name: 'Penny Wong', role: 'Foreign Minister', home: 'AUS',
    aliases: ['penny wong', '黄英贤'] },
  // Dual-hatted, and the corpus names only the other hat ("Hegseth Welcomes Australian
  // Deputy Prime Minister"), so a reader met a page labelled Defence Minister above an
  // article calling him Deputy PM. Both, in the form ishaq-dar and bui-thanh-son already use.
  { id: 'richard-marles', name: 'Richard Marles', role: 'Deputy PM and Defence Minister', home: 'AUS', short: 'Marles',
    aliases: ['marles'] },
  { id: 'mark-carney', name: 'Mark Carney', role: 'Prime Minister', home: 'CAN', short: 'Carney',
    aliases: ['mark carney', '卡尼'] },
  { id: 'anita-anand', name: 'Anita Anand', role: 'Foreign Minister', home: 'CAN', short: 'Anand',
    aliases: ['anita anand'] },

  // ---- Southeast Asia ----
  { id: 'ferdinand-marcos', name: 'Ferdinand Marcos Jr', role: 'President', home: 'PHL', short: 'Marcos',
    aliases: ['marcos jr', 'bongbong marcos', '马科斯'] },
  // Chinese alias added 2026-09-09 from the corpus: 王毅晤菲律宾外长拉扎罗 (2026-07-22) names her
  // and confirms the office. The SECOND hidden mention found by sweeping the silent entries whose
  // aliases were Latin-only, after Dissanayake — same defect, different script.
  { id: 'theresa-lazaro', name: 'Theresa Lazaro', role: 'Foreign Secretary', home: 'PHL', short: 'Lazaro',
    aliases: ['theresa lazaro', '拉扎罗'] },
  // Added 2026-09-10, from scripts/roster-seats.ts reporting PHL 国防部长 as an UNCLAIMED
  // SEAT across 3 articles — an office the corpus was filling and this roster left empty.
  // Well evidenced in both scripts, and one sentence carries both: 菲律宾国防部长特奥多罗
  // （Gilberto Teodoro）, plus 菲律宾国防部长吉尔伯托·C·特奥多罗二世（Gilberto C. Teodoro Jr.）
  // and an English item, "Philippine Defense Secretary Gilberto Teodoro".
  //
  // 'Defence Secretary' rather than 'Defence Minister' because that is what the office is
  // called and what the corpus prints, and because Lazaro above is already 'Foreign
  // Secretary' — the Philippines uses secretaries, and the roster should not translate that
  // away. SEATS in scripts/roster-seats.ts was extended to map 国防部长 onto it; without that
  // this entry would resolve to nothing and the seat would still read unclaimed.
  //
  // Bare 'teodoro' is safe here, unlike 'albanese': all three occurrences in the corpus are
  // him. Note 菲防长 (abbreviated 菲 + 防长) appears too and the seat detector cannot see it —
  // 菲 is not a country alias in data/countries.ts. A known gap, not a defect in this entry.
  { id: 'gilberto-teodoro', name: 'Gilberto Teodoro', role: 'Defence Secretary', home: 'PHL', short: 'Teodoro',
    aliases: ['teodoro', '特奥多罗'] },
  { id: 'prabowo', name: 'Prabowo Subianto', role: 'President', home: 'IDN', short: 'Prabowo',
    aliases: ['prabowo', '普拉博沃'] },
  { id: 'sugiono', name: 'Sugiono', role: 'Foreign Minister', home: 'IDN',
    aliases: ['sugiono'] },
  // 安华 added 2026-09-10, extracted from the article rather than typed from recall. Deutsche
  // Welle Chinese heads 马来西亚首相安华打破该国政治惯例 — it names him AND states the office —
  // and that article was matching NOBODY, because his only Chinese alias was 安瓦尔 and the piece
  // uses 安华 exclusively. Both renderings are current: 安瓦尔 is the mainland transliteration,
  // 安华 the one Malaysian and DW Chinese copy uses.
  //
  // A DIFFERENT GAP FROM DISSANAYAKE AND LAZARO, and the reason the 2026-09-09 sweep could never
  // have found it: that sweep looked at entries whose aliases were LATIN-ONLY. Anwar's were not.
  // He had an alias in the right script and it was the wrong rendering of it — so a script-
  // coverage check passes him and he stays invisible anyway. Transliteration is a choice each
  // outlet makes, not a property of the language.
  //
  // Safe as a bare two-character alias on this corpus: 安华 occurs exactly once across 6,291
  // articles and it is him. Re-check if the feeds ever widen to business news — 安华 is also a
  // Chinese insurer's name, and Han has no word boundaries to protect against that.
  { id: 'anwar-ibrahim', name: 'Anwar Ibrahim', role: 'Prime Minister', home: 'MYS', short: 'Anwar',
    aliases: ['anwar ibrahim', '安瓦尔', '安华'] },
  { id: 'mohamad-hasan', name: 'Mohamad Hasan', role: 'Foreign Minister', home: 'MYS',
    aliases: ['mohamad hasan'] },
  { id: 'to-lam', name: 'To Lam', role: 'Communist Party General Secretary', home: 'VNM',
    aliases: ['to lam', 'tô lâm', '苏林'] },
  // FLAGGED 2026-09-09 and deliberately NOT changed. One Chinese article (stored twice) reads
  // 越南政府总理黎明兴 — "Vietnamese government Prime Minister" followed by a name the corpus
  // writes ONLY in Chinese characters. If that holds, this seat is stale. Left alone for two
  // reasons: it is a single story from one outlet, and romanising 黎明兴 from nothing but those
  // characters would be exactly the recall-based guess this file exists to prevent. Re-check when
  // a second source names the office; if it holds, UNLIST this entry rather than invent a spelling.
  { id: 'pham-minh-chinh', name: 'Pham Minh Chinh', role: 'Prime Minister', home: 'VNM',
    aliases: ['pham minh chinh', 'phạm minh chính'] },
  { id: 'bui-thanh-son', name: 'Bui Thanh Son', role: 'Deputy PM and Foreign Minister', home: 'VNM',
    aliases: ['bui thanh son'] },
  { id: 'lawrence-wong', name: 'Lawrence Wong', role: 'Prime Minister', home: 'SGP',
    aliases: ['lawrence wong', '黄循财'] },
  { id: 'vivian-balakrishnan', name: 'Vivian Balakrishnan', role: 'Foreign Minister', home: 'SGP', short: 'Balakrishnan',
    aliases: ['balakrishnan'] },
  { id: 'anutin', name: 'Anutin Charnvirakul', role: 'Prime Minister', home: 'THA', short: 'Anutin',
    aliases: ['anutin'] },
  { id: 'sihasak-phuangketkeow', name: 'Sihasak Phuangketkeow', role: 'Foreign Minister', home: 'THA', short: 'Sihasak',
    aliases: ['sihasak'] },
  { id: 'than-swe', name: 'Than Swe', role: 'Foreign Minister', home: 'MMR',
    aliases: ['than swe'] },
  // Corrected 2026-09-09 from 'Commander-in-Chief'. The audit's former/ex- flag could never
  // have caught this one: nothing calls him FORMER anything, he simply holds a different
  // office now. The Diplomat names him "Myanmar President" on 2026-09-07, and the snippet of
  // its earlier piece calls him "the general-turned-president since his inauguration in
  // April" — which states the transition and dates it. Reuters and the regional press call
  // him "leader", and both Vietnam items describe a STATE visit, a head-of-state act.
  //
  // Noted for the next reviewer, because it looks like a contradiction and is not: the same
  // outlet still wrote "Myanmar Military Chief" on 2026-08-20. Outlets keep using the title
  // a figure is known by; the piece that dates the inauguration outranks the shorthand.
  //
  // The lesson worth keeping is that a role goes stale two ways. Chauhan's had been VACATED,
  // and "Ex-CDS" in the headline is a marker a machine can grep for. This one was SUPERSEDED,
  // which leaves no marker at all — only reading the headlines beside the label finds it.
  // The army seat he left is UNLISTED: no source in the window names a successor.
  { id: 'min-aung-hlaing', name: 'Min Aung Hlaing', role: 'President', home: 'MMR',
    aliases: ['min aung hlaing', '敏昂莱'] },

  // ---- South Asia ----
  // Bangladesh is deliberately UNLISTED as of 2026-09-06, and this comment is the record of
  // why so nobody re-adds a guess. Muhammad Yunus and Touhid Hossain were the interim
  // administration; that arrangement was explicitly temporary, and the corpus carries 26
  // articles mentioning Bangladesh in which NEITHER is named even once. One of them
  // describes Sheikh Hasina pledging a "homecoming", so she is plainly not in office either.
  // No source in the window names a successor.
  //
  // Listing nobody costs nothing measurable: a stale entry matches zero articles anyway,
  // because officials who leave office stop being written about. It only carries a false
  // label. Add Bangladesh back the moment a source names its government.

  // Devanagari alias added 2026-09-09 from the corpus, which writes him दिसानायके. The audit
  // counted him SILENT while a Hindi headline named him beside Rajnath Singh. A Latin-only
  // alias hides a person in the 733 hi/ar/ja/ru articles: title_en exists only for Chinese,
  // so there is no Latin form of those headlines for either the matcher or a raw-text check.
  { id: 'anura-dissanayake', name: 'Anura Kumara Dissanayake', role: 'President', home: 'LKA', short: 'Dissanayake',
    aliases: ['dissanayake', 'दिसानायके'] },
  { id: 'vijitha-herath', name: 'Vijitha Herath', role: 'Foreign Minister', home: 'LKA', short: 'Herath',
    aliases: ['vijitha herath'] },
  // Corrected 2026-09-06 from the corpus. Sushila Karki's caretaker government has been
  // succeeded: current reporting names Balendra "Balen" Shah as prime minister, brought in
  // by the Gen Z-led protests ("PM Narendra Modi speaks to Nepal PM Balen"; "A year after
  // Gen Z-led protests swept Prime Minister Balendra 'Balen' Shah to power").
  //
  // Never a bare 'shah' — it is one of the commonest surnames in South Asia and would
  // collide with Amit Shah, who is also on this roster.
  { id: 'balen-shah', name: 'Balendra "Balen" Shah', role: 'Prime Minister', home: 'NPL', short: 'Balen Shah',
    aliases: ['balen shah', 'balendra shah', 'balen', 'बालेन'] },
  // Added 2026-09-10, from scripts/roster-seats.ts reporting NPL 外长 AND 外交部长 as unclaimed
  // seats. Nepal had exactly one entry before this, so the corpus was naming a foreign
  // minister this product had no node for at all.
  //
  // THE SURNAME AND THE GIVEN NAME REST ON DIFFERENT EVIDENCE, and the difference is recorded
  // because a future reader cannot otherwise tell.
  //
  // SURNAME — corpus. Three English items give it, all surname-only: "Foreign Minister Khanal
  // Compares India, China Relations to Parents", "India, Nepal must redefine ties amid shared
  // ecological threat: Foreign Minister Khanal". The Chinese prints 尼泊尔外交部长希希尔·卡纳尔,
  // which also states the office.
  //
  // GIVEN NAME — SUPPLIED BY THE OPERATOR on 2026-09-10, not found in the corpus. It was left
  // out for several hours precisely because romanising 希希尔 from the characters would be the
  // guess this file forbids and still refuses for Vietnam's 黎明兴. A person who knows the brief
  // telling you a name is a different and better source than a model recalling one, but it is
  // NOT the corpus, and this roster's review date only ever claimed the corpus. 希希尔 is
  // consistent with "Sishir", which is a consistency check and not independent confirmation.
  //
  // If a source ever prints it in Latin, delete this paragraph and say so.
  { id: 'khanal', name: 'Sishir Khanal', role: 'Foreign Minister', home: 'NPL', short: 'Khanal',
    aliases: ['khanal', 'sishir khanal', '卡纳尔', '希希尔'] },
  { id: 'mohamed-muizzu', name: 'Mohamed Muizzu', role: 'President', home: 'MDV', short: 'Muizzu',
    aliases: ['muizzu', '穆伊兹'] },
  { id: 'abdulla-khaleel', name: 'Abdulla Khaleel', role: 'Foreign Minister', home: 'MDV', short: 'Khaleel',
    aliases: ['abdulla khaleel'] },
  { id: 'amir-khan-muttaqi', name: 'Amir Khan Muttaqi', role: 'Foreign Minister', home: 'AFG', short: 'Muttaqi',
    aliases: ['muttaqi', 'متقی'] },

  // ---- Americas and Africa ----
  { id: 'javier-milei', name: 'Javier Milei', role: 'President', home: 'ARG', short: 'Milei',
    aliases: ['milei', '米莱'] },
  { id: 'lula', name: 'Luiz Inacio Lula da Silva', role: 'President', home: 'BRA', short: 'Lula',
    aliases: ['lula', '卢拉'] },
  { id: 'nicolas-maduro', name: 'Nicolas Maduro', role: 'President', home: 'VEN', short: 'Maduro',
    aliases: ['maduro', '马杜罗'] },
  { id: 'yvan-gil', name: 'Yvan Gil', role: 'Foreign Minister', home: 'VEN',
    aliases: ['yvan gil'] },
  { id: 'mauro-vieira', name: 'Mauro Vieira', role: 'Foreign Minister', home: 'BRA', short: 'Vieira',
    aliases: ['mauro vieira'] },
  { id: 'gerardo-werthein', name: 'Gerardo Werthein', role: 'Foreign Minister', home: 'ARG', short: 'Werthein',
    aliases: ['werthein'] },
  { id: 'delcy-rodriguez', name: 'Delcy Rodriguez', role: 'Vice President', home: 'VEN',
    aliases: ['delcy rodriguez', 'delcy rodríguez'] },
];

export const BY_PERSON = new Map(PEOPLE.map((p) => [p.id, p]));
