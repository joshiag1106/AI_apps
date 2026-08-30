import 'server-only';
import { getDb } from '@/lib/db';
import { currentSubject } from '@/lib/auth';

export const FREE_LIMIT = 5;

/**
 * Metered actions are the analytical ones — the work the engine does on demand.
 * Browsing headlines, the methodology page and search stay free, because a paywall
 * in front of "what is this site" helps nobody.
 */
export const METERED = {
  event_detail: 'Full event analysis with verification evidence',
  dyad_analysis: 'Relationship deep-dive between two states',
  country_deepdive: 'Country risk profile',
  china_deepdive: 'Chinese-language source analysis',
  export: 'Data export',
} as const;
export type MeteredAction = keyof typeof METERED;

export interface QuotaState {
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
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
    unlimited, kind: subject.kind, signedIn: !!subject.user,
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

  if (!seen && !unlimited) {
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
