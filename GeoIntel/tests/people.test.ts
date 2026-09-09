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
import { FORMER, DISMISSED, marksPerson } from '../scripts/roster-markers';
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

describe('alias matching across cased non-Latin scripts', () => {
  // Found 2026-09-09 while auditing the silent half of the roster. The non-Latin branch of
  // matches() tested the RAW text, not the lowercased copy. That is harmless for CJK, Arabic
  // and Devanagari, none of which have letter case — and silently fatal for Cyrillic, which
  // does. All ten Cyrillic aliases on the roster had never once matched: Russian and
  // Ukrainian capitalise surnames, so 'песков' could only fire on text that never occurs.
  it('matches a Cyrillic alias in the case the outlet actually publishes', () => {
    const headline =
      'Новые переговоры между Россией, США и Украиной осенью: Песков ответил на заявление Буданова';
    expect(extractPeople(headline)).toContain('peskov');
  });

  it('still matches Han characters run together with their neighbours', () => {
    // The counterpart the fix must not break: Chinese has no word boundaries and a name is
    // routinely glued to the next word — 张又侠案 is "the Zhang Youxia case". Substring
    // matching is what makes that work, so the fix had to stay a substring test.
    expect(extractPeople('张又侠案下一步更凶？')).toContain('zhang-youxia');
  });

  it('follows a Russian surname into its declined forms', () => {
    // Пескова is the genitive of Песков. Substring matching gets this for free, which is
    // why the fix lowercases rather than adding word boundaries for Cyrillic.
    expect(extractPeople('Заявление Пескова о переговорах')).toContain('peskov');
  });
});

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

describe('the roster audit detectors', () => {
  // Added 2026-09-09, after Zhang Youxia sat mislabelled through a whole review pass. Two
  // separate blind spots hid him, and each of these tests pins one of them shut.
  it('reads a dismissal, which is not a "former" construction at all', () => {
    // The exact sentence VOA published, and the reason FORMER was never going to match it:
    // "formally relieved of office" contains no former-shaped word in any language.
    const voa = '习近平军中大清洗再升级 张又侠、刘振立被正式免职，习的亲信钟绍军落马';
    expect(FORMER.test(voa)).toBe(false);
    expect(DISMISSED.test(voa)).toBe(true);
  });

  // Each marker gets its OWN fixture, and that is not redundant with the sentence above.
  // The real VOA line carries 免职 AND 落马, so deleting either from the pattern left the
  // test green — the fixture's right and wrong answers coincided, which is the exact way
  // two earlier tests in this repo passed against their own mutants. A fixture that can
  // still match by another route pins nothing.
  it.each([
    ['免职', '张又侠、刘振立被正式免职'],
    ['落马', '习近平的亲信钟绍军也落马'],
    ['解职', '该将领已被解职'],
    ['被查', '中央军委委员被查'],
    ['双开', '前防长被双开'],
  ])('pins %s on a fixture that matches by no other route', (_marker, sentence) => {
    expect(DISMISSED.test(sentence)).toBe(true);
  });

  it('keeps the precision guard that stops Chinese 前 firing on everything', () => {
    // 目前 (currently) and 之前 (before) are ordinary words. A detector that fires on bare 前
    // flags the whole corpus and gets ignored, which is worse than not existing.
    expect(FORMER.test('目前中方立场不变')).toBe(false);
    expect(FORMER.test('之前的会谈')).toBe(false);
    expect(FORMER.test('前防长表示')).toBe(true);
  });

  // The VOA digest that made proximity necessary. It is one paragraph naming a purge AND
  // three unrelated figures, so a detector that only asks "does this article contain 免职"
  // marks Xi, Trump and the US Treasury Secretary as dismissed. The real sentence is
  // 张又侠、刘振立被正式免职 — the marker sits beside the name it belongs to.
  const digest =
    '2026年9月1日《VOA今日焦点》重点新闻内容包括：美加码伊朗制裁牵动中国，财长贝森特敦促20国集团成员国应重新审视对中国的贸易条款；' +
    '习近平军中大清洗再升级 张又侠、刘振立被正式免职，习的亲信钟绍军落马，专家分析：影响解放军“指挥链”与对台战力';

  it('binds a dismissal to the name it stands beside', () => {
    expect(marksPerson(digest, DISMISSED, ['张又侠'])).toBe(true);
  });

  it('does not mark everyone else named in the same paragraph', () => {
    // Bessent is in this text, 40-odd characters from a 免职 that has nothing to do with him.
    // Before the window existed he came back flagged as removed from office.
    expect(marksPerson(digest, DISMISSED, ['贝森特'])).toBe(false);
  });

  it('does not bind a marker to a name in a different clause', () => {
    const lula = 'former Brazil military chief reveals inside struggle, as Lula responded';
    expect(marksPerson(lula, FORMER, ['lula'])).toBe(false);
  });

  it('does not treat an ordinary word as a dismissal', () => {
    expect(DISMISSED.test('India and China resume border talks')).toBe(false);
    expect(DISMISSED.test('中印边境会谈重启')).toBe(false);
  });

  it('reads English removals as well as Chinese ones', () => {
    expect(DISMISSED.test('Defence chief sacked amid corruption probe')).toBe(true);
    expect(DISMISSED.test('General removed from his post')).toBe(true);
  });
});
