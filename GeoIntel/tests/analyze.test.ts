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

  it('does not mistake the French word for "lake" for the LAC hotspot', () => {
    // Found 2026-09-27: a bare 'lac' alias fired on "le lac Kivu" and tagged a DR Congo
    // shipwreck story IND/CHN. The full phrase and named locations still catch real hits.
    const r = resolveActors('Idjwi : au moins 12 morts dans un naufrage sur le lac Kivu');
    expect(r.hotspots).not.toContain('lac');
    expect(r.actors).not.toEqual(expect.arrayContaining(['IND', 'CHN']));
    expect(resolveActors('Fresh face-off reported on the Line of Actual Control').hotspots).toContain('lac');
  });

  it('recognises the Francophone abbreviation for DR Congo', () => {
    expect(extractActors('Washington et Doha : négociations sur la RDC')).toContain('COD');
  });

  it('does not mistake the Spanish verb "usa" for the USA', () => {
    // Found 2026-09-27, same shape as the French 'lac' bug: 'usa' the bare alias is also
    // the third-person present of "usar" (to use), and fired on Venezuelan political copy
    // with nothing to do with the United States.
    expect(extractActors('Maduro usa la crisis para consolidar poder en Venezuela')).not.toContain('USA');
    expect(extractActors('Estados Unidos impone sanciones a funcionarios de Venezuela')).toContain('USA');
  });

  it('recognises Brazil\'s own Portuguese name for itself', () => {
    expect(extractActors('Governo do Brasil anuncia nova politica economica')).toContain('BRA');
  });

  it('recognises the Spanish accented spelling of Pakistan', () => {
    // Found 2026-09-27: a real El Nacional story on Pakistan and China dropped Pakistan
    // entirely because the alias list only had the unaccented English spelling.
    expect(extractActors('Un pacto fronterizo entre Pakistán y China enfurece a India')).toContain('PAK');
  });

  it('reads "Chinese Taipei", the name Taiwan competes under, as Taiwan alone', () => {
    // Found 2026-09-28 in production: every Asian Games report on "Chinese Taipei", and a
    // Spanish "China Taipei" youth baseball story, were tagged CHN as well as TWN — the
    // phrase carries China's alias inside Taiwan's name — and so counted as China–Taiwan
    // co-mentions for events, the dyad and the network.
    const asiad = extractActors('(Asiad) S. Korea shuts out Chinese Taipei to begin baseball title defense');
    expect(asiad).toContain('TWN');
    expect(asiad).not.toContain('CHN');
    expect(extractActors('太太喊「Chinese Taipei」被出征')).toEqual(['TWN']);
    expect(extractActors('antes de enfrentar a China Taipei el sábado')).toEqual(['TWN']);
    expect(extractActors('antes de enfrentar a China Taipéi el sábado')).toEqual(['TWN']);
  });

  it('still tags China when a text names it besides Chinese Taipei', () => {
    expect(extractActors('China objects to the Chinese Taipei flag at the Games')).toEqual(expect.arrayContaining(['CHN', 'TWN']));
  });

  it("does not read the PRC's full name as Taiwan's, or Taiwan's as China's", () => {
    // Found 2026-09-28 in production, the mirror image of "Chinese Taipei": 'republic of
    // china', Taiwan's official name, sits inside "People's Republic of China", so three
    // National Day stories — one a Chinese embassy reception in India — were tagged TWN.
    // All three wrote the apostrophe curly, which CHN's own alias did not match either.
    // And "Republic of China" alone carries China's bare alias, so it was tagged CHN too.
    expect(extractActors('Chinese Embassy in India celebrates the 77th anniversary of the People’s Republic of China')).not.toContain('TWN');
    expect(extractActors("The People's Republic of China marks National Day")).toEqual(['CHN']);
    expect(extractActors('The People’s Republic of China marks National Day')).toEqual(['CHN']);
    expect(extractActors('The Republic of China marks its National Day')).toEqual(['TWN']);
  });

  it('matches a plain alias against the same name written with accents', () => {
    // Spanish, Portuguese and French accent names English spells plain. Before 2026-09-28
    // the Latin matcher compared raw letters, so "México" never met 'mexico'.
    expect(extractActors('México y Canadá discuten aranceles')).toEqual(expect.arrayContaining(['MEX', 'CAN']));
    expect(extractActors('Irán amenaza con cerrar el estrecho de Ormuz')).toContain('IRN');
    expect(extractActors('Israël frappe des positions au sud')).toContain('ISR');
  });

  it('recognises Spanish, Portuguese and French names for tracked states', () => {
    expect(extractActors('Japón y Corea del Sur refuerzan su alianza')).toEqual(expect.arrayContaining(['JPN', 'KOR']));
    expect(extractActors('Turquía y Rusia negocian un alto el fuego')).toEqual(expect.arrayContaining(['TUR', 'RUS']));
    expect(extractActors('Sanciones de EE.UU. contra funcionarios venezolanos')).toContain('USA');
    expect(extractActors('Alemanha, França e Reino Unido pedem cessar-fogo')).toEqual(expect.arrayContaining(['DEU', 'FRA', 'GBR']));
    expect(extractActors('Irã e Japão assinam acordo')).toEqual(expect.arrayContaining(['IRN', 'JPN']));
    expect(extractActors('EUA e China divulgam listas de produtos para corte de tarifas')).toContain('USA');
    expect(extractActors('La Chine et les États-Unis relancent le dialogue')).toEqual(expect.arrayContaining(['CHN', 'USA']));
    expect(extractActors('Le Liban accuse Israël')).toEqual(expect.arrayContaining(['LBN', 'ISR']));
  });

  it('matches an accented alias only with its accent', () => {
    // Folding 'irã' to 'ira' would fire on "irá" (Portuguese "will go") in every other
    // sentence, and 'frança' to 'franca' on "zona franca" (a free-trade zone).
    expect(extractActors('O presidente irá a Brasília amanhã')).not.toContain('IRN');
    expect(extractActors('Ampliação da zona franca de Manaus')).not.toContain('FRA');
  });

  it('recognises the Strait of Hormuz by its Spanish, Portuguese and French name', () => {
    // A real El Nacional headline (2026-09-28) named Iran and "Ormuz" and was dropped:
    // one actor, and no hotspot knew the name.
    expect(extractHotspots('Trump rechaza la oferta de Irán para reabrir el estrecho de Ormuz en 7 días')).toContain('hormuz');
  });

  it('does not read the "US$" currency sign as the United States', () => {
    // Found 2026-09-28 reading live Portuguese rows: "déficit de US$ 5,1 bilhões" was tagged
    // USA, and so was every English "US$2.4 billion" — the sign names a currency, not a
    // state, and is usually written straight onto the figure.
    expect(extractActors('Contas externas do Brasil têm déficit de US$ 5,1 bilhões em agosto')).toEqual(['BRA']);
    expect(extractActors('Singapore to auction luxury goods, properties from US$2.4 billion money laundering case')).toEqual(['SGP']);
    expect(extractActors('Israel and Greece sign US$3.5 billion defence deal')).not.toContain('USA');
  });

  it('still tags the United States when a text names it besides quoting US$', () => {
    expect(extractActors('S. Korean individual investors purchase net US$7 bln worth of U.S. stocks')).toContain('USA');
  });

  it('does not read "América", the continent, as the United States', () => {
    // Spanish and Portuguese "América" is the continent (the US is EE.UU./EUA), and
    // English "Latin America" names a region, not a state — both carry 'america'.
    expect(extractActors('La economía de América Latina crece por tercer año')).not.toContain('USA');
    expect(extractActors("Mexico's Caribbean beaches overwhelmed by record sargassum | Inside Latin America")).toEqual(['MEX']);
    expect(extractActors('America imposes new tariffs on steel')).toContain('USA');
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
