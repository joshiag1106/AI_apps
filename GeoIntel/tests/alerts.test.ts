import { describe, it, expect } from 'vitest';
import { detectJumps, type Jump } from '@/lib/alerts/detect';
import { renderDigest, sendDigest } from '@/lib/alerts/send';
import type { WatchItem } from '@/lib/watchlist/store';
import type { GeoEvent } from '@/lib/types';

/**
 * An alert fires when a watched relationship or state moves *up* the PRC escalation
 * ladder — not when it sits where it already was. Beijing repeats a formula for weeks, and
 * a system that mailed on every repetition would be teaching its readers to ignore it.
 *
 * The high-water mark is what makes that distinction, and it is per user and per target:
 * two readers watching the same dyad who signed up a week apart have seen different
 * things, and neither should be told about a rung the other has already been told about.
 */
let n = 0;
function ev(p: Partial<GeoEvent> = {}): GeoEvent {
  n += 1;
  const iso = new Date().toISOString();
  return {
    id: `e${n}`, title: `Event ${n}`, summary: '', firstSeen: iso, lastSeen: iso,
    actors: ['CHN'], hotspots: [], domain: 'Diplomatic', escalation: 0, confidence: 40,
    signals: [], flags: [], articleIds: [`a${n}`], languages: ['zh'], countries: ['CHN'],
    imageUrl: null, videoId: null, ladderRung: null, ladderZh: null, ladderEn: null, ...p,
  };
}
const country = (id: string): WatchItem => ({ kind: 'country', id, label: id });
const dyad = (id: string): WatchItem => ({ kind: 'dyad', id, label: id });
const ids = (js: Jump[]) => js.map((j) => `${j.item.id}@${j.rung}`).sort();

describe('detecting a ladder jump', () => {
  it('alerts when a watched state reaches a rung above the last one seen', () => {
    const jumps = detectJumps([country('CHN')], [ev({ ladderRung: 8, actors: ['CHN'] })], new Map());
    expect(ids(jumps)).toEqual(['CHN@8']);
  });

  it('stays silent when the same rung recurs', () => {
    // Beijing repeats a formula for weeks. Mailing on each repetition trains the reader
    // to ignore the alerts.
    const seen = new Map([['country:CHN', 8]]);
    expect(detectJumps([country('CHN')], [ev({ ladderRung: 8, actors: ['CHN'] })], seen)).toEqual([]);
  });

  it('stays silent when the ladder moves down', () => {
    const seen = new Map([['country:CHN', 8]]);
    expect(detectJumps([country('CHN')], [ev({ ladderRung: 4, actors: ['CHN'] })], seen)).toEqual([]);
  });

  it('reports the highest rung reached, not every rung crossed', () => {
    const events = [ev({ ladderRung: 6, actors: ['CHN'] }), ev({ ladderRung: 12, actors: ['CHN'] })];
    expect(ids(detectJumps([country('CHN')], events, new Map()))).toEqual(['CHN@12']);
  });

  it('carries the previous mark, so the mail can say what changed', () => {
    const seen = new Map([['country:CHN', 4]]);
    const [j] = detectJumps([country('CHN')], [ev({ ladderRung: 8, actors: ['CHN'] })], seen);
    expect(j.previous).toBe(4);
    expect(j.rung).toBe(8);
  });

  it('ignores events with no ladder formula at all', () => {
    expect(detectJumps([country('CHN')], [ev({ ladderRung: null, actors: ['CHN'] })], new Map())).toEqual([]);
  });

  it('ignores what the reader is not watching', () => {
    expect(detectJumps([country('IND')], [ev({ ladderRung: 8, actors: ['CHN'] })], new Map())).toEqual([]);
  });
});

describe('matching a watched relationship', () => {
  it('requires both parties to be in the event', () => {
    const events = [ev({ ladderRung: 8, actors: ['CHN', 'IND'] }), ev({ ladderRung: 12, actors: ['CHN'] })];
    // Rung 12 touches China alone, so it is not an India-China event.
    expect(ids(detectJumps([dyad('IND-CHN')], events, new Map()))).toEqual(['IND-CHN@8']);
  });

  it('does not care which way round the pair is written', () => {
    // Watch ids come from whichever page the reader pinned from.
    const e = [ev({ ladderRung: 8, actors: ['CHN', 'IND'] })];
    expect(detectJumps([dyad('CHN-IND')], e, new Map())).toHaveLength(1);
    expect(detectJumps([dyad('IND-CHN')], e, new Map())).toHaveLength(1);
  });

  it('keeps a state and a relationship on separate marks', () => {
    // Being told about China does not mean having been told about India-China.
    const seen = new Map([['country:CHN', 12]]);
    const jumps = detectJumps(
      [country('CHN'), dyad('IND-CHN')],
      [ev({ ladderRung: 8, actors: ['CHN', 'IND'] })],
      seen,
    );
    expect(ids(jumps)).toEqual(['IND-CHN@8']);
  });
});

describe('what reaches the reader', () => {
  it('returns one entry per target, however many events caused it', () => {
    const events = [
      ev({ ladderRung: 8, actors: ['CHN'] }),
      ev({ ladderRung: 8, actors: ['CHN'] }),
      ev({ ladderRung: 6, actors: ['CHN'] }),
    ];
    expect(detectJumps([country('CHN')], events, new Map())).toHaveLength(1);
  });

  it('attaches the event that justifies the alert, so the mail can link to it', () => {
    const top = ev({ ladderRung: 12, actors: ['CHN'], title: 'the one that matters' });
    const [j] = detectJumps([country('CHN')], [ev({ ladderRung: 4, actors: ['CHN'] }), top], new Map());
    expect(j.event.title).toBe('the one that matters');
  });
});

// ---------------------------------------------------------------------------

const jump = (over: Partial<Jump> = {}): Jump => ({
  item: dyad('IND-CHN'),
  rung: 8, previous: 4,
  event: ev({ id: 'evt1', ladderRung: 8, ladderEn: 'strong protest', ladderZh: '强烈抗议',
    title: 'MOFA lodges strong protest', actors: ['IND', 'CHN'] }),
  ...over,
});

describe('the digest a reader receives', () => {
  it('says what moved and how far, in the subject', () => {
    const d = renderDigest([jump()], 'https://k.example');
    expect(d.subject).toContain('IND-CHN');
    expect(d.subject).toContain('8');
  });

  it('names the formula in English and in Chinese', () => {
    // The Chinese is the thing that actually moved; the English is the reading of it.
    const d = renderDigest([jump()], 'https://k.example');
    expect(d.text).toContain('strong protest');
    expect(d.text).toContain('强烈抗议');
  });

  it('links to the evidence rather than asking to be believed', () => {
    expect(renderDigest([jump()], 'https://k.example').text).toContain('https://k.example/events/evt1');
  });

  it('says how to stop receiving them', () => {
    expect(renderDigest([jump()], 'https://k.example').text.toLowerCase()).toMatch(/account|turn (these )?off|unsubscribe/);
  });

  it('is one mail for several jumps, not several mails', () => {
    const d = renderDigest([jump(), jump({ item: country('CHN'), rung: 12 })], 'https://k.example');
    expect(d.text).toContain('IND-CHN');
    expect(d.text).toContain('CHN');
    expect(d.subject).toMatch(/2|two/i);
  });
});

describe('sending', () => {
  const digest = { subject: 's', text: 't', html: '<p>t</p>' };

  it('sends nothing and says so when no key is configured', async () => {
    // The whole pipeline stays exercisable in development without mailing anyone.
    let called = false;
    const r = await sendDigest('a@b.test', digest, { apiKey: undefined, from: 'x@y.test',
      fetchImpl: (async () => { called = true; return new Response('', { status: 200 }); }) as typeof fetch });
    expect(called).toBe(false);
    expect(r.delivered).toBe(false);
    expect(r.reason).toBe('no_key');
  });

  it('posts to Resend with the recipient, subject and body when a key exists', async () => {
    let seen: { url: string; body: Record<string, unknown>; auth: string } | null = null;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = {
        url: String(url),
        body: JSON.parse(String(init?.body)),
        auth: String((init?.headers as Record<string, string>)?.Authorization ?? ''),
      };
      return new Response(JSON.stringify({ id: 'sent' }), { status: 200 });
    }) as unknown as typeof fetch;

    const r = await sendDigest('a@b.test', digest, { apiKey: 'k', from: 'x@y.test', fetchImpl });
    expect(r.delivered).toBe(true);
    expect(seen!.url).toContain('resend.com');
    expect(seen!.auth).toContain('k');
    expect(seen!.body.to).toEqual(['a@b.test']);
    expect(seen!.body.subject).toBe('s');
  });

  it('reports a refusal instead of throwing, so one bad address cannot stop a run', async () => {
    const fetchImpl = (async () => new Response('bad address', { status: 422 })) as typeof fetch;
    const r = await sendDigest('a@b.test', digest, { apiKey: 'k', from: 'x@y.test', fetchImpl });
    expect(r.delivered).toBe(false);
    expect(r.reason).toContain('422');
  });

  it('survives the network being down', async () => {
    const fetchImpl = (async () => { throw new Error('ECONNREFUSED'); }) as typeof fetch;
    const r = await sendDigest('a@b.test', digest, { apiKey: 'k', from: 'x@y.test', fetchImpl });
    expect(r.delivered).toBe(false);
    expect(r.reason).toContain('ECONNREFUSED');
  });
});
