import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LadderBadge } from '@/components/LadderBadge';
import { ladderNote } from '@/lib/llm/analyse';
import { allEntries } from '@/data/glossary';
import type { Article } from '@/lib/types';

const badge = (speaker: 'prc' | 'other' | 'unclear' | null | undefined) =>
  renderToStaticMarkup(createElement(LadderBadge, { rung: 8, speaker }));

/**
 * A rung on an article says a formula is present; whose it is decides how it may be described.
 * Beijing's reads as a plain rung. Another party's must say so, and one nobody can attribute
 * must say that — never a bare rung a reader would take for Beijing's.
 */
describe('the rung badge on an article', () => {
  it('is a plain rung when Beijing is the speaker', () => {
    const html = badge('prc');
    expect(html).toContain('rung 8');
    expect(html).not.toContain('not Beijing');
    expect(html).not.toContain('unclear');
  });

  it('says so when it is not Beijing’s', () => {
    expect(badge('other')).toContain('rung 8 · not Beijing');
  });

  it('says so when the speaker cannot be told', () => {
    expect(badge('unclear')).toContain('rung 8 · speaker unclear');
    expect(badge(null)).toContain('rung 8 · speaker unclear');
    expect(badge(undefined)).toContain('rung 8 · speaker unclear');
  });

  it('explains itself on hover', () => {
    expect(badge('other')).toMatch(/title="[^"]*Beijing/);
  });
});

describe('what the language model is told', () => {
  const a = (p: Partial<Article>): Article => ({
    id: 'a', url: 'https://x/1', title: 't', outlet: 'o', publishedAt: '2026-09-19T00:00:00Z', snippet: '',
    imageUrl: null, language: 'zh', beatId: null, localeKey: null, sourceCountry: 'CHN', ownership: 'state',
    tier: 2, isPrimary: true, actors: [], people: [], hotspots: [], domain: 'Diplomatic', escalation: 0,
    framing: 0, ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'makes solemn representations',
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  });

  it('calls Beijing’s formula a PRC formula', () => {
    expect(ladderNote(a({ ladderSpeaker: 'prc' }))).toMatch(/PRC ladder formula detected/);
  });

  it('does not attribute another party’s formula to Beijing', () => {
    const note = ladderNote(a({ ladderSpeaker: 'other' }));
    expect(note).toMatch(/not attributed to Beijing/);
    expect(note).not.toMatch(/PRC ladder formula detected/);
  });

  it('does not attribute an unattributed one either', () => {
    expect(ladderNote(a({}))).toMatch(/not attributed to Beijing/);
  });

  it('says nothing when there is no formula', () => {
    expect(ladderNote(a({ ladderRung: null, ladderZh: null, ladderEn: null }))).toBeNull();
  });
});

describe('the words around it', () => {
  it('has /methodology say the speaker is attributed, how, and what that cannot see', () => {
    const page = readFileSync('app/methodology/page.tsx', 'utf8');
    expect(page).toMatch(/Whose formula it is/);
    expect(page).toMatch(/headlines/i);
    expect(page).toMatch(/not known|unknown/i);
  });

  it('defines the speaker in the glossary, and makes the ladder entries Beijing’s', () => {
    const entries = allEntries();
    const speaker = entries.find((e) => e.id === 'ladder-speaker');
    expect(speaker, 'the glossary needs a ladder-speaker entry').toBeDefined();
    expect(speaker!.meaning).toMatch(/unclear/i);
    expect(entries.find((e) => e.id === 'escalation-ladder')!.meaning).toMatch(/whose|speaker|attributed/i);
  });

  it('exports the speaker beside the rung', () => {
    expect(readFileSync('app/api/export/route.ts', 'utf8')).toContain('ladder_speaker');
  });
});
