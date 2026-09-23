import type { ChapterId } from './types';

export interface ChapterMeta { id: ChapterId; title: string; caption: string; seconds: number }

/**
 * The eleven chapters, in order. Captions describe what the ENGINE does and never what a reader
 * pays — the only plan wording in the tour comes from lib/demo/claims, derived from the billing
 * state, so deciding free versus billing later needs no edit here. The closing chapter's caption
 * below is a default that the builder replaces with the state-specific copy.
 */
export const CHAPTERS: readonly ChapterMeta[] = [
  { id: 'board', title: 'The world, scored', seconds: 10,
    caption: "Every state coloured by risk from today's reporting; the hotter a flashpoint, the faster it pulses." },
  { id: 'language', title: 'Read in the language it was written', seconds: 11,
    caption: 'A Chinese headline with its pinyin, and the official formula inside it explained.' },
  { id: 'event', title: 'Many reports, one event', seconds: 12,
    caption: 'Reports are grouped into one event, a reprint is counted once, and confidence is scored from named signals — not asserted as truth.' },
  { id: 'ladder', title: 'Where on the ladder, and whose formula', seconds: 11,
    caption: "Thirteen rungs of official language. A rung counts as Beijing's only when the headline shows Beijing said it." },
  { id: 'trail', title: 'The evidence trail', seconds: 9,
    caption: 'When Beijing used a formula, and about whom. A dot is a headline found; no dot is not calm.' },
  { id: 'risk', title: 'Six vectors of risk', seconds: 8,
    caption: 'Military, economic, cyber, internal, diplomatic and energy pressure on one state.' },
  { id: 'dyad', title: 'A relationship under strain', seconds: 10,
    caption: 'Ninety days of tension between two states, with the defining events marked.' },
  { id: 'network', title: 'Follow the connections', seconds: 9,
    caption: 'Walk from one state to the next; the link you crossed lights up.' },
  { id: 'ask', title: 'Ask in plain words', seconds: 11,
    caption: 'Questions are answered from the corpus, and the reading of your question is shown beside the answer.' },
  { id: 'yours', title: 'Make it yours', seconds: 13,
    caption: 'Watch a state, get an email when it moves up the ladder, export the data, choose a colour-blind-safe palette.' },
  { id: 'close', title: 'See for yourself', seconds: 8,
    caption: "Enter the threat board and try it on today's reporting." },
];

export function meta(id: ChapterId): ChapterMeta {
  const m = CHAPTERS.find((c) => c.id === id);
  if (!m) throw new Error(`Unknown demo chapter: ${id}`);
  return m;
}
