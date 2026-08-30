// Multilingual country gazetteer.
// `aliases` carries the forms an outlet actually prints in its own language —
// this is what lets a Xinhua piece and a PIB release resolve to the same actor.
// Latin-script aliases are matched case-insensitively; CJK/Devanagari/Cyrillic/Arabic
// are matched as-is.

export interface Country {
  iso: string;
  iso2: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  aliases: string[];
}

export const COUNTRIES: Country[] = [
  { iso: 'IND', iso2: 'IN', name: 'India', region: 'South Asia', lat: 22.0, lon: 79.0,
    aliases: ['india', 'indian', 'new delhi', 'bharat', '印度', '印方', 'भारत', 'हिंदुस्तान', 'Индия', 'الهند', 'بھارت', 'انڈیا', 'インド', '인도'] },
  { iso: 'CHN', iso2: 'CN', name: 'China', region: 'East Asia', lat: 35.0, lon: 103.0,
    aliases: ['china', 'chinese', 'beijing', 'peking', "people's republic of china", 'prc', '中国', '中方', '中华人民共和国', '大陆', '北京', 'चीन', 'Китай', 'الصين', 'چین', '中国', '중국'] },
  { iso: 'PAK', iso2: 'PK', name: 'Pakistan', region: 'South Asia', lat: 30.0, lon: 70.0,
    aliases: ['pakistan', 'pakistani', 'islamabad', 'rawalpindi', '巴基斯坦', '巴方', 'पाकिस्तान', 'Пакистан', 'باكستان', 'پاکستان'] },
  { iso: 'USA', iso2: 'US', name: 'United States', region: 'North America', lat: 39.0, lon: -98.0,
    aliases: ['united states', 'u.s.', 'us ', 'usa', 'america', 'american', 'washington', 'pentagon', 'white house', '美国', '美方', '华盛顿', '五角大楼', 'अमेरिका', 'संयुक्त राज्य', 'США', 'أمريكا', 'الولايات المتحدة', 'امریکہ', 'アメリカ', '미국'] },
  { iso: 'RUS', iso2: 'RU', name: 'Russia', region: 'Eurasia', lat: 61.0, lon: 90.0,
    aliases: ['russia', 'russian', 'moscow', 'kremlin', '俄罗斯', '俄方', '莫斯科', 'रूस', 'Россия', 'روسيا', 'روس', 'ロシア', '러시아'] },
  { iso: 'TWN', iso2: 'TW', name: 'Taiwan', region: 'East Asia', lat: 23.7, lon: 121.0,
    aliases: ['taiwan', 'taipei', 'taiwanese', 'republic of china', '台湾', '臺灣', '台方', '台北', 'ताइवान', 'Тайвань', 'تايوان', '台湾', '대만'] },
  { iso: 'JPN', iso2: 'JP', name: 'Japan', region: 'East Asia', lat: 36.0, lon: 138.0,
    aliases: ['japan', 'japanese', 'tokyo', '日本', '日方', '东京', 'जापान', 'Япония', 'اليابان', 'جاپان', '日本', '일본'] },
  { iso: 'BGD', iso2: 'BD', name: 'Bangladesh', region: 'South Asia', lat: 24.0, lon: 90.0,
    aliases: ['bangladesh', 'dhaka', '孟加拉国', '孟加拉', 'बांग्लादेश', 'Бангладеш', 'بنغلاديش', 'بنگلہ دیش'] },
  { iso: 'NPL', iso2: 'NP', name: 'Nepal', region: 'South Asia', lat: 28.3, lon: 84.0,
    aliases: ['nepal', 'kathmandu', '尼泊尔', 'नेपाल', 'Непал', 'نيبال'] },
  { iso: 'LKA', iso2: 'LK', name: 'Sri Lanka', region: 'South Asia', lat: 7.8, lon: 80.7,
    aliases: ['sri lanka', 'colombo', 'hambantota', '斯里兰卡', 'श्रीलंका', 'Шри-Ланка', 'سريلانكا'] },
  { iso: 'MMR', iso2: 'MM', name: 'Myanmar', region: 'Southeast Asia', lat: 21.0, lon: 96.0,
    aliases: ['myanmar', 'burma', 'naypyidaw', 'rakhine', '缅甸', 'म्यांमार', 'Мьянма', 'ميانمار'] },
  { iso: 'BTN', iso2: 'BT', name: 'Bhutan', region: 'South Asia', lat: 27.5, lon: 90.4,
    aliases: ['bhutan', 'thimphu', 'doklam', '不丹', '洞朗', 'भूटान', 'डोकलाम', 'Бутан'] },
  { iso: 'MDV', iso2: 'MV', name: 'Maldives', region: 'South Asia', lat: 3.2, lon: 73.2,
    aliases: ['maldives', 'male', '马尔代夫', 'मालदीव', 'Мальдивы'] },
  { iso: 'AFG', iso2: 'AF', name: 'Afghanistan', region: 'South Asia', lat: 33.9, lon: 67.7,
    aliases: ['afghanistan', 'kabul', 'taliban', '阿富汗', '塔利班', 'अफ़ग़ानिस्तान', 'Афганистан', 'أفغانستان', 'افغانستان'] },
  { iso: 'IRN', iso2: 'IR', name: 'Iran', region: 'Middle East', lat: 32.0, lon: 53.0,
    aliases: ['iran', 'iranian', 'tehran', 'chabahar', '伊朗', '德黑兰', 'ईरान', 'Иран', 'إيران', 'ایران'] },
  { iso: 'ISR', iso2: 'IL', name: 'Israel', region: 'Middle East', lat: 31.5, lon: 34.9,
    aliases: ['israel', 'israeli', 'jerusalem', 'tel aviv', 'idf', '以色列', 'इज़राइल', 'Израиль', 'إسرائيل', 'اسرائیل'] },
  { iso: 'UKR', iso2: 'UA', name: 'Ukraine', region: 'Europe', lat: 49.0, lon: 32.0,
    aliases: ['ukraine', 'ukrainian', 'kyiv', 'kiev', '乌克兰', '基辅', 'यूक्रेन', 'Украина', 'أوكرانيا'] },
  { iso: 'PRK', iso2: 'KP', name: 'North Korea', region: 'East Asia', lat: 40.0, lon: 127.0,
    aliases: ['north korea', 'dprk', 'pyongyang', '朝鲜', '北韩', '平壤', 'उत्तर कोरिया', 'КНДР', 'كوريا الشمالية', '북한'] },
  { iso: 'KOR', iso2: 'KR', name: 'South Korea', region: 'East Asia', lat: 36.5, lon: 127.8,
    aliases: ['south korea', 'republic of korea', 'seoul', '韩国', '南韩', '首尔', 'दक्षिण कोरिया', 'Южная Корея', 'كوريا الجنوبية', '한국'] },
  { iso: 'VNM', iso2: 'VN', name: 'Vietnam', region: 'Southeast Asia', lat: 16.0, lon: 106.0,
    aliases: ['vietnam', 'hanoi', '越南', 'वियतनाम', 'Вьетнам', 'فيتنام'] },
  { iso: 'PHL', iso2: 'PH', name: 'Philippines', region: 'Southeast Asia', lat: 12.9, lon: 122.0,
    aliases: ['philippines', 'manila', 'second thomas shoal', 'scarborough', '菲律宾', '仁爱礁', '黄岩岛', 'फिलीपींस', 'Филиппины', 'الفلبين'] },
  { iso: 'AUS', iso2: 'AU', name: 'Australia', region: 'Oceania', lat: -25.0, lon: 134.0,
    aliases: ['australia', 'canberra', 'aukus', '澳大利亚', '澳方', 'ऑस्ट्रेलिया', 'Австралия', 'أستراليا'] },
  { iso: 'GBR', iso2: 'GB', name: 'United Kingdom', region: 'Europe', lat: 54.0, lon: -2.0,
    aliases: ['united kingdom', 'britain', 'british', 'london', 'uk ', '英国', '伦敦', 'ब्रिटेन', 'Великобритания', 'بريطانيا', 'برطانیہ'] },
  { iso: 'FRA', iso2: 'FR', name: 'France', region: 'Europe', lat: 46.6, lon: 2.4,
    aliases: ['france', 'french', 'paris', '法国', '巴黎', 'फ़्रांस', 'Франция', 'فرنسا'] },
  { iso: 'DEU', iso2: 'DE', name: 'Germany', region: 'Europe', lat: 51.2, lon: 10.4,
    aliases: ['germany', 'german', 'berlin', '德国', '柏林', 'जर्मनी', 'Германия', 'ألمانيا'] },
  { iso: 'TUR', iso2: 'TR', name: 'Turkey', region: 'Middle East', lat: 39.0, lon: 35.0,
    aliases: ['turkey', 'turkiye', 'ankara', 'erdogan', '土耳其', 'तुर्की', 'Турция', 'تركيا'] },
  { iso: 'SAU', iso2: 'SA', name: 'Saudi Arabia', region: 'Middle East', lat: 24.0, lon: 45.0,
    aliases: ['saudi arabia', 'saudi', 'riyadh', '沙特阿拉伯', '沙特', 'सऊदी अरब', 'Саудовская Аравия', 'السعودية'] },
  { iso: 'ARE', iso2: 'AE', name: 'United Arab Emirates', region: 'Middle East', lat: 24.0, lon: 54.0,
    aliases: ['united arab emirates', 'uae', 'abu dhabi', 'dubai', '阿联酋', 'संयुक्त अरब अमीरात', 'ОАЭ', 'الإمارات'] },
  { iso: 'QAT', iso2: 'QA', name: 'Qatar', region: 'Middle East', lat: 25.3, lon: 51.2,
    aliases: ['qatar', 'doha', '卡塔尔', 'क़तर', 'Катар', 'قطر'] },
  { iso: 'IDN', iso2: 'ID', name: 'Indonesia', region: 'Southeast Asia', lat: -2.5, lon: 118.0,
    aliases: ['indonesia', 'jakarta', 'natuna', '印度尼西亚', '印尼', 'इंडोनेशिया', 'Индонезия', 'إندونيسيا'] },
  { iso: 'MYS', iso2: 'MY', name: 'Malaysia', region: 'Southeast Asia', lat: 4.2, lon: 102.0,
    aliases: ['malaysia', 'kuala lumpur', '马来西亚', 'मलेशिया', 'Малайзия', 'ماليزيا'] },
  { iso: 'SGP', iso2: 'SG', name: 'Singapore', region: 'Southeast Asia', lat: 1.35, lon: 103.8,
    aliases: ['singapore', '新加坡', 'सिंगापुर', 'Сингапур', 'سنغافورة'] },
  { iso: 'THA', iso2: 'TH', name: 'Thailand', region: 'Southeast Asia', lat: 15.0, lon: 101.0,
    aliases: ['thailand', 'bangkok', '泰国', 'थाईलैंड', 'Таиланд', 'تايلاند'] },
  { iso: 'KAZ', iso2: 'KZ', name: 'Kazakhstan', region: 'Central Asia', lat: 48.0, lon: 67.0,
    aliases: ['kazakhstan', 'astana', '哈萨克斯坦', 'कज़ाख़िस्तान', 'Казахстан', 'كازاخستان'] },
  { iso: 'UZB', iso2: 'UZ', name: 'Uzbekistan', region: 'Central Asia', lat: 41.4, lon: 64.6,
    aliases: ['uzbekistan', 'tashkent', '乌兹别克斯坦', 'उज़्बेकिस्तान', 'Узбекистан'] },
  { iso: 'TJK', iso2: 'TJ', name: 'Tajikistan', region: 'Central Asia', lat: 38.9, lon: 71.3,
    aliases: ['tajikistan', 'dushanbe', '塔吉克斯坦', 'ताजिकिस्तान', 'Таджикистан'] },
  { iso: 'MNG', iso2: 'MN', name: 'Mongolia', region: 'East Asia', lat: 46.9, lon: 103.8,
    aliases: ['mongolia', 'ulaanbaatar', '蒙古', 'मंगोलिया', 'Монголия'] },
  { iso: 'EGY', iso2: 'EG', name: 'Egypt', region: 'Middle East', lat: 26.8, lon: 30.8,
    aliases: ['egypt', 'cairo', 'suez', '埃及', '苏伊士', 'मिस्र', 'Египет', 'مصر'] },
  { iso: 'ETH', iso2: 'ET', name: 'Ethiopia', region: 'Africa', lat: 9.1, lon: 40.5,
    aliases: ['ethiopia', 'addis ababa', '埃塞俄比亚', 'इथियोपिया', 'Эфиопия', 'إثيوبيا'] },
  { iso: 'NGA', iso2: 'NG', name: 'Nigeria', region: 'Africa', lat: 9.1, lon: 8.7,
    aliases: ['nigeria', 'abuja', '尼日利亚', 'नाइजीरिया', 'Нигерия', 'نيجيريا'] },
  { iso: 'ZAF', iso2: 'ZA', name: 'South Africa', region: 'Africa', lat: -29.0, lon: 24.0,
    aliases: ['south africa', 'pretoria', 'johannesburg', '南非', 'दक्षिण अफ़्रीका', 'ЮАР', 'جنوب أفريقيا'] },
  { iso: 'BRA', iso2: 'BR', name: 'Brazil', region: 'South America', lat: -14.2, lon: -51.9,
    aliases: ['brazil', 'brasilia', '巴西', 'ब्राज़ील', 'Бразилия', 'البرازيل'] },
  { iso: 'CAN', iso2: 'CA', name: 'Canada', region: 'North America', lat: 56.1, lon: -106.3,
    aliases: ['canada', 'ottawa', '加拿大', 'कनाडा', 'Канада', 'كندا'] },
  { iso: 'MEX', iso2: 'MX', name: 'Mexico', region: 'North America', lat: 23.6, lon: -102.6,
    aliases: ['mexico', 'mexico city', '墨西哥', 'मेक्सिको', 'Мексика', 'المكسيك'] },
  { iso: 'POL', iso2: 'PL', name: 'Poland', region: 'Europe', lat: 51.9, lon: 19.1,
    aliases: ['poland', 'warsaw', '波兰', 'पोलैंड', 'Польша', 'بولندا'] },
  { iso: 'ITA', iso2: 'IT', name: 'Italy', region: 'Europe', lat: 41.9, lon: 12.6,
    aliases: ['italy', 'rome', '意大利', 'इटली', 'Италия', 'إيطاليا'] },
  { iso: 'ESP', iso2: 'ES', name: 'Spain', region: 'Europe', lat: 40.5, lon: -3.7,
    aliases: ['spain', 'madrid', '西班牙', 'स्पेन', 'Испания', 'إسبانيا'] },
  { iso: 'NLD', iso2: 'NL', name: 'Netherlands', region: 'Europe', lat: 52.1, lon: 5.3,
    aliases: ['netherlands', 'dutch', 'the hague', 'asml', '荷兰', 'नीदरलैंड', 'Нидерланды'] },
  { iso: 'SWE', iso2: 'SE', name: 'Sweden', region: 'Europe', lat: 60.1, lon: 18.6,
    aliases: ['sweden', 'stockholm', '瑞典', 'स्वीडन', 'Швеция'] },
  { iso: 'FIN', iso2: 'FI', name: 'Finland', region: 'Europe', lat: 61.9, lon: 25.7,
    aliases: ['finland', 'helsinki', '芬兰', 'फ़िनलैंड', 'Финляндия'] },
  { iso: 'NOR', iso2: 'NO', name: 'Norway', region: 'Europe', lat: 60.5, lon: 8.5,
    aliases: ['norway', 'oslo', '挪威', 'नॉर्वे', 'Норвегия'] },
  { iso: 'GRC', iso2: 'GR', name: 'Greece', region: 'Europe', lat: 39.1, lon: 21.8,
    aliases: ['greece', 'athens', '希腊', 'ग्रीस', 'Греция', 'اليونان'] },
  { iso: 'BLR', iso2: 'BY', name: 'Belarus', region: 'Europe', lat: 53.7, lon: 27.9,
    aliases: ['belarus', 'minsk', '白俄罗斯', 'बेलारूस', 'Беларусь'] },
  { iso: 'GEO', iso2: 'GE', name: 'Georgia', region: 'Eurasia', lat: 42.3, lon: 43.4,
    aliases: ['georgia', 'tbilisi', '格鲁吉亚', 'जॉर्जिया', 'Грузия'] },
  { iso: 'ARM', iso2: 'AM', name: 'Armenia', region: 'Eurasia', lat: 40.1, lon: 45.0,
    aliases: ['armenia', 'yerevan', '亚美尼亚', 'आर्मेनिया', 'Армения'] },
  { iso: 'AZE', iso2: 'AZ', name: 'Azerbaijan', region: 'Eurasia', lat: 40.1, lon: 47.6,
    aliases: ['azerbaijan', 'baku', 'nagorno-karabakh', '阿塞拜疆', 'अज़रबैजान', 'Азербайджан'] },
  { iso: 'SYR', iso2: 'SY', name: 'Syria', region: 'Middle East', lat: 34.8, lon: 39.0,
    aliases: ['syria', 'damascus', '叙利亚', 'सीरिया', 'Сирия', 'سوريا'] },
  { iso: 'IRQ', iso2: 'IQ', name: 'Iraq', region: 'Middle East', lat: 33.2, lon: 43.7,
    aliases: ['iraq', 'baghdad', '伊拉克', 'इराक़', 'Ирак', 'العراق'] },
  { iso: 'YEM', iso2: 'YE', name: 'Yemen', region: 'Middle East', lat: 15.6, lon: 48.0,
    aliases: ['yemen', 'houthi', 'sanaa', 'bab el-mandeb', '也门', '胡塞', 'यमन', 'Йемен', 'اليمن'] },
  { iso: 'LBN', iso2: 'LB', name: 'Lebanon', region: 'Middle East', lat: 33.9, lon: 35.9,
    aliases: ['lebanon', 'beirut', 'hezbollah', '黎巴嫩', '真主党', 'लेबनान', 'Ливан', 'لبنان'] },
  { iso: 'LBY', iso2: 'LY', name: 'Libya', region: 'Africa', lat: 26.3, lon: 17.2,
    aliases: ['libya', 'tripoli', '利比亚', 'लीबिया', 'Ливия', 'ليبيا'] },
  { iso: 'SDN', iso2: 'SD', name: 'Sudan', region: 'Africa', lat: 12.9, lon: 30.2,
    aliases: ['sudan', 'khartoum', 'port sudan', '苏丹', 'सूडान', 'Судан', 'السودان'] },
  { iso: 'SOM', iso2: 'SO', name: 'Somalia', region: 'Africa', lat: 5.2, lon: 46.2,
    aliases: ['somalia', 'mogadishu', 'al-shabaab', '索马里', 'सोमालिया', 'Сомали', 'الصومال'] },
  { iso: 'COD', iso2: 'CD', name: 'DR Congo', region: 'Africa', lat: -4.0, lon: 21.8,
    aliases: ['dr congo', 'democratic republic of the congo', 'kinshasa', '刚果金', 'कांगो', 'ДР Конго'] },
  { iso: 'VEN', iso2: 'VE', name: 'Venezuela', region: 'South America', lat: 6.4, lon: -66.6,
    aliases: ['venezuela', 'caracas', '委内瑞拉', 'वेनेज़ुएला', 'Венесуэла', 'فنزويلا'] },
  { iso: 'ARG', iso2: 'AR', name: 'Argentina', region: 'South America', lat: -38.4, lon: -63.6,
    aliases: ['argentina', 'buenos aires', '阿根廷', 'अर्जेंटीना', 'Аргентина'] },
  { iso: 'NZL', iso2: 'NZ', name: 'New Zealand', region: 'Oceania', lat: -40.9, lon: 174.9,
    aliases: ['new zealand', 'wellington', '新西兰', 'न्यूज़ीलैंड', 'Новая Зеландия'] },
  { iso: 'CHE', iso2: 'CH', name: 'Switzerland', region: 'Europe', lat: 46.8, lon: 8.2,
    aliases: ['switzerland', 'bern', 'geneva', '瑞士', 'स्विट्ज़रलैंड', 'Швейцария'] },
];

export const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));
export const BY_ISO2 = new Map(COUNTRIES.map((c) => [c.iso2, c]));

/** Flashpoints and geographies that are not states but drive dyad attribution. */
export interface Hotspot {
  id: string;
  name: string;
  aliases: string[];
  parties: string[];   // ISO3 of the states implicated
  lat: number;
  lon: number;
  domain: string;
}

export const HOTSPOTS: Hotspot[] = [
  { id: 'lac', name: 'Line of Actual Control', aliases: ['line of actual control', 'lac ', 'galwan', 'pangong', 'depsang', 'demchok', 'yangtse', '实际控制线', '加勒万', '班公湖', '德普桑', 'वास्तविक नियंत्रण रेखा'], parties: ['IND', 'CHN'], lat: 34.0, lon: 78.5, domain: 'Military' },
  { id: 'ladakh', name: 'Eastern Ladakh', aliases: ['ladakh', 'aksai chin', '拉达克', '阿克赛钦', 'लद्दाख'], parties: ['IND', 'CHN'], lat: 34.2, lon: 77.6, domain: 'Military' },
  { id: 'arunachal', name: 'Arunachal Pradesh', aliases: ['arunachal', 'tawang', '藏南', '达旺', 'अरुणाचल'], parties: ['IND', 'CHN'], lat: 28.2, lon: 94.7, domain: 'Military' },
  { id: 'doklam', name: 'Doklam Plateau', aliases: ['doklam', 'dolam', '洞朗', 'डोकलाम'], parties: ['IND', 'CHN', 'BTN'], lat: 27.3, lon: 88.9, domain: 'Military' },
  { id: 'loc', name: 'Line of Control (Kashmir)', aliases: ['line of control', 'loc ', 'kashmir', 'pok', 'jammu', 'pahalgam', '克什米尔', 'कश्मीर', 'كشمير'], parties: ['IND', 'PAK'], lat: 34.1, lon: 74.8, domain: 'Military' },
  { id: 'taiwan-strait', name: 'Taiwan Strait', aliases: ['taiwan strait', 'median line', 'adiz', '台海', '台湾海峡', '海峡中线'], parties: ['CHN', 'TWN', 'USA'], lat: 24.5, lon: 119.5, domain: 'Military' },
  { id: 'scs', name: 'South China Sea', aliases: ['south china sea', 'spratly', 'paracel', 'nine-dash', 'second thomas', 'scarborough', '南海', '南沙', '西沙', '仁爱礁'], parties: ['CHN', 'PHL', 'VNM', 'MYS', 'USA'], lat: 13.0, lon: 114.0, domain: 'Maritime' },
  { id: 'ecs', name: 'East China Sea', aliases: ['east china sea', 'senkaku', 'diaoyu', '东海', '钓鱼岛', '尖閣'], parties: ['CHN', 'JPN'], lat: 28.5, lon: 125.0, domain: 'Maritime' },
  { id: 'ior', name: 'Indian Ocean Region', aliases: ['indian ocean', 'ior ', 'string of pearls', 'malacca', 'gwadar', 'hambantota', 'djibouti base', '印度洋', '马六甲', '瓜达尔', 'हिंद महासागर'], parties: ['IND', 'CHN', 'PAK', 'LKA'], lat: -5.0, lon: 75.0, domain: 'Maritime' },
  { id: 'red-sea', name: 'Red Sea / Bab el-Mandeb', aliases: ['red sea', 'bab el-mandeb', 'gulf of aden', '红海', '曼德海峡'], parties: ['YEM', 'EGY', 'USA'], lat: 13.5, lon: 43.3, domain: 'Maritime' },
  { id: 'hormuz', name: 'Strait of Hormuz', aliases: ['strait of hormuz', 'hormuz', '霍尔木兹'], parties: ['IRN', 'ARE', 'USA'], lat: 26.6, lon: 56.3, domain: 'Energy' },
  { id: 'korea-dmz', name: 'Korean Peninsula', aliases: ['dmz', 'demilitarized zone', '38th parallel', '朝鲜半岛', '三八线'], parties: ['PRK', 'KOR', 'USA'], lat: 38.3, lon: 127.0, domain: 'Nuclear' },
  { id: 'donbas', name: 'Ukraine Front', aliases: ['donbas', 'donetsk', 'zaporizhzhia', 'kherson', 'crimea', '顿巴斯', '克里米亚'], parties: ['UKR', 'RUS'], lat: 47.9, lon: 37.8, domain: 'Military' },
  { id: 'gaza', name: 'Gaza / Levant', aliases: ['gaza', 'west bank', 'rafah', 'hamas', '加沙', 'غزة'], parties: ['ISR', 'LBN', 'EGY'], lat: 31.5, lon: 34.5, domain: 'Military' },
  { id: 'cpec', name: 'CPEC Corridor', aliases: ['cpec', 'china-pakistan economic corridor', 'gwadar port', '中巴经济走廊'], parties: ['CHN', 'PAK', 'IND'], lat: 29.0, lon: 67.0, domain: 'Economic' },
  { id: 'bri', name: 'Belt and Road', aliases: ['belt and road', 'bri ', 'one belt one road', '一带一路'], parties: ['CHN'], lat: 40.0, lon: 75.0, domain: 'Economic' },
  { id: 'semis', name: 'Semiconductor Controls', aliases: ['export controls', 'chip ban', 'entity list', 'euv', 'asml', 'tsmc', '芯片', '出口管制', '实体清单'], parties: ['USA', 'CHN', 'TWN', 'NLD'], lat: 24.0, lon: 121.0, domain: 'Technology' },
];

/**
 * Chinese contracts country pairs into two-character compounds — 中印 is
 * "China-India", not a word containing either country's name. Alias matching alone
 * therefore misses the single most common way Chinese headlines name a relationship.
 */
export const CN_COMPOUNDS: Record<string, string[]> = {
  '中印': ['CHN', 'IND'], '印中': ['IND', 'CHN'],
  '中美': ['CHN', 'USA'], '美中': ['USA', 'CHN'],
  '中日': ['CHN', 'JPN'], '日中': ['JPN', 'CHN'],
  '中俄': ['CHN', 'RUS'], '中巴': ['CHN', 'PAK'],
  '中韩': ['CHN', 'KOR'], '中越': ['CHN', 'VNM'],
  '中菲': ['CHN', 'PHL'], '中澳': ['CHN', 'AUS'],
  '中英': ['CHN', 'GBR'], '中法': ['CHN', 'FRA'], '中德': ['CHN', 'DEU'],
  '印巴': ['IND', 'PAK'], '印美': ['IND', 'USA'], '美印': ['USA', 'IND'],
  '印俄': ['IND', 'RUS'], '日韩': ['JPN', 'KOR'],
  '朝美': ['PRK', 'USA'], '美朝': ['USA', 'PRK'], '朝韩': ['PRK', 'KOR'],
  '俄乌': ['RUS', 'UKR'], '以伊': ['ISR', 'IRN'],
  '台美': ['TWN', 'USA'], '美台': ['USA', 'TWN'], '两岸': ['CHN', 'TWN'],
};
