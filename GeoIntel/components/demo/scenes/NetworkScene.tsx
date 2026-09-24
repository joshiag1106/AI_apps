// components/demo/scenes/NetworkScene.tsx
import { NetworkGraph } from '@/components/NetworkGraph';
import { Panel } from '@/components/ui';
import { nodeLabel } from '@/lib/graph/ego';
import { BY_ISO } from '@/data/countries';
import type { NetworkData } from '@/lib/demo/types';
import { Beat, SceneFrame, beatStyle } from './Beat';

/** When the walk steps on from the state reached to an official, if it does. */
const PERSON_STEP_MS = 4500;

/**
 * Chapter 9. The graph is drawn as if the reader had just walked from `from` to `to`, so
 * NetworkGraph lights the edge just crossed (`edge-traveled`) on mount. That is its own 900 ms
 * animation, so the panel is NOT wrapped in a delayed Beat: a fade-in would hide the edge while it
 * was being drawn and the viewer would see it already finished.
 *
 * With a person step, the walk goes on into the person graph. Both graphs share one grid cell: the state
 * walk fades out (`demo-leave`) at the moment the official's graph rises into its place, and that graph's
 * walked edge waits for its beat (`.demo-beat .edge-traveled` in globals.css) rather than drawing, unseen,
 * on mount. Without one, the scene is the single graph it always was.
 */
export function NetworkScene({ data }: { data: NetworkData }) {
  const p = data.person;
  return (
    <SceneFrame>
      <Beat at={0} className="text-center">
        <div className="text-[12px] uppercase tracking-[0.2em] text-faint">A walk through the network</div>
        <h2 className="mt-1 text-2xl font-semibold text-text">{`${nodeLabel(data.from)} → ${nodeLabel(data.to)}`}</h2>
      </Beat>
      {p && (
        <Beat at={PERSON_STEP_MS} className="-mt-3 text-center text-[15px] text-muted">
          → <span className="font-semibold text-text">{p.name}</span> · {p.role}, {BY_ISO.get(p.home)?.name ?? p.home}
        </Beat>
      )}
      <div className="w-full">
        <Panel className="p-3">
          {p ? (
            <div className="grid">
              <div className="demo-leave [grid-area:1/1]" style={beatStyle(PERSON_STEP_MS)}>
                <NetworkGraph view={data.view} trail={data.trail} topEvents={data.topEvents} />
              </div>
              <Beat at={PERSON_STEP_MS} className="[grid-area:1/1]">
                <NetworkGraph view={p.view} trail={p.trail} topEvents={p.topEvents} />
              </Beat>
            </div>
          ) : (
            <NetworkGraph view={data.view} trail={data.trail} topEvents={data.topEvents} />
          )}
        </Panel>
      </div>
    </SceneFrame>
  );
}
