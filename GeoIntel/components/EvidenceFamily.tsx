import type { ReactNode } from 'react';
import { RevealOnView } from '@/components/RevealOnView';

/**
 * One report, and the other versions of it.
 *
 * The reprints sit in a native <details>, closed at rest. That is the resting state on
 * purpose: with JavaScript off, or with reduced motion requested, this is exactly what
 * renders, and nothing is hidden that cannot be opened by keyboard or screen reader.
 * RevealOnView's fold surface only ever starts from OPEN and closes it — see there.
 *
 * "Also printed by", never "copied from": which outlet copied which cannot be known from a
 * headline, and the interface must not claim it. And when the other versions are all from the
 * SAME outlet — a video and its article, a magazine's numbered pages — it says so instead:
 * "also printed by" the outlet already shown would claim a second publisher that does not exist.
 */
export function EvidenceFamily({ lead, outlets, sameOutlet, count, children }: {
  lead: ReactNode;
  /** Outlets other than the lead's that printed it, de-duplicated. Empty when there are none. */
  outlets: string[];
  /** The lead's own outlet, named when it is the only one. */
  sameOutlet: string;
  /** How many reports sit under the lead. */
  count: number;
  /** The compact rows for those reports. */
  children: ReactNode;
}) {
  const others = outlets.length > 0;
  const noun = others ? (count === 1 ? 'reprint' : 'reprints') : (count === 1 ? 'other version' : 'other versions');
  return (
    // className="" rather than the default `contents`: the parent divides its children with
    // borders, and a display:contents wrapper has no box to draw one on.
    <RevealOnView className="">
      <div>
        {lead}
        <details data-reveal-fold className="mb-3 ml-3 border-l border-[color:var(--color-line)] pl-3">
          <summary className="cursor-pointer text-[13px] text-muted hover:text-text">
            {others ? `Also printed by ${outlets.join(', ')}` : `More from ${sameOutlet} under the same headline`}
            <span className="ml-1.5 text-faint">· {count} {noun}, counted once</span>
          </summary>
          <div data-fold-body className="divide-y divide-[color:var(--color-line-soft)]">{children}</div>
        </details>
      </div>
    </RevealOnView>
  );
}
