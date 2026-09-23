import type { MeteredAction } from '@/lib/quota';
import type { ChapterId, ClaimsState, CloseData } from './types';
import { BASE_PATH } from '@/lib/site';

/**
 * What the tour is allowed to say about paying, and nothing else. It never prints a price, a limit
 * or a plan name of its own: chips and the closing copy are derived here from the same constants
 * /pricing reads, so the day QUOTA_ENFORCED flips or billing opens, the tour changes with it.
 *
 * `MeteredAction` is imported as a TYPE only, so this module does not pull the server-only quota
 * module (and its session and database imports) into a test or a client bundle. The test checks
 * that every action named below is a key of the real METERED map.
 */

/** The metered action behind each chapter's feature. A chapter absent here is free to read. */
export const CHAPTER_ACTION: Partial<Record<ChapterId, MeteredAction>> = {
  language: 'china_deepdive',
  event: 'event_detail',
  ladder: 'china_deepdive',
  trail: 'china_deepdive',
  risk: 'country_deepdive',
  dyad: 'dyad_analysis',
  network: 'network_graph',
};

/** The export control drawn in chapter 10. */
export const EXPORT_ACTION: MeteredAction = 'export';

export function chipFor(id: ChapterId, enforced: boolean): string | null {
  // Alerts go only to a reader on the paid plan who opted in (lib/alerts/state alertRecipients),
  // whatever QUOTA_ENFORCED says — so this chip is unconditional.
  if (id === 'yours') return 'Desk Pro';
  return enforced && CHAPTER_ACTION[id] ? 'Desk' : null;
}

export function exportChipFor(enforced: boolean): string | null {
  return enforced ? 'Desk' : null;
}

export function closingFor(c: ClaimsState): CloseData {
  const canPay = c.mode !== 'closed';
  const enter = { label: 'Enter the threat board', href: `${BASE_PATH}/board`, primary: true };
  const plans = { label: 'See plans', href: `${BASE_PATH}/pricing`, primary: false };

  const copy = c.enforced
    ? canPay
      ? `${c.freeLimit} free analyses, then Desk Pro.`
      : `${c.freeLimit} free analyses, then Desk Pro — subscriptions are not open yet.`
    : 'The board, the event and analysis views, the network and Ask are open while Kautilya is in preview. '
      + (canPay ? 'Email alerts are part of Desk Pro.' : 'Email alerts are part of Desk Pro, which is not open yet.');

  // "See plans" only where /pricing can lead somewhere — closed billing says "not open yet" there.
  return { copy, buttons: canPay ? [enter, plans] : [enter] };
}
