/**
 * The two markers the roster audit can detect, kept in their own module.
 *
 * Separated from scripts/roster-audit.ts on 2026-09-09 because that script runs its whole
 * report at import time — it opens the database and prints. A test importing the regexes
 * from it therefore executed the entire audit, and would have failed in CI, where no
 * kautilya.db exists. Regexes are data; this file must stay free of side effects so both
 * the script and tests/people.test.ts can import them.
 */

/**
 * Words that say a person no longer holds the office beside their name.
 *
 * This is the one part of the review a machine CAN do. An outlet that keeps quoting a
 * departed official marks the fact in the headline — "Ex-CDS", "पूर्व CDS", "前防长" — so the
 * contradiction is sitting in the corpus in plain text, and only ever found by someone
 * reading all 60-odd entries by eye. It found Anil Chauhan, who was listed as the serving
 * Chief of Defence Staff while four headlines across two languages called him the former one.
 *
 * Precision over recall, deliberately: a flag that cries wolf gets ignored, and this one is
 * read once a month at most. Chinese bare 前 is excluded because it is a preposition in
 * 目前 and 之前 and would fire on nearly everything; only 前 bound to an office is matched.
 *
 * It CANNOT bind the word to the name, so it flags a headline where someone else is the
 * former one — Lula, beside "former Brazil military chief". That is why the count is printed
 * as a ratio and the headline is printed with it: 5 of 7 is a finding, 1 of 1 is a sentence
 * to read. Judging that is the reviewer's job, and this tool never edits the roster.
 */
export const FORMER = /\b(former|ex|outgoing|erstwhile)\b|\bex-|पूर्व|前(总统|首相|总理|部长|防长|外长|主席)|卸任/i;

/**
 * Words that say a person was REMOVED from the office, rather than merely labelled ex-.
 *
 * Added 2026-09-09, after Zhang Youxia sat mislabelled through a full review pass. FORMER
 * above looks for a retitling — "Ex-CDS", "पूर्व CDS" — which is what an outlet does when a
 * figure leaves office and keeps being quoted. It has no word for a DISMISSAL, and a Chinese
 * official is not retitled, he is removed: 免职 (relieved of office), 落马 (taken down),
 * 解职, 被查 (placed under investigation). VOA wrote 张又侠被正式免职 twice and FORMER matched
 * neither, because "formally dismissed from office" contains no former-shaped word at all.
 *
 * Kept separate from FORMER rather than merged into it, because the two mean different
 * things to a reviewer: FORMER says the corpus disagrees with the label, DISMISSED says the
 * person may no longer hold any office. 被查 is the weakest of these — an investigation is
 * not a removal — so it is reported for reading, never treated as settled.
 */
export const DISMISSED = /免职|落马|解职|被查|双开|\b(ousted|sacked|purged|relieved of (his |her |their )?(post|command)|removed from (his |her |their )?(post|office))\b/i;

/**
 * Whether a marker actually refers to THIS person, approximated by distance.
 *
 * The old detector read titles only, where a headline is one clause and proximity is
 * implicit. Reading snippets broke that assumption badly: a snippet is a paragraph naming
 * several people, so a single 免职 about one general flagged every figure in the roundup —
 * Xi, Trump and the US Treasury Secretary all came back marked off one VOA digest.
 *
 * So the marker must fall near one of the person's own aliases. This is still an
 * approximation and cannot parse the sentence — "Zelensky warns airlines" pairs names that
 * never interacted, the same limit the graph's co-mention edges carry — but it is the
 * difference between eight false positives and none on the corpus it was tuned against.
 *
 * WINDOW is generous for Chinese (dense: 张又侠、刘振立被正式免职 fits in 12 characters) and
 * still tight enough in English that a name in one sentence and "former" in the next do not
 * bind. Widen it and Lula re-collides with "former Brazil military chief"; narrow it and a
 * Chinese title separated by a clause is missed.
 */
export const WINDOW = 32;

export function marksPerson(text: string, marker: RegExp, aliases: string[]): boolean {
  const hay = text.toLowerCase();
  const re = new RegExp(marker.source, marker.flags.includes('g') ? marker.flags : marker.flags + 'g');
  for (let m = re.exec(hay); m; m = re.exec(hay)) {
    for (const alias of aliases) {
      const a = alias.toLowerCase();
      let from = 0;
      for (let i = hay.indexOf(a, from); i !== -1; i = hay.indexOf(a, from)) {
        const gap = i > m.index ? i - (m.index + m[0].length) : m.index - (i + a.length);
        if (gap <= WINDOW) return true;
        from = i + 1;
      }
    }
  }
  return false;
}
