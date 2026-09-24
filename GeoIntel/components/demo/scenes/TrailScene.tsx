// components/demo/scenes/TrailScene.tsx
import { LadderTrail } from '@/components/LadderTrail';
import { Panel } from '@/components/ui';
import type { TrailData } from '@/lib/demo/types';
import { Beat, SceneFrame } from './Beat';

/**
 * Chapter 6. The dots draw in (LadderTrail's RevealOnView), one row per country Beijing aimed a formula at.
 *
 * The panel has no Beat around it on purpose: LadderTrail animates itself on mount, and `.demo-beat` holds
 * an element at opacity 0 until its delay, so the dots would finish drawing before anyone could see them.
 * Only the small heading (text) is beat-timed.
 */
export function TrailScene({ data }: { data: TrailData }) {
  return (
    <SceneFrame>
      <Beat at={0} className="text-center">
        <div className="text-[12px] uppercase tracking-[0.2em] text-faint">Beijing&apos;s own formulae, by date and by country</div>
      </Beat>
      <div className="w-full">
        <Panel className="p-4"><LadderTrail trail={data.trail} /></Panel>
      </div>
    </SceneFrame>
  );
}
