/**
 * Headlines that carry a ladder formula, labelled by a human reading them: whose formula is it?
 *
 *   prc      Beijing is the one speaking
 *   other    another government, party or person is
 *   unclear  the headline does not settle it
 *
 * LADDER_FIXTURE is every rung-bearing article in the 90-day corpus of 2026-09-19 — the whole hit
 * set, so it is also what the rules were written against, and a passing score on it proves less
 * than it seems. LIVE_FIXTURE is headlines from the live server that were not in that set; it is
 * the only sample the rules have not seen. Add to it whenever the audit turns up a new case.
 */
export interface Fixture { title: string; snippet: string; formula: string; expected: 'prc' | 'other' | 'unclear' }

export const LADDER_FIXTURE: Fixture[] = [
  {
    "title": "中国驻日本大使馆就日方涉“南海仲裁案裁决”恶劣言行提出严正交涉",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "prc"
  },
  {
    "title": "中国驻日使馆就日本涉南海仲裁案裁决恶劣言行 提出严正交涉",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "prc"
  },
  {
    "title": "驻伊使馆人员遭拘押，法国向伊朗提出严正交涉",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "other"
  },
  {
    "title": "南海仁爱礁冲突︱中方因人道主义准菲方转运伤员 另提严正交涉：停止挑衅炒作",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "prc"
  },
  {
    "title": "菲律宾坐滩舰橡皮艇冲撞中方巡逻艇 外交部召菲驻华大使严正交涉",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "prc"
  },
  {
    "title": "针尖对麦芒 中国菲律宾互相传召对方大使“严正交涉”",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "prc"
  },
  {
    "title": "高市早苗供奉靖国神社，自民党高层首次集体 \"拜鬼\"；中方：严正交涉、强烈抗议！",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "prc"
  },
  {
    "title": "外交部：严正交涉、强烈抗议日方消极动向",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "prc"
  },
  {
    "title": "日防衞大臣参拜靖国神社 中国提严正交涉强烈抗议 - 国际 - 国际头条",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "prc"
  },
  {
    "title": "外交部：强烈谴责日方涉靖国神社消极动向 已提出严正交涉",
    "snippet": "",
    "formula": "强烈谴责",
    "expected": "prc"
  },
  {
    "title": "严正交涉、强烈抗议！外交部回应日本政要参拜供奉靖国神社",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "prc"
  },
  {
    "title": "我使馆发言人：中方已向日方提出严正交涉、强烈抗议",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "prc"
  },
  {
    "title": "中国驻日大使馆提出严正交涉，今再有日自民党高层参拜",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "prc"
  },
  {
    "title": "我使馆发言人：中方已向日方提出严正交涉、强烈抗议",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "prc"
  },
  {
    "title": "巴基斯坦向美方提出严正交涉 抗议美国大使言论",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "other"
  },
  {
    "title": "美国财政部长贝森特称对不参与制裁伊朗的国家可能采取反制措施，外交部：中方将采取一切必要措施，坚定维护自身权益",
    "snippet": "",
    "formula": "一切必要措施",
    "expected": "prc"
  },
  {
    "title": "美声称司法部、美联储等机构遭“中国黑客”攻击，中方严词驳斥：坚决反对并依法打击一切形式的网络攻击",
    "snippet": "",
    "formula": "坚决反对",
    "expected": "prc"
  },
  {
    "title": "美方声称司法部、NASA、美联储等机构遭“中国黑客”攻击，中方驳斥：坚决反对并依法打击一切形式的网络攻击",
    "snippet": "",
    "formula": "坚决反对",
    "expected": "prc"
  },
  {
    "title": "美方声称司法部、NASA、美联储等机构遭“中国黑客”攻击，中方驳斥：坚决反对并依法打击一切形式的网络攻击",
    "snippet": "",
    "formula": "坚决反对",
    "expected": "prc"
  },
  {
    "title": "外交部：中方坚决反对并依法打击黑客活动，美方所谓“声明”缺乏实证",
    "snippet": "",
    "formula": "坚决反对",
    "expected": "prc"
  },
  {
    "title": "印商务签获批率仅20%-40%！印方交涉中方，对等才是解决前提",
    "snippet": "",
    "formula": "交涉",
    "expected": "other"
  },
  {
    "title": "美国要对华加7.5%关税？商务部回应坚决反对，中方反制工具早已备好",
    "snippet": "",
    "formula": "坚决反对",
    "expected": "prc"
  },
  {
    "title": "越南坚决反对在黄沙群岛开展非法填海造陆和建设活动并严正交涉",
    "snippet": "",
    "formula": "坚决反对",
    "expected": "other"
  },
  {
    "title": "据报中国在西沙群岛修建新设施 越南要求立即停止",
    "snippet": "越南周五（8月28日）表示，坚决反对任何国家未经越方许可在西沙群岛开展活动。此前有报道称，中国正在西沙群岛一座岛礁上修建新设施。",
    "formula": "坚决反对",
    "expected": "other"
  },
  {
    "title": "美日澳军演在即，俄方就“堤丰”中导系统部署问题向日方提出交涉：绝对不可接受",
    "snippet": "",
    "formula": "交涉",
    "expected": "other"
  },
  {
    "title": "美日澳军演在即，俄方就“堤丰”中导系统部署问题向日方提出交涉：绝对不可接受",
    "snippet": "",
    "formula": "交涉",
    "expected": "other"
  },
  {
    "title": "美国邀请俄罗斯出席G20财长会议，欧洲强烈不满",
    "snippet": "",
    "formula": "强烈不满",
    "expected": "other"
  },
  {
    "title": "中国只是小试身手，越南却严正交涉，要求中方“下不为例”",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "other"
  },
  {
    "title": "永不拖船？菲律宾军方直接摊牌！国防部警告：不拖走，后果自负-yeeyi",
    "snippet": "",
    "formula": "后果自负",
    "expected": "other"
  },
  {
    "title": "中国严正交涉！菲律宾公然耍无赖，海警一招出手直接击碎菲方妄想",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "prc"
  },
  {
    "title": "黄之锋对“串谋勾结外国势力危害国家安全”指控当庭认罪；美国议员和人权组织强烈谴责政治迫害",
    "snippet": "",
    "formula": "强烈谴责",
    "expected": "other"
  },
  {
    "title": "中方策展团队因韩国光州双年展涉台错误做法宣布撤展表达强烈抗议，外交部：中方已提出严正交涉，希望韩国政府践行一个中国原则",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "prc"
  },
  {
    "title": "中方策展团队因韩国光州双年展涉台错误做法宣布撤展，表达强烈抗议，外交部：已向韩方提出严正交涉，希望韩国以实际行动践行一个中国原则",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "prc"
  },
  {
    "title": "中方新闻稿指王毅称“韩朝两国” 韩国家安保室长魏圣洛：他没有这样说",
    "snippet": "自首尔方面消息，针对中国外交部的一份新闻稿指，中共中央外办主任、外交部长王毅上月在与韩方官员会面时称“韩朝两国”一事，韩国政府已向中方提出交涉。",
    "formula": "交涉",
    "expected": "unclear"
  },
  {
    "title": "中方策展团队因韩国光州双年展涉台错误做法宣布撤展表达强烈抗议，外交部：中方已提出严正交涉，希望韩国政府践行一个中国原则|川观新闻",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "prc"
  },
  {
    "title": "韩国光州双年展批准台湾地区以“台湾馆”的名称参展 中国大陆强烈抗议并撤展",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "prc"
  },
  {
    "title": "韩国光州双年展出现严重涉台错误，多次沟通无果后中方集体撤展以示强烈抗议！外交部表示，已向韩方提出严正交涉……",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "prc"
  },
  {
    "title": "伊朗警告递到青瓦台，给李在明提前打预防针，胆敢出兵中东后果自负，美方施压架在火上烤他根本进退两难！",
    "snippet": "",
    "formula": "后果自负",
    "expected": "other"
  },
  {
    "title": "三国军演还没开始，中美两军先开了个会，俄罗斯已对日本提出交涉",
    "snippet": "",
    "formula": "交涉",
    "expected": "other"
  },
  {
    "title": "中方强烈谴责日方涉靖国神社消极动向，已向日方提出严正交涉、强烈抗议",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "prc"
  },
  {
    "title": "Anthropic发布154页人工智能滥用报告含多领域涉华案例 北京：坚决反对攻击抹黑",
    "snippet": "",
    "formula": "坚决反对",
    "expected": "prc"
  },
  {
    "title": "萧美琴闪电访意欧盟退出论坛 中方严正交涉",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "prc"
  },
  {
    "title": "台湾副总统萧美琴：“即使处境再困难，台湾都将继续勇敢走出与世界同行的路”",
    "snippet": "台湾副总统萧美琴星期一(9月14日)强调，“即使处境再困难，台湾都将继续勇敢走出与世界通行的路。”萧美琴上星期闪电出访意大利参加在南部一个小岛上举行的民主论坛，遭到中国的坚决反对，并向欧盟及意大利主办方提出严正交涉。欧盟委员会(European Commission)也在得知萧美琴将出席论坛后退出该活动。",
    "formula": "坚决反对",
    "expected": "prc"
  },
  {
    "title": "印巴军舰碰撞，印度：强烈抗议！",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "other"
  },
  {
    "title": "印巴军舰相撞，印方强烈不满，24小时内紧急召见巴方外交人官，搬出91年双边协议造势",
    "snippet": "",
    "formula": "强烈不满",
    "expected": "other"
  },
  {
    "title": "印巴军舰相撞互招外交官强烈抗议 海上紧张局势升级",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "other"
  },
  {
    "title": "印巴军舰相撞，印方强烈不满，24小时内，紧急召见巴方外交人员！",
    "snippet": "",
    "formula": "强烈不满",
    "expected": "other"
  }
];

export const LIVE_FIXTURE: Fixture[] = [
  {
    "title": "从领土争议、二战历史到远东军演，日俄关系如何搅动东北亚局势",
    "snippet": "8月到9月期间，日本与俄罗斯之间围绕二战历史、军事活动和领土问题等的矛盾不断升级。从日本、澳大利亚和美国的联合军事演习，到俄罗斯远东城市哈巴洛夫斯克设立引发日本强烈抗议的二战纪念碑，再到俄罗斯机构在台北组织放映日本军国主义的苏联纪录片…一系列事件密集出现，将这两个国家的“新仇旧恨”推到了前台，桩桩件件不离同一段历史，以及二战后的现存区域秩序。又因为两国之间的诸多争议，往往夹杂着美国、中国、朝鲜半岛等区域重要角色各自的利益，同时远涉乌克兰战争，日俄关系愈发成为印太区域的一个重要变量。值得一提的是，中国和俄罗斯在今年8月发表了联合声明，对亚太地区重新军事化示警。",
    "formula": "强烈抗议",
    "expected": "other"
  },
  {
    "title": "印度一军舰与巴基斯坦军舰相撞，巴基斯坦向印度提出强烈抗议 双方各执一词",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "other"
  },
  {
    "title": "美议员提法案 吁制裁致黎智英和政治犯死亡的中港人员 港府谴责称是恫吓",
    "snippet": "在中美元首会晤前，美国跨党派议员因应香港传媒大亨黎智英在狱中的健康情况，向国会提交法案，一旦通过，若出现黎智英或其他政治犯在狱中因医疗疏忽等原因而致死的个案，国务院应向相关中港官员实施制裁，并推动联合国调查死因。香港政府对此发出强烈谴责，认为这是恫吓维护国家安全的特区人员。",
    "formula": "强烈谴责",
    "expected": "other"
  },
  {
    "title": "众赢国际手机版_体育_8·15日本政要又“拜鬼”，中方严正交涉强烈抗议",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "prc"
  }
];
