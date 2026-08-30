import { describe, it, expect } from 'vitest';
import { parseQuestion } from '@/lib/ask/parse';
import { answerQuestion } from '@/lib/ask/answer';
import type { GeoEvent } from '@/lib/types';

/**
 * Questions are parsed deterministically, the same way headlines are: the gazetteer that
 * resolves actors in a news title resolves them in a question too, multilingual aliases
 * included. Nothing here needs an API key, which is the point — the LLM layer, when a key
 * exists, writes prose over these results rather than replacing them.
 */
describe('parseQuestion — who and where', () => {
  it('finds the states named in a question', () => {
    const i = parseQuestion('what is happening between China and the Philippines?');
    expect(i.actors).toContain('CHN');
    expect(i.actors).toContain('PHL');
  });

  it('accepts native-script names, as the country search already does', () => {
    expect(parseQuestion('中国 和 印度 的关系').actors).toEqual(expect.arrayContaining(['CHN', 'IND']));
  });

  it('names the parties to a flashpoint without requiring all of them', () => {
    // The South China Sea implicates five states. Requiring every one would exclude the
    // China-Philippines incidents that are most of what happens there, so they are context
    // rather than a filter.
    const i = parseQuestion('how active is the South China Sea?');
    expect(i.hotspots).toContain('scs');
    expect(i.actors).toEqual([]);
    expect(i.impliedActors).toContain('CHN');
  });

  it('still resolves a state named alongside the flashpoint it sits in', () => {
    // Masking must not swallow a genuine mention: this really is a China question.
    expect(parseQuestion('what is China doing in the South China Sea?').actors).toContain('CHN');
  });
});

describe('parseQuestion — what kind of activity', () => {
  it('recognises a domain by name', () => {
    expect(parseQuestion('any nuclear developments?').domains).toContain('Nuclear');
  });

  it('recognises a domain by everyday synonym', () => {
    // An analyst says "naval", not "Maritime".
    expect(parseQuestion('naval incidents this week').domains).toContain('Maritime');
    expect(parseQuestion('trade war news').domains).toContain('Economic');
  });

  it('picks up a PRC ladder threshold', () => {
    expect(parseQuestion('anything at rung 8 or above?').minRung).toBe(8);
    expect(parseQuestion('has Beijing issued a strong protest?').minRung).toBeGreaterThan(0);
  });
});

describe('parseQuestion — when', () => {
  it('reads relative time windows', () => {
    expect(parseQuestion('what happened today?').windowDays).toBe(1);
    expect(parseQuestion('anything this week?').windowDays).toBe(7);
    expect(parseQuestion('trends over the last 30 days').windowDays).toBe(30);
  });

  it('reads an explicit day count', () => {
    expect(parseQuestion('show me the last 45 days').windowDays).toBe(45);
  });

  it('leaves the window open when the question does not constrain it', () => {
    expect(parseQuestion('what is happening with Taiwan?').windowDays).toBeNull();
  });
});

describe('parseQuestion — shape and quality filters', () => {
  it('detects a counting question', () => {
    expect(parseQuestion('how many events involve Pakistan?').shape).toBe('count');
  });

  it('detects a comparison', () => {
    expect(parseQuestion('compare India-China and India-Pakistan').shape).toBe('compare');
  });

  it('detects an explanation request', () => {
    expect(parseQuestion('why is tension rising in the Taiwan Strait?').shape).toBe('why');
  });

  it('applies a corroboration floor when asked for confirmed reporting', () => {
    expect(parseQuestion('what is well corroborated about Nepal?').minConfidence).toBeGreaterThan(0);
  });

  it('restricts to a source language on request', () => {
    expect(parseQuestion('what is the Chinese-language reporting on Taiwan?').language).toBe('zh');
  });

  it('keeps residual words as free-text keywords', () => {
    expect(parseQuestion('anything about semiconductors?').keywords).toContain('semiconductors');
  });

  it('understands an empty question without throwing', () => {
    const i = parseQuestion('');
    expect(i.actors).toEqual([]);
    expect(i.shape).toBe('what');
  });
});

// ---------------------------------------------------------------------------

let n = 0;
function ev(p: Partial<GeoEvent> = {}): GeoEvent {
  n += 1;
  const iso = new Date(Date.now() - 2 * 86_400_000).toISOString();
  return {
    id: `e${n}`, title: `Event ${n}`, summary: '', firstSeen: iso, lastSeen: iso,
    actors: ['CHN'], hotspots: [], domain: 'Diplomatic', escalation: 10, confidence: 40,
    signals: [], flags: [], articleIds: [`a${n}`], languages: ['en'], countries: ['GBR'],
    imageUrl: null, videoId: null, ladderRung: null, ladderZh: null, ladderEn: null, ...p,
  };
}
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

describe('answerQuestion — filtering', () => {
  it('narrows to the states named, requiring all of them', () => {
    const events = [
      ev({ actors: ['CHN', 'PHL'] }),
      ev({ actors: ['CHN'] }),
      ev({ actors: ['IND', 'PAK'] }),
    ];
    const a = answerQuestion('what is happening between China and the Philippines?', events);
    expect(a.total).toBe(1);
  });

  it('narrows by domain', () => {
    const events = [ev({ domain: 'Maritime' }), ev({ domain: 'Economic' })];
    expect(answerQuestion('naval incidents', events).total).toBe(1);
  });

  it('narrows by time window', () => {
    const events = [ev({ lastSeen: daysAgo(2) }), ev({ lastSeen: daysAgo(40) })];
    expect(answerQuestion('what happened this week?', events).total).toBe(1);
  });

  it('narrows by ladder rung', () => {
    const events = [ev({ ladderRung: 8 }), ev({ ladderRung: 3 }), ev({ ladderRung: null })];
    expect(answerQuestion('anything at rung 8 or above?', events).total).toBe(1);
  });

  it('narrows by source language', () => {
    const events = [ev({ languages: ['zh'] }), ev({ languages: ['en'] })];
    expect(answerQuestion('what is the Chinese-language reporting?', events).total).toBe(1);
  });

  it('narrows by corroboration when asked for confirmed reporting', () => {
    const events = [ev({ confidence: 70 }), ev({ confidence: 20 })];
    expect(answerQuestion('what is well corroborated?', events).total).toBe(1);
  });
});

describe('answerQuestion — keywords', () => {
  it('filters on keywords when they are the only signal in the question', () => {
    const events = [ev({ title: 'Semiconductor export controls tighten' }), ev({ title: 'Border talks resume' })];
    expect(answerQuestion('anything about semiconductors?', events).total).toBe(1);
  });

  it('ranks rather than filters when structured signals already narrowed it', () => {
    // Hard-filtering here would drop real China events for missing one word, so keyword
    // matches are surfaced first instead of being the only survivors.
    const events = [
      ev({ actors: ['CHN'], title: 'Border talks resume' }),
      ev({ actors: ['CHN'], title: 'Semiconductor curbs widen' }),
    ];
    const a = answerQuestion('China semiconductors', events);
    expect(a.total).toBe(2);
    expect(a.matched[0].title).toContain('Semiconductor');
  });
});

describe('answerQuestion — the answer itself', () => {
  it('answers a counting question with the count', () => {
    const a = answerQuestion('how many events involve China?', [ev(), ev()]);
    expect(a.headline).toContain('2');
  });

  it('says plainly when nothing matches, rather than looking broken', () => {
    const a = answerQuestion('what is happening in Iceland?', [ev({ actors: ['CHN'] })]);
    expect(a.empty).toBe(true);
    expect(a.total).toBe(0);
    expect(a.headline.toLowerCase()).toContain('no events');
  });

  it('reports how it read the question, so a wrong answer can be traced', () => {
    const a = answerQuestion('naval incidents between China and the Philippines this week', [ev()]);
    const labels = a.readAs.map((r) => r.value).join(' ');
    expect(labels).toContain('China');
    expect(labels).toContain('Maritime');
    expect(labels).toContain('7');
  });

  it('never returns more events than it says it matched', () => {
    const many = Array.from({ length: 40 }, () => ev());
    const a = answerQuestion('what is happening with China?', many);
    expect(a.matched.length).toBeLessThanOrEqual(a.total);
  });
});
