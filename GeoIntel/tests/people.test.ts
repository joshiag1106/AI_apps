// tests/people.test.ts
//
// The person roster and its extraction. Two things are protected here.
//
// First, gazetteer integrity: ids feed edgeKey, which joins with '|', so an id containing
// a pipe would silently merge two different people's edges (see the Task 1 ruling in the
// network-graph ledger, which anticipated exactly this). Home states must be real ISO3
// codes or the affiliation rule in the person panel has nothing to exclude.
//
// Second, alias matching across scripts. Person names are far more dangerous than country
// names here: 'xi' and 'lai' are complete words in English, so a substring match fires
// inside 'taxi' and 'malaise'. The matcher already distinguishes Latin (word-boundary) from
// CJK/Devanagari (substring); these tests pin that it keeps doing so for people.
//
// Mutation notes:
// - "rejects a pipe in any id": deleting the id validation.
// - "resolves the same figure across four scripts": dropping a script's alias handling.
// - "does not fire inside an ordinary word": replacing the Latin branch with a substring test.
// - "home state is a real country": a typo'd or stale ISO3 in the roster.
import { describe, it, expect } from 'vitest';
import { PEOPLE, BY_PERSON, ROSTER_REVIEWED } from '@/data/people';
import { extractPeople } from '@/lib/analyze/entities';
import { BY_ISO } from '@/data/countries';
import { clusterArticles } from '@/lib/verify/cluster';
import type { Article } from '@/lib/types';

describe('the roster', () => {
  it('rejects a pipe in any id, because edgeKey joins on it', () => {
    for (const p of PEOPLE) expect(p.id).not.toContain('|');
  });

  it('uses ids that are unique and lowercase-hyphen', () => {
    const ids = PEOPLE.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('gives every person a home state that is a real country', () => {
    for (const p of PEOPLE) expect(BY_ISO.has(p.home)).toBe(true);
  });

  it('indexes every person by id', () => {
    expect(BY_PERSON.size).toBe(PEOPLE.length);
    expect(BY_PERSON.get('wang-yi')!.home).toBe('CHN');
  });

  it('dates its own review in a form the pages can render', () => {
    // The date is a claim the product makes to readers about how current its coverage is,
    // and it is displayed on /person and /methodology. Both import this constant rather
    // than restating it: when the copy carried its own literal, the People page spent a day
    // telling readers a date older than the file it described. A malformed value would
    // render as-is, so the shape is pinned rather than merely its existence.
    expect(ROSTER_REVIEWED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(ROSTER_REVIEWED))).toBe(false);
  });

  it('carries no Latin alias short enough to fire inside another word', () => {
    // Four characters is the floor. 'xi' and 'lai' are the known offenders; this stops a
    // future roster entry reintroducing the class rather than only pinning those two.
    for (const p of PEOPLE) {
      for (const a of p.aliases) {
        if (/^[\x20-\x7F]+$/.test(a)) expect(a.length).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('gives no two people the same short label', () => {
    // `short` is what a graph node says, so a duplicate does not merely look wrong — it
    // draws two officials under one name and a reader has no way to tell which is which.
    // The roster is full of near-collisions the omission rule exists to dodge: Amit Shah
    // and Balen Shah, Penny Wong and Lawrence Wong, the two Kims, Lin Jian and Lin
    // Chia-lung. This catches a future entry that shortens one of them anyway.
    const byLabel = new Map<string, string[]>();
    for (const p of PEOPLE) {
      if (!p.short) continue;
      byLabel.set(p.short, [...(byLabel.get(p.short) ?? []), p.id]);
    }
    // Guard the guard: a roster with no short labels at all would pass this vacuously.
    expect(byLabel.size).toBeGreaterThan(50);
    expect([...byLabel.entries()].filter(([, ids]) => ids.length > 1)).toEqual([]);
  });
});

describe('extractPeople', () => {
  it('resolves the same figure across four scripts', () => {
    expect(extractPeople('Wang Yi met his counterpart')).toContain('wang-yi');
    expect(extractPeople('王毅会见')).toContain('wang-yi');
    expect(extractPeople('मोदी ने कहा')).toContain('modi');
    expect(extractPeople('قال مودي')).toContain('modi');
  });

  it('does not fire inside an ordinary word', () => {
    // The fixtures have to be words that CONTAIN a real roster alias, or this test passes
    // whatever the matcher does. 'modify' contains 'modi' and 'trumpet' contains 'trump',
    // both of which are live aliases — so dropping the word-boundary requirement makes
    // these headlines name Narendra Modi and Donald Trump.
    //
    // An earlier draft used 'taxi' and 'malaise' to catch 'xi' and 'lai'. Those are not
    // aliases (the four-character floor forbids them), so no alias could fire either way
    // and the assertion held under a substring mutation. It was checked against the mutant,
    // survived, and was replaced. A test whose fixture cannot reach the branch it names is
    // worse than no test, because it reports coverage that does not exist.
    expect(extractPeople('The government will modify the rule')).toEqual([]);
    expect(extractPeople('a trumpet sounded')).toEqual([]);
    // And the alias still fires when it genuinely is the word.
    expect(extractPeople('Modi spoke today')).toEqual(['modi']);
  });

  it('returns each person once however many aliases hit', () => {
    const out = extractPeople('Xi Jinping and 习近平 in one headline');
    expect(out.filter((p) => p === 'xi-jinping')).toHaveLength(1);
  });

  it('returns an empty array when nobody is named', () => {
    expect(extractPeople('Border talks resume')).toEqual([]);
  });
});

/** A minimal article fixture. Only the fields clustering reads are populated. */
function article(over: Partial<Article> & { id: string; title: string }): Article {
  return {
    url: `https://example.test/${over.id}`, outlet: 'Test', publishedAt: '2026-09-01T00:00:00Z',
    snippet: '', imageUrl: null, language: 'en', beatId: 'b', localeKey: 'en-US',
    sourceCountry: 'USA', ownership: 'independent', tier: 1, isPrimary: false,
    actors: [], hotspots: [], domain: 'Diplomatic', escalation: 0, framing: 0,
    ladderRung: null, ladderZh: null, ladderEn: null, glossed: [], titleEn: null,
    relevant: true, videoId: null, people: [], ...over,
  } as Article;
}

describe('people do not disturb event clustering', () => {
  it('leaves event actors byte-identical whether or not people are extracted', () => {
    // THE test this whole plan is built around. Clustering decides two reports describe the
    // same event by testing whether they share an actor (lib/verify/cluster.ts:129). If
    // people were ever folded into `actors`, two reports naming the same official would
    // start clustering together — silently changing which reports become one event, in the
    // one subsystem on this project whose stability was expensive to win.
    //
    // Same fixture twice: once with people populated, once without. Every resulting event's
    // actors must be identical. Merging people into actors fails this immediately.
    const base = [
      article({ id: 'a1', title: 'Modi meets Wang Yi on border', actors: ['IND', 'CHN'] }),
      article({ id: 'a2', title: 'Border talks continue', actors: ['IND', 'CHN'] }),
      article({ id: 'a3', title: 'Trump comments on Taiwan', actors: ['USA', 'TWN'] }),
    ];
    const withPeople = base.map((a) => ({ ...a, people: extractPeople(a.title) }));

    // Guard the guard: if the fixture named nobody, this test would pass vacuously.
    expect(withPeople.flatMap((a) => a.people).length).toBeGreaterThan(0);

    const shape = (arts: Article[]) =>
      clusterArticles(arts).map((e) => e.actors.slice().sort().join(',')).sort().join(' | ');

    expect(shape(withPeople)).toBe(shape(base));
  });

  it('carries people onto the event as a separate field', () => {
    const arts = [article({ id: 'a1', title: 'Modi meets Wang Yi', actors: ['IND', 'CHN'],
      people: ['modi', 'wang-yi'] })];
    const [event] = clusterArticles(arts);
    expect(event.people.slice().sort()).toEqual(['modi', 'wang-yi']);
    expect(event.actors).not.toContain('modi');
  });
});
