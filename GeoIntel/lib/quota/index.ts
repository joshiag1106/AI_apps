import 'server-only';
import { getDb } from '@/lib/db';
import { currentSubject } from '@/lib/auth';

export const FREE_LIMIT = 5;

/**
 * The free-preview switch. Added 2026-09-18: Kautilya has nothing to sell yet, so nothing
 * should be metered while it is being evaluated. This is the ONE line to flip back to true
 * when Stripe billing goes live — everything else in this file, and every page that reads
 * quotaState(), keeps working exactly as designed the moment it does, because they all gate
 * on the state this module returns rather than on a number of their own.
 */
export const QUOTA_ENFORCED = false;

/**
 * Metered actions are the analytical ones — the work the engine does on demand.
 * Browsing headlines, the methodology page and search stay free, because a paywall
 * in front of "what is this site" helps nobody.
 */
export const METERED = {
  event_detail: 'Full event analysis with verification evidence',
  dyad_analysis: 'Relationship deep-dive between two states',
  country_deepdive: 'Country risk profile',
  network_graph: 'Network graph of connected states',
  person_network: 'Network of states around an official',
  china_deepdive: 'Chinese-language source analysis',
  export: 'Data export',
} as const;
export type MeteredAction = keyof typeof METERED;

export interface QuotaState {
  used: number;
  limit: number;
  remaining: number;
  /** A paid Pro plan. Never true because of the free-preview period — see previewUnlimited. */
  unlimited: boolean;
  /**
   * Nothing is capped right now, but ONLY because QUOTA_ENFORCED is off, not because this
   * visitor paid for anything. Kept distinct from `unlimited` so a page can say "free while
   * in preview" without also claiming "you are on Pro" — the pricing and account pages read
   * this instead of `unlimited` for exactly that reason.
   */
  previewUnlimited: boolean;
  kind: 'user' | 'device';
  signedIn: boolean;
}

export async function quotaState(): Promise<QuotaState> {
  const subject = await currentSubject();
  const unlimited = subject.user?.plan === 'pro';
  const row = getDb()
    .prepare(`SELECT COUNT(DISTINCT action || ':' || target) AS n FROM usage WHERE subject = ?`)
    .get(subject.id) as { n: number } | undefined;
  const used = Number(row?.n ?? 0);
  return {
    used, limit: FREE_LIMIT, remaining: Math.max(0, FREE_LIMIT - used),
    unlimited, previewUnlimited: !unlimited && !QUOTA_ENFORCED,
    kind: subject.kind, signedIn: !!subject.user,
  };
}

/**
 * Records one metered action and reports whether it is allowed.
 * Re-opening something already viewed does not cost another credit — the unique
 * (action, target) pair is the unit, so a user cannot lose their allowance to a
 * stray refresh or a back button.
 */
export async function consume(action: MeteredAction, target: string): Promise<QuotaState & { allowed: boolean; fresh: boolean }> {
  const subject = await currentSubject();
  const db = getDb();
  const unlimited = subject.user?.plan === 'pro';

  const seen = db.prepare('SELECT 1 AS x FROM usage WHERE subject = ? AND action = ? AND target = ?')
    .get(subject.id, action, target);

  if (!seen && !unlimited && QUOTA_ENFORCED) {
    const state = await quotaState();
    if (state.remaining <= 0) return { ...state, allowed: false, fresh: true };
  }
  if (!seen) {
    db.prepare('INSERT INTO usage (subject,action,target,created_at) VALUES (?,?,?,?)')
      .run(subject.id, action, target, new Date().toISOString());
  }
  const after = await quotaState();
  return { ...after, allowed: true, fresh: !seen };
}

export async function usageLog(limit = 20) {
  const subject = await currentSubject();
  return getDb()
    .prepare('SELECT action, target, created_at FROM usage WHERE subject = ? ORDER BY id DESC LIMIT ?')
    .all(subject.id, limit) as unknown as { action: MeteredAction; target: string; created_at: string }[];
}
