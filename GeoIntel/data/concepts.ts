import type { Domain } from './lexicon';

export const REQUIRED_LANGS = ['en', 'zh', 'hi', 'ja', 'ar', 'ru'] as const;
export type RequiredLang = (typeof REQUIRED_LANGS)[number];
export type TermLang = RequiredLang | 'ur' | 'fa' | 'ko';

export interface Concept {
  id: string;
  domain: Domain;
  terms: Partial<Record<TermLang, string[]>>;
  /** A required language with no safe word, and why. */
  gaps?: Partial<Record<RequiredLang, string>>;
}

/** Ties between domains go to the earlier one — the order DOMAIN_HINTS had. */
export const DOMAIN_ORDER: readonly Domain[] = [
  'Military', 'Maritime', 'Cyber', 'Economic', 'Energy', 'Space', 'Nuclear', 'Diplomatic', 'Internal', 'Technology',
];

/**
 * Which kind of pressure a report is about — the single source of that evidence (the escalation
 * LEXICON measures how intense, not which kind). One concept, one word or phrase per language, so a
 * Language Lens comparison measures framing rather than which language has the richer vocabulary. See
 * docs/specs/2026-09-24-shared-concepts-design.md; tests/concepts.test.ts fails if a concept lacks a
 * required language without a stated reason.
 *
 * Words come from the corpus's own recurring vocabulary. Chinese lists Simplified and Traditional forms
 * (Taiwan outlets are filed as zh). A word Chinese and Japanese share is listed once, under zh, and read
 * in both; ja holds Japanese-only forms. Russian and Arabic entries are stems where inflection varies.
 */
export const CONCEPTS: readonly Concept[] = [
  // ── Military ──
  { id: 'armed-forces', domain: 'Military', terms: {
    en: ['military', 'army', 'armed forces', 'troop', 'soldier', 'brigade', 'battalion', 'pla'],
    zh: ['军', '軍', '部队', '部隊', '士兵', '兵力'],
    hi: ['सेना', 'सैनिक', 'सैन्य', 'फौज'],
    ja: ['兵士', '自衛隊'],
    ar: ['جيش', 'قوات', 'جنود', 'عسكري', 'عسكرى'],
    ru: ['арми', 'военн', 'войск', 'солдат', 'вооруженн', 'вооружённ', 'всу'],
  } },
  { id: 'border', domain: 'Military', terms: {
    en: ['border', 'boundary', 'frontier', 'line of control', 'line of actual control', 'lac', 'loc'],
    zh: ['边境', '邊境', '边界', '邊界', '实控线', '實控線'],
    hi: ['सीमा', 'एलएसी', 'एलओसी', 'नियंत्रण रेखा'],
    ja: ['国境'],
    ar: ['حدودي', 'الحدود البرية'],
    ru: ['граница', 'границе', 'границы', 'границу', 'пограничн'],
  } },
  { id: 'invasion', domain: 'Military', terms: {
    en: ['invasion', 'invade', 'invading', 'incursion', 'infiltration', 'airspace violation'],
    zh: ['入侵', '侵入', '越境', '侵略'],
    hi: ['घुसपैठ', 'आक्रमण'],
    ja: ['侵攻'],
    ar: ['اجتياح', 'توغل', 'تسلل'],
    ru: ['вторжени', 'наступлени'],
  } },
  { id: 'armed-attack', domain: 'Military', terms: {
    en: ['attack', 'strike', 'airstrike', 'air strike', 'missile strike', 'drone strike', 'bombing', 'bombardment', 'shelling', 'artillery'],
    zh: ['袭击', '襲擊', '攻击', '攻擊', '空袭', '空襲', '轰炸', '轟炸', '炮击', '砲擊'],
    hi: ['हमला', 'हमले', 'हवाई हमला', 'एयरस्ट्राइक', 'बमबारी', 'गोलाबारी'],
    ja: ['攻撃', '襲撃', '空爆', '爆撃', '砲撃'],
    ar: ['هجوم', 'هجمات', 'غارة', 'غارات', 'قصف', 'ضربة', 'ضربات'],
    ru: ['атак', 'удар', 'авиаудар', 'обстрел', 'бомбардиров', 'нападени'],
    ur: ['حملہ'],
  } },
  { id: 'missiles', domain: 'Military', terms: {
    en: ['missile', 'rocket fire', 'rocket attack'],
    zh: ['导弹', '導彈', '飞弹', '飛彈', '火箭弹', '火箭彈'],
    hi: ['मिसाइल', 'रॉकेट'],
    ja: ['ミサイル', 'ロケット弾'],
    ar: ['صاروخ', 'صواريخ'],
    ru: ['ракет'],
  } },
  { id: 'war-and-clashes', domain: 'Military', terms: {
    en: ['war', 'warfare', 'clash', 'skirmish', 'firefight', 'conflict', 'hostilities', 'standoff', 'combat', 'ceasefire violation'],
    zh: ['冲突', '衝突', '交火', '战争', '戰爭', '开战', '開戰', '战事', '戰事'],
    hi: ['युद्ध', 'जंग', 'झड़प', 'संघर्ष'],
    ja: ['戦争', '交戦', '紛争', '戦闘'],
    ar: ['حرب', 'معارك', 'اشتباك', 'نزاع'],
    ru: ['войн', 'конфликт', 'столкновени', 'боевые действия'],
  } },
  { id: 'exercises', domain: 'Military', terms: {
    en: ['military exercise', 'military drill', 'joint exercise', 'war game', 'wargame', 'live-fire', 'live fire'],
    zh: ['军演', '軍演', '演习', '演習', '实弹', '實彈', '操演'],
    hi: ['युद्धाभ्यास', 'सैन्य अभ्यास'],
    ja: ['実弾'],
    ar: ['مناورات', 'تدريبات عسكرية'],
    ru: ['учения', 'учений', 'учениях'],
  } },
  { id: 'mobilisation', domain: 'Military', terms: {
    en: ['mobilisation', 'mobilization', 'troop buildup', 'military buildup', 'troop deployment'],
    zh: ['动员', '動員', '增兵'],
    hi: ['तैनाती', 'लामबंदी'],
    ja: ['増派'],
    ar: ['تعبئة', 'حشود عسكرية'],
    ru: ['мобилизаци'],
  } },
  { id: 'casualties', domain: 'Military', terms: {
    en: ['casualties', 'casualty', 'troops killed', 'soldiers killed', 'killed in action'],
    zh: ['伤亡', '傷亡'],
    hi: ['हताहत', 'शहीद'],
    ja: ['死傷'],
    ar: ['خسائر بشرية', 'قتلى وجرحى', 'شهداء'],
  }, gaps: { ru: 'потери also means financial losses and погибшие covers accidents: no word that means casualties of fighting' } },
  { id: 'weapons', domain: 'Military', terms: {
    en: ['weapon', 'arms sale', 'arms deal', 'arms race', 'arms supplies', 'ammunition', 'munitions', 'arsenal'],
    zh: ['武器', '军售', '軍售', '弹药', '彈藥', '军火', '軍火'],
    hi: ['हथियार', 'गोला-बारूद', 'गोला बारूद', 'शस्त्र'],
    ja: ['弾薬', '兵器'],
    ar: ['أسلحة', 'سلاح', 'ذخيرة', 'ذخائر'],
    ru: ['оружи', 'вооружени', 'боеприпас'],
  } },
  { id: 'defence', domain: 'Military', terms: {
    en: ['defence', 'defense', 'pentagon'],
    zh: ['国防', '國防', '防务', '防務', '防空'],
    hi: ['रक्षा मंत्री', 'रक्षा मंत्रालय', 'रक्षा बजट', 'वायु रक्षा', 'डिफेंस'],
    ja: ['防衛'],
    ar: ['وزير الدفاع', 'وزارة الدفاع', 'الدفاع الجوي', 'دفاعات'],
    ru: ['оборон'],
  } },
  { id: 'drones', domain: 'Military', terms: {
    en: ['drone'],
    zh: ['无人机', '無人機'],
    hi: ['ड्रोन'],
    ja: ['ドローン'],
    ar: ['طائرة مسيرة', 'طائرات مسيرة', 'مسيّرة', 'مسيّرات'],
    ru: ['беспилотник', 'дрон'],
  } },
  { id: 'military-aircraft', domain: 'Military', terms: {
    en: ['fighter jet', 'warplane', 'military aircraft', 'scrambled jets', 'bomber', 'fighter aircraft'],
    zh: ['战机', '戰機', '军机', '軍機', '共机', '共機', '战斗机', '戰鬥機', '轰炸机', '轟炸機'],
    hi: ['लड़ाकू विमान', 'फाइटर जेट', 'बमवर्षक'],
    ja: ['戦闘機', '軍用機', '哨戒機', '爆撃機'],
    ar: ['مقاتلات', 'طائرات حربية', 'طائرة حربية'],
    ru: ['истребител', 'бомбардировщик'],
  } },
  { id: 'withdrawal', domain: 'Military', terms: {
    en: ['disengagement', 'troop withdrawal', 'pullback', 'withdraw troops'],
    zh: ['撤军', '撤軍', '脱离接触', '脫離接觸'],
    hi: ['सेना की वापसी', 'डिसएंगेजमेंट'],
    ja: ['撤兵', '撤収'],
    ar: ['انسحاب القوات', 'سحب القوات'],
    ru: ['отвод войск', 'вывод войск'],
  } },

  // ── Maritime ──
  { id: 'navy', domain: 'Maritime', terms: {
    en: ['navy', 'naval', 'warship', 'destroyer', 'frigate'],
    zh: ['海军', '海軍', '军舰', '軍艦', '舰艇', '艦艇', '驱逐舰', '驅逐艦', '护卫舰', '護衛艦', '舰队', '艦隊'],
    hi: ['नौसेना', 'युद्धपोत', 'विध्वंसक'],
    ja: ['駆逐艦'],
    ar: ['البحرية', 'سفينة حربية', 'سفن حربية', 'مدمرة', 'فرقاطة'],
    ru: ['флот', 'военно-морск', 'корабл'],
  } },
  { id: 'aircraft-carrier', domain: 'Maritime', terms: {
    en: ['aircraft carrier', 'carrier strike group', 'carrier group'],
    zh: ['航母', '航舰', '航艦', '航空母舰', '航空母艦'],
    hi: ['विमानवाहक'],
    ja: ['空母'],
    ar: ['حاملة طائرات', 'حاملة الطائرات'],
    ru: ['авианос'],
  } },
  { id: 'submarine', domain: 'Maritime', terms: {
    en: ['submarine'],
    zh: ['潜艇', '潛艇', '潜舰', '潛艦'],
    hi: ['पनडुब्बी'],
    ja: ['潜水艦'],
    ar: ['غواصة', 'غواصات'],
    ru: ['подводная лодка', 'подводной лодки', 'подводные лодки', 'подводных лодок', 'субмарин'],
  } },
  { id: 'sea-areas', domain: 'Maritime', terms: {
    en: ['strait', 'shoal', 'reef', 'territorial waters', 'sea lane', 'maritime'],
    zh: ['海峡', '海峽', '台海', '领海', '領海', '海域', '礁'],
    hi: ['जलडमरूमध्य', 'समुद्री', 'जलक्षेत्र'],
    ja: ['接続水域'],
    ar: ['مضيق', 'المياه الإقليمية', 'بحري'],
    ru: ['пролив', 'акватори', 'морск'],
  } },
  { id: 'coastguard', domain: 'Maritime', terms: {
    en: ['coast guard', 'coastguard', 'water cannon', 'maritime militia'],
    zh: ['海警', '水炮', '海上民兵'],
    hi: ['तटरक्षक'],
    ja: ['海上保安', '放水'],
    ar: ['خفر السواحل'],
    ru: ['береговой охран', 'береговая охран'],
  } },
  { id: 'blockade', domain: 'Maritime', terms: {
    en: ['blockade', 'freedom of navigation'],
    zh: ['封锁', '封鎖', '航行自由'],
    hi: ['नाकाबंदी'],
    ja: ['航行の自由'],
    ar: ['حصار', 'حرية الملاحة'],
    ru: ['блокад'],
  } },
  { id: 'vessels', domain: 'Maritime', terms: {
    en: ['vessel', 'ship', 'tanker', 'shipping lane'],
    zh: ['船', '油轮', '油輪'],
    hi: ['जहाज', 'टैंकर'],
    ja: ['タンカー'],
    ar: ['سفينة', 'سفن', 'ناقلة'],
    ru: ['судн', 'танкер', 'сухогруз'],
  } },

  // ── Cyber ──
  { id: 'cyber-attack', domain: 'Cyber', terms: {
    en: ['cyberattack', 'cyber attack', 'cyber-attack', 'hack', 'hacker', 'hacking', 'malware', 'ransomware', 'spyware', 'phishing', 'data breach', 'network intrusion', 'apt group'],
    zh: ['网络攻击', '網路攻擊', '網絡攻擊', '黑客', '駭客', '恶意软件', '惡意軟體', '勒索软件', '勒索軟體', '数据泄露', '資料外洩'],
    hi: ['साइबर हमला', 'साइबर हमले', 'हैकर', 'हैकिंग', 'मालवेयर'],
    ja: ['サイバー攻撃', 'ハッカー', 'マルウェア', 'ランサムウェア', '不正アクセス'],
    ar: ['هجوم سيبراني', 'هجمات سيبرانية', 'قراصنة', 'برمجيات خبيثة'],
    ru: ['кибератак', 'хакер'],
  } },
  { id: 'cyber', domain: 'Cyber', terms: {
    en: ['cyber', 'cybersecurity', 'cyberspace', 'critical infrastructure'],
    zh: ['网络安全', '網路安全', '網絡安全', '网络空间', '網路空間'],
    hi: ['साइबर'],
    ja: ['サイバー'],
    ar: ['سيبراني', 'الأمن السيبراني', 'الفضاء الإلكتروني', 'الفضاء السيبراني'],
    ru: ['кибер'],
  } },
  { id: 'espionage', domain: 'Cyber', terms: {
    en: ['espionage', 'spy', 'spies', 'disinformation', 'influence operation', 'information warfare'],
    zh: ['间谍', '間諜', '虚假信息', '假訊息', '认知战', '認知戰', '情报战', '情報戰'],
    hi: ['जासूसी', 'जासूस', 'दुष्प्रचार'],
    ja: ['スパイ', '諜報', '偽情報', '認知戦', '情報戦'],
    ar: ['تجسس', 'جاسوس', 'تضليل'],
    ru: ['шпион', 'дезинформаци'],
  } },

  // ── Economic ──
  { id: 'trade', domain: 'Economic', terms: {
    en: ['trade', 'export', 'import', 'trade deal'],
    zh: ['贸易', '貿易', '出口', '进口', '進口'],
    hi: ['व्यापार', 'निर्यात', 'आयात'],
    ja: ['輸出', '輸入'],
    ar: ['تجارة', 'تجاري', 'صادرات', 'واردات'],
    ru: ['торгов', 'экспорт', 'импорт'],
  } },
  { id: 'tariffs', domain: 'Economic', terms: {
    en: ['tariff', 'trade war', 'customs duty', 'tariff war', 'economic war', 'economic warfare'],
    zh: ['关税', '關稅', '贸易战', '貿易戰', '关税战', '關稅戰', '经济战', '經濟戰'],
    hi: ['टैरिफ', 'व्यापार युद्ध', 'आयात शुल्क', 'आर्थिक युद्ध', 'टैरिफ युद्ध'],
    ja: ['関税', '貿易戦争', '関税戦争', '経済戦争'],
    ar: ['رسوم جمركية', 'جمارك', 'جمركية', 'حرب تجارية', 'حرب الجمارك', 'حرب اقتصادية', 'حرب الرسوم'],
    ru: ['пошлин', 'торговая война', 'торговой войны', 'торговую войну', 'экономическая война', 'экономической войны', 'тарифная война', 'тарифной войны'],
  } },
  { id: 'sanctions', domain: 'Economic', terms: {
    en: ['sanction', 'embargo'],
    zh: ['制裁', '禁运', '禁運'],
    hi: ['प्रतिबंध'],
    ja: ['禁輸'],
    ar: ['عقوبات', 'حظر تصدير'],
    ru: ['санкци', 'эмбарго'],
    fa: ['تحریم'],
  } },
  { id: 'economy', domain: 'Economic', terms: {
    en: ['economy', 'economic', 'investment', 'currency', 'gdp', 'rare earth'],
    zh: ['经济', '經濟', '投资', '投資', '汇率', '匯率', '稀土'],
    hi: ['अर्थव्यवस्था', 'आर्थिक', 'निवेश'],
    ja: ['経済', '通貨', '為替', 'レアアース'],
    ar: ['اقتصاد', 'استثمار', 'عملة', 'عملات'],
    ru: ['экономик', 'экономическ', 'инвестици', 'валют'],
  } },

  // ── Energy ──
  { id: 'oil-and-gas', domain: 'Energy', terms: {
    en: ['oil', 'gas', 'lng', 'crude', 'refinery', 'pipeline', 'oil supply', 'strait closure', 'energy'],
    zh: ['石油', '原油', '天然气', '天然氣', '油气', '油氣', '能源', '炼油', '煉油', '输油管', '輸油管'],
    hi: ['तेल', 'कच्चा तेल', 'गैस', 'ऊर्जा', 'पाइपलाइन', 'रिफाइनरी'],
    ja: ['天然ガス', 'ガス', 'エネルギー', 'パイプライン', '製油'],
    ar: ['نفط', 'الغاز', 'الطاقة', 'أنابيب', 'مصفاة'],
    ru: ['нефт', 'газопровод', 'природный газ', 'природного газа', 'спг', 'энерг'],
  } },
  { id: 'power-plants', domain: 'Energy', terms: {
    en: ['nuclear plant', 'nuclear power plant', 'power plant', 'power grid', 'electricity'],
    zh: ['核电', '核電', '电网', '電網', '发电厂', '發電廠', '电力', '電力'],
    hi: ['बिजली संयंत्र', 'परमाणु संयंत्र', 'बिजली'],
    ja: ['原発', '原子力発電', '送電'],
    ar: ['محطة نووية', 'محطة الطاقة', 'محطة كهرباء', 'الكهرباء'],
    ru: ['аэс', 'электростанц', 'электроэнерг'],
  } },

  // ── Space ──
  { id: 'space', domain: 'Space', terms: {
    en: ['satellite', 'orbit', 'launch vehicle', 'space station', 'isro', 'anti-satellite', 'satellite jamming', 'spacecraft', 'space agency'],
    zh: ['卫星', '衛星', '太空', '航天', '空间站', '太空站'],
    hi: ['उपग्रह', 'अंतरिक्ष', 'इसरो', 'सैटेलाइट'],
    ja: ['宇宙'],
    ar: ['قمر صناعي', 'أقمار صناعية', 'الفضاء'],
    ru: ['спутниковой', 'спутниковых', 'запуск спутник', 'космос', 'космическ', 'орбит', 'роскосмос', 'космический корабль'],
  } },

  // ── Nuclear ──
  { id: 'nuclear', domain: 'Nuclear', terms: {
    en: ['nuclear', 'warhead', 'uranium', 'enrichment', 'iaea', 'nuclear test', 'denuclearisation', 'denuclearization'],
    zh: ['核武', '核武器', '核弹', '核彈', '核试验', '核試驗', '核设施', '核設施', '核计划', '核計畫', '核问题', '核問題', '核协议', '核協議',
      '核谈判', '核談判', '无核化', '無核化', '非核化', '核威慑', '核威懾', '铀', '鈾', '浓缩', '濃縮', '国际原子能机构', '國際原子能總署'],
    hi: ['परमाणु', 'न्यूक्लियर', 'यूरेनियम'],
    ja: ['核兵器', '核実験', '核開発', '核施設', '核合意', '核弾頭', '核ミサイル', 'ウラン濃縮', '濃縮ウラン'],
    ar: ['نووي', 'نووى', 'يورانيوم', 'تخصيب', 'الطاقة الذرية'],
    ru: ['ядерн', 'урана', 'обогащени', 'магатэ'],
  } },
  { id: 'strategic-missiles', domain: 'Nuclear', terms: {
    en: ['ballistic missile', 'icbm', 'hypersonic'],
    zh: ['弹道导弹', '彈道導彈', '彈道飛彈', '洲际导弹', '洲際飛彈', '高超音速', '高超声速'],
    hi: ['बैलिस्टिक मिसाइल', 'हाइपरसोनिक', 'अंतरमहाद्वीपीय'],
    ja: ['弾道ミサイル', '大陸間弾道', '極超音速'],
    ar: ['صاروخ باليستي', 'صواريخ باليستية', 'فرط صوتي', 'فرط صوتية'],
    ru: ['баллистическ', 'гиперзвук', 'мбр'],
  } },

  // ── Diplomatic ──
  { id: 'talks', domain: 'Diplomatic', terms: {
    en: ['talks', 'negotiation', 'negotiate', 'negotiating', 'dialogue', 'bilateral talks', 'peace talks', 'border talks', 'boundary talks', 'border issue', 'boundary issue', 'boundary question', 'commander-level talks', 'corps commander', 'military talks', 'flag meeting', 'special representative'],
    zh: ['会谈', '會談', '谈判', '談判', '对话', '對話', '磋商', '会晤', '會晤', '边界谈判', '边境谈判', '边界问题', '边境问题', '邊界問題', '邊境問題', '边界会谈'],
    hi: ['वार्ता', 'बातचीत', 'संवाद', 'सीमा वार्ता', 'सीमा मुद्दे', 'सीमा मामलों'],
    ja: ['会談', '対話', '交渉', '国境交渉', '国境問題'],
    ar: ['مفاوضات', 'تفاوض', 'محادثات', 'حوار', 'مفاوضات حدودية', 'ترسيم الحدود'],
    ru: ['переговор', 'диалог', 'переговоры о границе', 'пограничные переговоры', 'демаркаци'],
    ur: ['مذاکرات'],
  } },
  { id: 'summits-and-visits', domain: 'Diplomatic', terms: {
    en: ['summit', 'visit', 'state visit'],
    zh: ['峰会', '峰會', '首脑', '首腦', '访问', '訪問', '出访', '出訪'],
    hi: ['शिखर सम्मेलन', 'शिखर वार्ता', 'दौरे', 'राजकीय यात्रा'],
    ja: ['首脳会談', '首脳会議', 'サミット', '訪米', '訪中', '訪日'],
    ar: ['قمة', 'زيارة'],
    ru: ['саммит', 'визит'],
  } },
  { id: 'envoys', domain: 'Diplomatic', terms: {
    en: ['ambassador', 'envoy', 'foreign minister', 'foreign ministry', 'diplomat', 'diplomatic', 'diplomacy', 'embassy', 'summoned envoy', 'recalled ambassador', 'expelled diplomat'],
    zh: ['大使', '外长', '外長', '外交', '外交部', '外交官', '使馆', '使館', '领事', '領事'],
    hi: ['राजदूत', 'विदेश मंत्री', 'विदेश मंत्रालय', 'राजनयिक', 'कूटनीति', 'कूटनीतिक', 'दूतावास'],
    ja: ['外相', '外務大臣', '外務省'],
    ar: ['سفير', 'سفارة', 'وزير الخارجية', 'وزارة الخارجية', 'دبلوماسي'],
    ru: ['посол', 'посольств', 'дипломат', 'министр иностранных дел', 'мид рф', 'мид россии'],
  } },
  { id: 'agreements', domain: 'Diplomatic', terms: {
    en: ['treaty', 'agreement', 'pact', 'communique', 'agreement signed', 'normalisation', 'normalization', 'resumed flights', 'prisoner exchange'],
    zh: ['条约', '條約', '协议', '協議', '协定', '協定', '公报', '公報', '共识', '共識'],
    hi: ['समझौता', 'समझौते', 'संधि'],
    ja: ['条約', '合意', '共同声明'],
    ar: ['معاهدة', 'اتفاق', 'اتفاقية', 'بيان مشترك'],
    ru: ['договор', 'соглашени', 'меморандум'],
  } },
  { id: 'peace-and-stability', domain: 'Diplomatic', terms: {
    en: ['peace and stability', 'peace in the taiwan strait', 'peaceful resolution', 'peaceful settlement'],
    zh: ['和平稳定', '和平與穩定', '和平与稳定', '台海和平', '和平解决', '和平解決'],
    hi: ['शांति और स्थिरता', 'शांतिपूर्ण समाधान'],
    ja: ['平和と安定', '海峡の平和', '海峡の安定', '平和的解決'],
    ar: ['السلام والاستقرار', 'حل سلمي'],
    ru: ['мир и стабильност', 'мирное урегулирование', 'мирного урегулирования'],
  } },
  { id: 'ceasefire', domain: 'Diplomatic', terms: {
    en: ['ceasefire', 'cease-fire', 'truce', 'de-escalation', 'deescalation', 'end the war', 'ending the war', 'end to the war', 'end of the war', 'end the conflict', 'ending the conflict'],
    zh: ['停火', '停战', '停戰', '休战', '休戰', '结束战争', '結束戰爭', '停止战争', '终结战争', '结束冲突'],
    hi: ['युद्धविराम', 'संघर्ष विराम', 'सीजफायर', 'युद्ध समाप्त', 'युद्ध खत्म', 'जंग खत्म', 'युद्ध रोक'],
    ja: ['停戦', '休戦', '戦争終結', '終戦'],
    ar: ['وقف إطلاق النار', 'هدنة', 'تهدئة', 'إنهاء الحرب', 'وقف الحرب', 'انتهاء الحرب'],
    ru: ['перемири', 'прекращение огня', 'прекращения огня', 'прекращении огня', 'деэскалаци', 'завершение войны', 'завершения войны', 'завершению войны', 'завершении войны', 'прекращение войны', 'прекращения войны', 'прекращению войны', 'прекращении войны', 'окончание войны', 'окончания войны', 'окончании войны'],
    ur: ['جنگ بندی'],
  } },

  // ── Internal ──
  { id: 'unrest', domain: 'Internal', terms: {
    en: ['riot', 'unrest', 'curfew', 'crackdown', 'protester', 'demonstrators', 'mass protest', 'anti-government', 'general strike', 'labour strike', 'labor strike', 'hunger strike', 'tear gas'],
    zh: ['骚乱', '騷亂', '示威', '游行', '遊行', '暴乱', '暴亂', '戒严', '戒嚴', '镇压', '鎮壓'],
    hi: ['दंगा', 'दंगे', 'कर्फ्यू', 'विरोध प्रदर्शन', 'प्रदर्शनकारी', 'आंसू गैस'],
    ja: ['暴動', 'デモ隊', '弾圧', '戒厳'],
    ar: ['احتجاجات', 'مظاهرات', 'تظاهرات', 'شغب', 'قمع', 'حظر تجول'],
    ru: ['беспорядк', 'протестующ', 'акции протеста', 'митинг', 'комендантск', 'репресси'],
  } },
  { id: 'politics', domain: 'Internal', terms: {
    en: ['election', 'coup', 'impeachment', 'purge'],
    zh: ['选举', '選舉', '大选', '大選', '政变', '政變', '罢免', '罷免', '肃清'],
    hi: ['चुनाव', 'तख्तापलट', 'महाभियोग'],
    ja: ['選挙', '知事選', '総裁選', 'クーデター', '粛清'],
    ar: ['انتخابات', 'انقلاب'],
    ru: ['выборы', 'выборах', 'выборов', 'переворот'],
  } },
  { id: 'militancy', domain: 'Internal', terms: {
    en: ['terror', 'terrorist', 'terrorism', 'terror attack', 'militant', 'insurgency', 'insurgent', 'separatist', 'suicide bomber'],
    zh: ['恐怖袭击', '恐怖襲擊', '恐袭', '恐襲', '恐怖分子', '武装分子', '武裝分子', '叛乱', '叛亂', '分裂分子'],
    hi: ['आतंकी', 'आतंकवाद', 'आतंकी हमला', 'आतंकी हमले', 'उग्रवादी', 'अलगाववादी', 'विद्रोही', 'विद्रोह'],
    ja: ['テロ', '過激派', '武装勢力', '分離主義'],
    ar: ['إرهاب', 'هجوم إرهابي', 'مسلحين', 'مسلحون', 'متمردين', 'انفصالي'],
    ru: ['террор', 'теракт', 'боевик', 'сепаратист', 'повстан'],
  } },

  // ── Technology ──
  { id: 'chips', domain: 'Technology', terms: {
    en: ['semiconductor', 'chip', 'chipmaker', 'export controls', 'export control', 'entity list', 'chip ban', 'chip war', 'export curb'],
    zh: ['半导体', '半導體', '芯片', '晶片', '光刻机', '光刻機', '出口管制', '实体清单', '實體清單', '芯片战'],
    hi: ['सेमीकंडक्टर', 'चिप', 'निर्यात नियंत्रण'],
    ja: ['半導体', '輸出規制', '輸出管理'],
    ar: ['أشباه الموصلات', 'رقائق', 'قيود التصدير'],
    ru: ['полупроводник', 'микросхем', 'чип', 'экспортный контроль', 'экспортного контроля'],
  } },
  { id: 'tech-and-telecom', domain: 'Technology', terms: {
    en: ['5g', 'huawei', 'ai model', 'artificial intelligence', 'telecom'],
    zh: ['华为', '華為', '人工智能', '电信', '電信'],
    hi: ['हुआवेई', 'कृत्रिम बुद्धिमत्ता', 'दूरसंचार'],
    ja: ['ファーウェイ', '人工知能'],
    ar: ['هواوي', 'الذكاء الاصطناعي', 'الجيل الخامس'],
    ru: ['хуавэй', 'искусственный интеллект', 'искусственного интеллекта', 'телеком'],
  } },
];

/** Phrases that contain a concept word but mean something else: they mask it and count for nothing. */
export const NEUTRAL: readonly string[] = [
  'heart attack', 'bargaining chip', 'blue-chip', 'blue chip',
  '冠军', '冠軍', '亚军', '亞軍', '季军', '季軍',   // champion, runner-up: 军 is not an army here
  '外交評論家',                                   // "diplomacy commentator": describes the writer, not the story
  'हवाई जहाज',                                    // aeroplane: जहाज is not a ship here
  'तेलंगाना', 'तेलुगु',                             // Telangana, Telugu: तेल is not oil here
  'सीमा हैदर',                                    // Seema Haider, a person: सीमा is not a border here
  'चिपक',                                         // "stick": चिप is not a chip here
  'за границей', 'за границу', 'из-за границы',   // "abroad": граница is not a front line here
  'маэстро',                                      // аэс inside maestro
  'war of words',                                 // a verbal spat, not a war
  '攻击抹黑', '抹黑攻击',                          // "attack and smear": the foreign ministry's stock rebuttal
  'नई ऊर्जा',                                     // "new energy" in a relationship, not oil and gas
];
