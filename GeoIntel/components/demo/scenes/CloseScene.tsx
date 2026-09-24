// components/demo/scenes/CloseScene.tsx
import { KautilyaMark } from '@/components/KautilyaMark';
import type { CloseData } from '@/lib/demo/types';
import { Beat, SceneFrame } from './Beat';

const PRIMARY = 'rounded-md bg-[color:var(--color-accent)] px-8 py-3 text-[16px] font-semibold text-[#0a0d13] transition-opacity hover:opacity-90';
const SECONDARY = 'rounded-md border border-[color:var(--color-line)] px-8 py-3 text-[16px] text-text transition-colors hover:border-[color:var(--color-accent)]';

/**
 * Chapter 12 — the one interactive scene. Its buttons are plain anchors, NOT next/link: a soft
 * navigation from /demo (chromeless) to /board would carry the hidden chrome across, exactly as
 * app/page.tsx documents for the splash. The copy comes from lib/demo/claims, derived from the
 * billing state; this file never writes a price, a limit or a plan.
 */
export function CloseScene({ data }: { data: CloseData }) {
  return (
    <SceneFrame className="text-center">
      <Beat at={0}><KautilyaMark size={56} /></Beat>
      <Beat at={300} className="max-w-xl text-[18px] leading-relaxed text-text">{data.copy}</Beat>
      <Beat at={700} className="flex flex-wrap justify-center gap-3">
        {data.buttons.map((b) => (
          <a key={b.href} href={b.href} className={b.primary ? PRIMARY : SECONDARY}>{b.label}</a>
        ))}
      </Beat>
    </SceneFrame>
  );
}
