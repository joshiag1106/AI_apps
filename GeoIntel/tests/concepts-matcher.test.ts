import { describe, it, expect } from 'vitest';
import { compileMatcher, topDomain } from '@/lib/analyze/concepts';
import type { Concept } from '@/data/concepts';

const c = (id: string, domain: Concept['domain'], en: string[], zh: string[] = []): Concept =>
  ({ id, domain, terms: { en, zh } });
const WAR = c('war', 'Military', ['war', 'clash'], ['战争']);
const TRADE_WAR = c('trade-war', 'Economic', ['trade war']);
const ATTACK = c('attack', 'Military', ['attack', 'strike']);
const CYBER = c('cyber-attack', 'Cyber', ['cyber attack'], ['网络攻击']);
const HIT = c('hit', 'Military', [], ['攻击']);
const TALKS = c('talks', 'Diplomatic', ['talks']);
const m = compileMatcher([WAR, TRADE_WAR, ATTACK, CYBER, HIT, TALKS], ['heart attack']);
const ids = (t: string) => m.match(t).map((x) => x.id).sort();

describe('the concept matcher', () => {
  it('matches Latin terms as whole words, with an inflection', () => {
    expect(ids('Wars and clashes')).toEqual(['war']);
    expect(ids('An award for software')).toEqual([]);
    expect(ids('Officials warn of risks')).toEqual([]);
    expect(ids('Troops attacked; strikes continue')).toEqual(['attack']);
  });

  it('matches non-Latin terms as substrings', () => {
    expect(ids('两国爆发战争')).toEqual(['war']);
  });

  it('lets the longest match win, so a phrase does not also count its words', () => {
    expect(ids('A trade war looms')).toEqual(['trade-war']);
    expect(ids('A cyber attack hit the grid')).toEqual(['cyber-attack']);
    expect(ids('遭到网络攻击')).toEqual(['cyber-attack']);
  });

  it('counts a concept once however many of its words appear', () => {
    expect(m.match('war, war and more clashes')).toHaveLength(1);
  });

  it('masks a neutral phrase without counting it', () => {
    expect(ids('He died of a heart attack')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(ids('TALKS RESUME')).toEqual(['talks']);
  });
});

describe('topDomain', () => {
  it('picks the domain with the most distinct concepts', () => {
    expect(topDomain([TALKS, WAR, ATTACK])).toBe('Military');
  });

  it('breaks a tie by the domain order, and is null with no evidence', () => {
    expect(topDomain([TALKS, WAR])).toBe('Military');
    expect(topDomain([TALKS, TRADE_WAR])).toBe('Economic');
    expect(topDomain([])).toBeNull();
  });
});
