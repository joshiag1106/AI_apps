// components/demo/scenes/ForecastScene.tsx
import { Panel } from '@/components/ui';
import type { ForecastData } from '@/lib/demo/types';
import { Beat, SceneFrame } from './Beat';

const STEPS = [
  { label: 'Recorded', text: 'before the week begins, in a chain each entry seals' },
  { label: 'Settled', text: '72 hours after the week, against corroborated reports' },
  { label: 'Scored', text: 'against the usual rate and "same as last week"' },
] as const;

/**
 * Chapter 11 — "A forecast you can check". A real recorded question, the three steps every forecast goes
 * through, and the live state of the record. It never shows a probability: readers see forecasts only once
 * the record shows they beat both baselines (lib/forecast/score goLiveStatus), and the tour is seen by
 * readers. The chain drawn under the question is decoration, not the real hashes.
 */
export function ForecastScene({ data }: { data: ForecastData }) {
  return (
    <SceneFrame>
      <Beat at={0} className="w-full max-w-2xl">
        <Panel className="p-4">
          <div className="text-[12px] uppercase tracking-[0.16em] text-faint">This week's question</div>
          <div className="mt-2 text-[17px] font-semibold leading-snug text-text">{data.question}</div>
          <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="h-3 w-7 rounded-sm border border-[color:var(--color-accent)] opacity-80" />
                {i < 3 && <span className="h-px w-3 bg-[color:var(--color-accent)] opacity-60" />}
              </span>
            ))}
          </div>
        </Panel>
      </Beat>

      <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <Beat key={s.label} at={1200 + i * 1400}>
            <Panel className="h-full p-3">
              <div className="font-mono text-[12px] text-[color:var(--color-accent)]">{`0${i + 1}`}</div>
              <div className="mt-1 text-[15px] font-semibold text-text">{s.label}</div>
              <div className="mt-1 text-[13px] leading-snug text-muted">{s.text}</div>
            </Panel>
          </Beat>
        ))}
      </div>

      <Beat at={5600} className="text-center text-[15px] text-text">Shown to readers only once it beats both.</Beat>
      <Beat at={6600} className="text-center font-mono text-[12px] text-faint">{data.status}</Beat>
    </SceneFrame>
  );
}
