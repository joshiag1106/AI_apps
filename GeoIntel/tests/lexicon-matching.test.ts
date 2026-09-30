import { describe, it, expect } from 'vitest';
import { scoreText } from '@/lib/analyze/score';

/**
 * The escalation lexicon matched English terms as raw substrings, so "coup" fired in "couple",
 * "coupon", "decouple" and "recoup" — 24 local articles against 5 real coups — and a lexicon
 * hit also admits a report through the relevance gate. It also counted a term inside a longer
 * one it had already counted: "ceasefire violation" scored +8 and then -7 for "ceasefire"
 * (risk R11). The lexicon now reads text under the same rules as the concept list.
 */
describe('lexicon terms match whole words', () => {
  it.each([
    'Couple celebrates anniversary with a coupon deal',
    'Investors decouple from the market as firms recoup losses',
    'Protestant church marks its anniversary',
    'Unrestricted access granted to the archives',
  ])('finds no term inside a longer word: %s', (headline) => {
    expect(scoreText(headline).matchedTerms).toEqual([]);
  });

  it('still finds a term with one inflection', () => {
    const s = scoreText('Tariffs rise as border clashes follow airstrikes and two coups');
    expect(s.matchedTerms).toEqual(expect.arrayContaining(['tariff', 'clash', 'airstrike', 'coup']));
  });

  it.each([
    ['Anti-graft protesters clash with police in Indonesia', 'protester'],
    ['Rubio in Peru: Protestors take the streets against the visit', 'protestor'],
  ])('keeps the people who protest, which substring matching used to find inside "protest": %s', (headline, term) => {
    // Whole-word matching allows s, es, d, ed and ing, not -ers; measured on the local corpus,
    // these were the only real reports the change would otherwise have stopped reading.
    expect(scoreText(headline).matchedTerms).toContain(term);
  });

  it('matches a capitalised Russian term', () => {
    // Non-Latin terms were compared against the raw text, so a headline-initial capital hid them.
    expect(scoreText('Санкции против Ирана расширены').matchedTerms).toEqual(['санкции']);
  });
});

describe('a term inside a longer matched term is not counted again', () => {
  it('scores a ceasefire violation as escalation, not as a ceasefire', () => {
    const s = scoreText('Ceasefire violation reported along the border');
    expect(s.matchedTerms).toEqual(['ceasefire violation']);
    expect(s.escalation).toBe(13); // +8, scaled by 1.6
  });

  it('scores lifted sanctions as de-escalation, not as sanctions', () => {
    const s = scoreText('Sanctions lifted on shipping firms');
    expect(s.matchedTerms).toEqual(['sanctions lifted']);
    expect(s.escalation).toBe(-10); // -6, scaled by 1.6
  });
});
