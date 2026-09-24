// components/demo/scenes/LadderScene.tsx
import type { ReactNode } from 'react';
import { LadderGauge } from '@/components/LadderGauge';
import { LadderBadge } from '@/components/LadderBadge';
import type { LadderData } from '@/lib/demo/types';
import { Beat, SceneFrame } from './Beat';

function Row({ badge, title, outlet, date }: { badge: ReactNode; title: string; outlet: string; date: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="flex-none pt-0.5">{badge}</div>
      <div>
        <div lang="zh" className="text-[15px] text-text">{title}</div>
        <div className="text-[12px] text-faint">{`${outlet} · ${date}`}</div>
      </div>
    </div>
  );
}

/**
 * Chapter 5. The ladder's bars grow in to the detected rung (LadderGauge's own RevealOnView), then
 * two headlines carrying the same kind of language are labelled by whose it is — the badge wording
 * an event page already uses.
 *
 * The gauge has no Beat around it on purpose: it animates itself on mount, and `.demo-beat` holds an
 * element at opacity 0 until its delay, so the bars would finish drawing before anyone could see them.
 * Only the text below it (headlines, closing note) is beat-timed.
 */
export function LadderScene({ data }: { data: LadderData }) {
  return (
    <SceneFrame>
      <div className="w-full max-w-xl"><LadderGauge rung={data.rung} /></div>
      <div className="w-full max-w-2xl divide-y divide-[color:var(--color-line-soft)]">
        <Beat at={3200}>
          <Row badge={<LadderBadge rung={data.rung} speaker="prc" />}
            title={data.beijing.title} outlet={data.beijing.outlet} date={data.beijing.date} />
        </Beat>
        <Beat at={4600}>
          <Row badge={<LadderBadge rung={data.other.rung} speaker="other" />}
            title={data.other.title} outlet={data.other.outlet} date={data.other.date} />
        </Beat>
      </div>
      <Beat at={6000} className="max-w-xl text-center text-[14px] text-muted">
        Same kind of language, different speaker: only the first counts as a statement from Beijing.
      </Beat>
    </SceneFrame>
  );
}
