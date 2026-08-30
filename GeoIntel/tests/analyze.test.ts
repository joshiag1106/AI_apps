import { describe, it, expect } from 'vitest';
import { extractActors, extractHotspots, resolveActors, dyadsFrom, dyadKey } from '@/lib/analyze/entities';
import { scoreText } from '@/lib/analyze/score';
import { isRelevant } from '@/lib/ingest/pipeline';

describe('actor extraction', () => {
  it('resolves the same actor across scripts', () => {
    expect(extractActors('India and China hold border talks')).toEqual(expect.arrayContaining(['IND', 'CHN']));
    expect(extractActors('中印边境局势')).toEqual(expect.arrayContaining(['IND', 'CHN']));
    expect(extractActors('भारत चीन सीमा')).toEqual(expect.arrayContaining(['IND', 'CHN']));
  });

  it('does not fire on substrings of longer words', () => {
    expect(extractActors('Indiana passed a state budget')).not.toContain('IND');
    expect(extractActors('He wore a china-blue shirt')).toContain('CHN'); // hyphen is a boundary
  });

  it('requires a separator for short ambiguous aliases', () => {
    expect(extractActors('the bus schedule')).not.toContain('USA');
  });

  it('infers parties from a hotspot even when unnamed', () => {
    const r = resolveActors('Fresh patrol face-off reported in the Galwan Valley');
    expect(r.hotspots).toContain('lac');
    expect(r.actors).toEqual(expect.arrayContaining(['IND', 'CHN']));
  });

  it('recognises Chinese hotspot names', () => {
    expect(extractHotspots('解放军在加勒万地区')).toContain('lac');
    expect(extractHotspots('南海 仁爱礁 对峙')).toContain('scs');
  });
});

describe('dyads', () => {
  it('is order-independent', () => {
    expect(dyadKey('IND', 'CHN')).toBe(dyadKey('CHN', 'IND'));
  });
  it('enumerates every pair once', () => {
    expect(dyadsFrom(['IND', 'CHN', 'PAK'])).toHaveLength(3);
    expect(dyadsFrom(['IND', 'IND'])).toHaveLength(0);
  });
});

describe('escalation scoring', () => {
  it('scores conflict language above routine diplomacy', () => {
    const hot = scoreText('Troops killed in border clash as both sides mobilise');
    const cool = scoreText('Foreign ministers hold bilateral talks on trade');
    expect(hot.escalation).toBeGreaterThan(cool.escalation);
  });

  it('goes negative on genuine de-escalation', () => {
    expect(scoreText('Ceasefire agreed; troop withdrawal begins').escalation).toBeLessThan(0);
  });

  it('lets a formal PRC rung outweigh mere adjectives', () => {
    const rhetoric = scoreText('Fierce, angry, dramatic reaction to provocation');
    const formal = scoreText('中方已提出严正交涉');
    expect(formal.escalation).toBeGreaterThan(rhetoric.escalation);
    expect(formal.ladderRung).toBe(4);
  });

  it('classifies domain from the text', () => {
    expect(scoreText('Navy warship shadowed near the shoal').domain).toBe('Maritime');
    expect(scoreText('State-sponsored cyberattack hit critical infrastructure').domain).toBe('Cyber');
    expect(scoreText('New tariffs imposed on imports amid trade war').domain).toBe('Economic');
  });

  it('stays inside bounds on extreme input', () => {
    const s = scoreText('invasion airstrike nuclear test blockade coup 勿谓言之不预也 '.repeat(20));
    expect(s.escalation).toBeLessThanOrEqual(100);
    expect(s.escalation).toBeGreaterThanOrEqual(-100);
  });
});

describe('relevance gate', () => {
  it('keeps items with a security signal and drops bare country mentions', () => {
    const keep = [
      { actors: ['IND', 'CHN'], hotspots: [], s: { matchedTerms: [], glossed: [], ladderRung: null } },
      { actors: ['ISR'], hotspots: ['gaza'], s: { matchedTerms: [], glossed: [], ladderRung: null } },
      { actors: ['JPN'], hotspots: [], s: { matchedTerms: ['cyberattack'], glossed: [], ladderRung: null } },
      { actors: ['CHN'], hotspots: [], s: { matchedTerms: [], glossed: ['core interest'], ladderRung: null } },
    ];
    for (const k of keep) expect(isRelevant(k.actors, k.hotspots, k.s)).toBe(true);

    // "Japan probes 39kg of bread dumped in national park" — one actor, no security signal.
    expect(isRelevant(['JPN'], [], { matchedTerms: [], glossed: [], ladderRung: null })).toBe(false);
    expect(isRelevant([], [], { matchedTerms: [], glossed: [], ladderRung: null })).toBe(false);
  });
});
