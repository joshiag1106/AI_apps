// components/demo/scenes/NetworkScene.tsx
import { NetworkGraph } from '@/components/NetworkGraph';
import { Panel } from '@/components/ui';
import { nodeLabel } from '@/lib/graph/ego';
import type { NetworkData } from '@/lib/demo/types';
import { Beat, SceneFrame } from './Beat';

/**
 * Chapter 8. The graph is drawn as if the reader had just walked from `from` to `to`, so
 * NetworkGraph lights the edge just crossed (`edge-traveled`) on mount. That is its own 900 ms
 * animation, so the panel is NOT wrapped in a delayed Beat: a fade-in would hide the edge while it
 * was being drawn and the viewer would see it already finished.
 */
export function NetworkScene({ data }: { data: NetworkData }) {
  return (
    <SceneFrame>
      <Beat at={0} className="text-center">
        <div className="text-[12px] uppercase tracking-[0.2em] text-faint">A walk through the network</div>
        <h2 className="mt-1 text-2xl font-semibold text-text">{`${nodeLabel(data.from)} → ${nodeLabel(data.to)}`}</h2>
      </Beat>
      <div className="w-full">
        <Panel className="p-3">
          <NetworkGraph view={data.view} trail={data.trail} topEvents={data.topEvents} />
        </Panel>
      </div>
    </SceneFrame>
  );
}
