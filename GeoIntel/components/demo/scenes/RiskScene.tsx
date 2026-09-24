// components/demo/scenes/RiskScene.tsx
import { Radar } from '@/components/charts';
import { Panel } from '@/components/ui';
import { CountIn } from '@/components/demo/CountIn';
import type { RiskData } from '@/lib/demo/types';
import { Beat, SceneFrame } from './Beat';

/**
 * Chapter 7. The radar's polygon scales out from its centre (RevealOnView's `.reveal-scale`), and that
 * is its own animation, started at mount. So the panel is NOT wrapped in a delayed Beat: a fade-in
 * would hold it at opacity 0 while the scale-out played, and the viewer would see the end of it only.
 * The radar is a fixed-size svg (width/height attributes), so the wrapper caps the panel at the stage
 * width (`max-w-full`, centred and shrink-wrapped) and the svg is let shrink (`max-w-full`, `h-auto`;
 * its viewBox keeps the shape) to fit a phone.
 *
 * The size is capped, not chosen for looks: Radar puts its axis labels 1.26 x (size/2 - 34) from the
 * centre, which passes size/2 above ~329, and the svg then clips the top and bottom labels at every
 * width. 280 keeps all six inside with room for the glyph; the test in tests/demo-scenes-a pins it.
 */
export function RiskScene({ data }: { data: RiskData }) {
  return (
    <SceneFrame>
      <Beat at={0} className="text-center">
        <div className="text-[12px] uppercase tracking-[0.2em] text-faint">Risk profile</div>
        <h2 className="mt-1 text-2xl font-semibold text-text">{data.name}</h2>
      </Beat>
      <div className="w-full max-w-md">
        <Panel className="mx-auto w-fit max-w-full p-3 sm:p-6 [&_svg]:h-auto [&_svg]:max-w-full"><Radar axes={data.axes} size={280} /></Panel>
      </div>
      <Beat at={1500} className="text-center">
        <div className="text-[13px] text-faint">Composite score</div>
        <div className="mono-num text-4xl text-text"><CountIn value={data.score} delayMs={1600} /></div>
      </Beat>
    </SceneFrame>
  );
}
