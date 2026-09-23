// components/demo/scenes/BoardScene.tsx
import { WorldMap } from '@/components/WorldMap';
import { Stat } from '@/components/ui';
import { CountIn } from '@/components/demo/CountIn';
import type { BoardData } from '@/lib/demo/types';
import { Beat, SceneFrame } from './Beat';

/** Chapter 1. The splash's map is the real corpus; here the numbers under it count up. */
export function BoardScene({ data }: { data: BoardData }) {
  const s = data.stats;
  return (
    <SceneFrame>
      <Beat at={0} className="w-full">
        <WorldMap shapes={data.shapes} data={data.data} markers={data.markers} width={1100} height={520} legend={false} />
      </Beat>
      <Beat at={1200} className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Reports" value={<CountIn value={s.articles} delayMs={1400} />} />
        <Stat label="Countries" value={<CountIn value={s.countries} delayMs={1500} />} />
        <Stat label="Languages" value={<CountIn value={s.languages} delayMs={1600} />} />
        <Stat label="Events" value={<CountIn value={s.events} delayMs={1700} />} />
      </Beat>
    </SceneFrame>
  );
}
