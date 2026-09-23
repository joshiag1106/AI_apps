import { timeAgo } from '@/lib/format';
import { dayLabel } from '@/lib/verify/trail';
import type { Source } from './types';

/** "Live · updated 14m ago" or "Example captured 14 Sep" — every scene says where its example came from. */
export function sourceBadge(source: Source, updatedAt: string | null, now = Date.now()): string {
  if (source.kind === 'captured') return `Example captured ${dayLabel(source.capturedOn)}`;
  return updatedAt ? `Live · updated ${timeAgo(updatedAt, now)}` : 'Live';
}
