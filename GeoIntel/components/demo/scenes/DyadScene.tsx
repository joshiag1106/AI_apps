// components/demo/scenes/DyadScene.tsx
import { Columns } from '@/components/charts';
import { Panel } from '@/components/ui';
import { CountIn } from '@/components/demo/CountIn';
import type { DyadData } from '@/lib/demo/types';
import { Beat, SceneFrame } from './Beat';

/**
 * Chapter 8. The 90-day tension columns draw in, and the defining events land on the days they
 * happened. Marker hrefs are inert (`#0`, `#1`, ...): the stage is inert while this scene plays, and a
 * captured example's events no longer exist to link to. Each one is unique because Columns keys a marker
 * by `${date}-${href}`, and two defining events can share a day.
 *
 * The columns panel has no Beat around it on purpose: the markers pop via RevealOnView on mount, and
 * `.demo-beat` holds an element at opacity 0 until its delay, so they would finish popping before anyone
 * could see them. Only the header and the tension index (text and a CountIn) are beat-timed.
 */
export function DyadScene({ data }: { data: DyadData }) {
  return (
    <SceneFrame>
      <Beat at={0} className="text-center">
        <div className="text-[12px] uppercase tracking-[0.2em] text-faint">Relationship analysis</div>
        <h2 className="mt-1 text-2xl font-semibold text-text">{`${data.aName} — ${data.bName}`}</h2>
      </Beat>
      <div className="w-full">
        <Panel className="p-4">
          <Columns data={data.series} height={140}
            color={data.score >= 55 ? 'var(--color-high)' : 'var(--color-accent)'}
            markers={data.markers.map((m, i) => ({ ...m, href: `#${i}` }))} />
          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-faint">
            <i className="h-2 w-2 rounded-full" style={{ background: 'var(--color-accent)' }} />
            defining event
          </div>
        </Panel>
      </div>
      <Beat at={2400} className="text-center">
        <div className="text-[13px] text-faint">Tension index</div>
        <div className="mono-num text-4xl text-text"><CountIn value={data.score} delayMs={2500} /></div>
      </Beat>
    </SceneFrame>
  );
}
