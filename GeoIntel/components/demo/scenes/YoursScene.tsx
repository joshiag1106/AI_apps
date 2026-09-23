// components/demo/scenes/YoursScene.tsx
import { Badge, Panel } from '@/components/ui';
import { DemoStar } from '@/components/demo/DemoStar';
import { PaletteMorph } from '@/components/demo/PaletteMorph';
import type { YoursData } from '@/lib/demo/types';
import { Beat, SceneFrame } from './Beat';

const RAMP = ['low', 'guarded', 'elevated', 'high', 'severe'] as const;

/**
 * Chapter 10. Four beats: the watch star pops; the alert email — the real digest, see
 * lib/demo/select — slides in; an export control appears (drawn, never wired: the tour triggers no
 * real export); then the whole page switches to the colour-blind-safe palette and back.
 *
 * The "Desk Pro" chip for the alert is rendered by the tour shell from the billing state, not here.
 */
export function YoursScene({ data }: { data: YoursData }) {
  return (
    <SceneFrame>
      <Beat at={0} className="flex items-center gap-3 text-[20px] text-text">
        <DemoStar afterMs={600} />
        <span>{`Watch ${data.label}`}</span>
      </Beat>

      <Beat at={1800} kind="email" className="w-full max-w-xl">
        <Panel className="p-4">
          <div className="text-[12px] uppercase tracking-[0.16em] text-faint">Ladder alert</div>
          <div className="mt-2 text-[16px] font-semibold text-text">{data.subject}</div>
          {/* break-words as well as pre-wrap: the digest writes its event link as one unbroken
              token, which ran past the panel on a 375px screen and lost its tail. */}
          <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-muted">{data.text}</pre>
        </Panel>
      </Beat>

      <Beat at={5200} className="flex items-center gap-2">
        <span className="rounded-md border border-[color:var(--color-line)] px-4 py-2 text-[14px] text-text">Export · CSV · JSON</span>
        {data.exportChip && <Badge tone="var(--color-accent)">{data.exportChip}</Badge>}
      </Beat>

      <Beat at={7000} className="flex flex-col items-center gap-2">
        {/* An invitation, not a description of the swatches under it: those are the reader's live
            tokens, and PaletteMorph's swap is skipped under reduced motion and never runs without
            JavaScript, so both of those readers see their OWN ramp here. */}
        <div className="text-[13px] text-faint">Choose a colour-blind-safe palette</div>
        <div className="flex gap-2">
          {RAMP.map((t) => <span key={t} className="h-6 w-10 rounded" style={{ background: `var(--color-${t})` }} />)}
        </div>
      </Beat>
      <PaletteMorph atMs={7300} backMs={10800} />
    </SceneFrame>
  );
}
