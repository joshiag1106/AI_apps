import { describe, it, expect } from 'vitest';
import { detectJumps, type Jump } from '@/lib/alerts/detect';
import { renderDigest, sendDigest, type MailMessage } from '@/lib/alerts/send';
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
    actors: ['CHN'], people: [], hotspots: [], domain: 'Diplomatic', escalation: 0, confidence: 40,
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
  const creds = { user: 'box@gmail.test', pass: 'app-password' };

  it('sends nothing and says so when no credentials are configured', async () => {
    // The whole pipeline stays exercisable in development without mailing anyone.
    let called = false;
    const r = await sendDigest('a@b.test', digest, {
      user: undefined, pass: undefined, transport: async () => { called = true; },
    });
    expect(called).toBe(false);
    expect(r.delivered).toBe(false);
    expect(r.reason).toBe('no_key');
  });

  it('sends nothing when only half the credentials are present', async () => {
    // A username with no password is a misconfiguration, not a licence to try anyway.
    let called = false;
    const r = await sendDigest('a@b.test', digest, {
      user: 'box@gmail.test', pass: undefined, transport: async () => { called = true; },
    });
    expect(called).toBe(false);
    expect(r.reason).toBe('no_key');
  });

  it('hands the recipient, subject and both bodies to the transport', async () => {
    let seen: MailMessage | null = null;
    const r = await sendDigest('a@b.test', digest, {
      ...creds, from: 'box@gmail.test', transport: async (m: MailMessage) => { seen = m; },
    });
    expect(r.delivered).toBe(true);
    expect(seen!.to).toBe('a@b.test');
    expect(seen!.subject).toBe('s');
    expect(seen!.text).toBe('t');
    expect(seen!.html).toBe('<p>t</p>');
  });

  it('defaults the sender to the authenticated account', async () => {
    // Gmail rewrites From to whichever account authenticated, so any other default is a
    // header the reader will never actually see.
    let seen: MailMessage | null = null;
    await sendDigest('a@b.test', digest, {
      ...creds, from: undefined, transport: async (m: MailMessage) => { seen = m; },
    });
    expect(seen!.from).toBe('box@gmail.test');
  });

  it('warns when the sender differs from the authenticated account', async () => {
    // Silently substituted rather than rejected, which is the confusing kind of wrong.
    const warnings: string[] = [];
    await sendDigest('a@b.test', digest, {
      ...creds, from: 'someone@else.test', transport: async () => {},
      warn: (s: string) => warnings.push(s),
    });
    expect(warnings.join(' ')).toContain('someone@else.test');
  });

  it('reports a refusal instead of throwing, so one bad address cannot stop a run', async () => {
    const r = await sendDigest('a@b.test', digest, {
      ...creds, transport: async () => { throw new Error('550 5.1.1 no such user'); },
    });
    expect(r.delivered).toBe(false);
    expect(r.reason).toContain('550');
  });

  it('survives the mail server being unreachable', async () => {
    const r = await sendDigest('a@b.test', digest, {
      ...creds, transport: async () => { throw new Error('ECONNREFUSED'); },
    });
    expect(r.delivered).toBe(false);
    expect(r.reason).toContain('ECONNREFUSED');
  });
});
