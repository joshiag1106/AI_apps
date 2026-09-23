import type { Article } from '@/lib/types';

/**
 * Headlines that are SEO wrapping rather than reporting.
 *
 * Found 2026-09-20: a Google News item from an outlet labelled 体坛, dated 17 Sep, whose headline
 * read `众赢国际手机版_体育_8·15日本政要又“拜鬼”…` — a casino-style page republishing the 15 August
 * Yasukuni story under a September date. The formula in it is genuinely Beijing's; the DATE is not
 * evidence of anything that day. The tour refuses to use such a headline as an example, independently
 * of whatever is later decided about denying such outlets at ingest.
 *
 * A pattern on the headline rather than a list of outlets, because the outlet label ("体坛") is what
 * Google News called a page that could as easily be called something else tomorrow.
 */
const JUNK = /手机版|_体育_|官方网站|娱乐城|投注|彩票|博彩/;

export function isJunkHeadline(title: string): boolean {
  return JUNK.test(title);
}

/**
 * Articles fit to be shown as an example, best first: an official statement, then the better
 * outlet tier (a LOWER number is better — see reprintFamilies' `beats`), then the newest.
 */
export function rankedForExample(articles: readonly Article[]): Article[] {
  return articles
    .filter((a) => !isJunkHeadline(a.title))
    .sort((a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary)
      || a.tier - b.tier
      || (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)
      || (a.id < b.id ? -1 : 1));
}
