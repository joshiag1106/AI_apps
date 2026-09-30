/**
 * Casino-style SEO pages that republish old stories under new dates — not reporting, never stored.
 *
 * Found 2026-09-20 (`众赢国际手机版_体育_8·15日本政要又“拜鬼”…`, the 15 August Yasukuni story dated 17 Sep) and
 * again 2026-09-30 (`火狐体育官方登录_体育_…`); both from a Google News source labelled 体坛. The formula inside
 * may be genuinely Beijing's, but the date is evidence of nothing, and one such page was the only basis of the
 * evidence trail's Japan row. A pattern on the headline, not an outlet list, because the outlet label is
 * whatever Google News calls the page today.
 *
 * Deliberately narrower than the tour's example rule (lib/demo/junk), which also refuses 官方网站: a real
 * report can cite an official website, and storage must not lose it.
 */
const SEO_WRAPPER = /手机版|_体育_|娱乐城|投注|彩票|博彩/;

export function isSeoWrapper(title: string): boolean {
  return SEO_WRAPPER.test(title);
}
