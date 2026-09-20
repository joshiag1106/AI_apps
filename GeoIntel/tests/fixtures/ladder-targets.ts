/**
 * Beijing-attributed ladder formulae, labelled by a human reading them: which state is the formula
 * about? `null` means the headline does not settle it.
 *
 * This is every Beijing-attributed rung article in the 90-day corpus of 2026-09-20 — the whole hit
 * set, so it is also what the rule was written against, and a passing score on it proves less than
 * it seems. The held-out sample is the live corpus as it fills: see the risks in
 * docs/specs/2026-09-20-ladder-trail-design.md. Add to this whenever the audit turns up a new case.
 */
export interface TargetFixture { title: string; snippet: string; formula: string; expected: string | null }

export const TARGET_FIXTURE: TargetFixture[] = [
  {
    "title": "中国驻日本大使馆就日方涉“南海仲裁案裁决”恶劣言行提出严正交涉",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "JPN"
  },
  {
    "title": "中国驻日使馆就日本涉南海仲裁案裁决恶劣言行 提出严正交涉",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "JPN"
  },
  {
    "title": "菲律宾坐滩舰橡皮艇冲撞中方巡逻艇 外交部召菲驻华大使严正交涉",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "PHL"
  },
  {
    "title": "南海仁爱礁冲突︱中方因人道主义准菲方转运伤员 另提严正交涉：停止挑衅炒作",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "PHL"
  },
  {
    "title": "针尖对麦芒 中国菲律宾互相传召对方大使“严正交涉”",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "PHL"
  },
  {
    "title": "高市早苗供奉靖国神社，自民党高层首次集体 \"拜鬼\"；中方：严正交涉、强烈抗议！",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "JPN"
  },
  {
    "title": "外交部：严正交涉、强烈抗议日方消极动向",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "JPN"
  },
  {
    "title": "日防衞大臣参拜靖国神社 中国提严正交涉强烈抗议 - 国际 - 国际头条",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "JPN"
  },
  {
    "title": "外交部：强烈谴责日方涉靖国神社消极动向 已提出严正交涉",
    "snippet": "",
    "formula": "强烈谴责",
    "expected": "JPN"
  },
  {
    "title": "我使馆发言人：中方已向日方提出严正交涉、强烈抗议",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "JPN"
  },
  {
    "title": "我使馆发言人：中方已向日方提出严正交涉、强烈抗议",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "JPN"
  },
  {
    "title": "中国驻日大使馆提出严正交涉，今再有日自民党高层参拜",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "JPN"
  },
  {
    "title": "美国财政部长贝森特称对不参与制裁伊朗的国家可能采取反制措施，外交部：中方将采取一切必要措施，坚定维护自身权益",
    "snippet": "",
    "formula": "一切必要措施",
    "expected": null
  },
  {
    "title": "美声称司法部、美联储等机构遭“中国黑客”攻击，中方严词驳斥：坚决反对并依法打击一切形式的网络攻击",
    "snippet": "",
    "formula": "坚决反对",
    "expected": "USA"
  },
  {
    "title": "美方声称司法部、NASA、美联储等机构遭“中国黑客”攻击，中方驳斥：坚决反对并依法打击一切形式的网络攻击",
    "snippet": "",
    "formula": "坚决反对",
    "expected": "USA"
  },
  {
    "title": "美方声称司法部、NASA、美联储等机构遭“中国黑客”攻击，中方驳斥：坚决反对并依法打击一切形式的网络攻击",
    "snippet": "",
    "formula": "坚决反对",
    "expected": "USA"
  },
  {
    "title": "外交部：中方坚决反对并依法打击黑客活动，美方所谓“声明”缺乏实证",
    "snippet": "",
    "formula": "坚决反对",
    "expected": "USA"
  },
  {
    "title": "中国严正交涉！菲律宾公然耍无赖，海警一招出手直接击碎菲方妄想",
    "snippet": "",
    "formula": "严正交涉",
    "expected": "PHL"
  },
  {
    "title": "中方策展团队因韩国光州双年展涉台错误做法宣布撤展表达强烈抗议，外交部：中方已提出严正交涉，希望韩国政府践行一个中国原则",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "KOR"
  },
  {
    "title": "中方策展团队因韩国光州双年展涉台错误做法宣布撤展，表达强烈抗议，外交部：已向韩方提出严正交涉，希望韩国以实际行动践行一个中国原则",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "KOR"
  },
  {
    "title": "中方策展团队因韩国光州双年展涉台错误做法宣布撤展表达强烈抗议，外交部：中方已提出严正交涉，希望韩国政府践行一个中国原则|川观新闻",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "KOR"
  },
  {
    "title": "韩国光州双年展批准台湾地区以“台湾馆”的名称参展 中国大陆强烈抗议并撤展",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": null
  },
  {
    "title": "韩国光州双年展出现严重涉台错误，多次沟通无果后中方集体撤展以示强烈抗议！外交部表示，已向韩方提出严正交涉……",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "KOR"
  },
  {
    "title": "中方强烈谴责日方涉靖国神社消极动向，已向日方提出严正交涉、强烈抗议",
    "snippet": "",
    "formula": "强烈抗议",
    "expected": "JPN"
  },
  {
    "title": "Anthropic发布154页人工智能滥用报告含多领域涉华案例 北京：坚决反对攻击抹黑",
    "snippet": "",
    "formula": "坚决反对",
    "expected": null
  },
  {
    "title": "萧美琴闪电访意欧盟退出论坛 中方严正交涉",
    "snippet": "",
    "formula": "严正交涉",
    "expected": null
  },
  {
    "title": "台湾副总统萧美琴：“即使处境再困难，台湾都将继续勇敢走出与世界同行的路”",
    "snippet": "台湾副总统萧美琴星期一(9月14日)强调，“即使处境再困难，台湾都将继续勇敢走出与世界通行的路。”萧美琴上星期闪电出访意大利参加在南部一个小岛上举行的民主论坛，遭到中国的坚决反对，并向欧盟及意大利主办方提出严正交涉。欧盟委员会(European Commission)也在得知萧美琴将出席论坛后退出该活动。",
    "formula": "坚决反对",
    "expected": null
  }
];
