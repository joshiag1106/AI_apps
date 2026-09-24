// components/demo/scenes/LensScene.tsx
import { LANGUAGE_LABEL } from '@/lib/lang/detect';
import type { LensData, LensSide } from '@/lib/demo/types';
import { Beat, SceneFrame } from './Beat';

const pct = (share: number) => `${Math.round(share * 100)}%`;
const label = (language: string) => LANGUAGE_LABEL[language] ?? language;
const KICKER = 'mb-1 text-[12px] uppercase tracking-[0.16em] text-faint';

function Side({ side, domain }: { side: LensSide; domain: string }) {
  return (
    <div className="min-w-0 space-y-3 rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-panel)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[17px] font-semibold tracking-tight">{label(side.language)}</h3>
        <span className="mono-num text-[13px] text-faint">{side.articles} reports</span>
      </div>

      {side.asked && (
        <div>
          <div className={KICKER}>Asked</div>
          <p className="text-[14px]">
            <span lang={side.language} className="text-text">{side.asked.q}</span>
            {side.asked.en && <span className="text-faint"> — {side.asked.en}</span>}
          </p>
        </div>
      )}

      <div>
        <div className={KICKER}>Framing</div>
        <p className="mb-1 text-[13px] text-faint">From the {side.classified} reports whose wording shows one.</p>
        <ul className="space-y-1">
          {side.framing.map((f) => {
            const differs = f.key === domain;
            return (
              <li key={f.key} data-differs={differs ? 'true' : undefined} className="flex items-center gap-2 text-[13px]">
                <span className={`w-24 shrink-0 ${differs ? 'font-semibold text-text' : 'text-muted'}`}>{f.key}</span>
                <span className="h-1.5 min-w-0 flex-1 rounded bg-[color:var(--color-line)]">
                  <span className={`block h-full rounded bg-[color:var(--color-accent)] ${differs ? '' : 'opacity-35'}`}
                    style={{ width: pct(f.share) }} />
                </span>
                <span className={`mono-num w-10 shrink-0 text-right ${differs ? 'font-semibold text-text' : 'text-muted'}`}>{pct(f.share)}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {side.headline && (
        <div>
          <div className={KICKER}>Latest</div>
          <p lang={side.language} className="text-[14px] leading-snug text-text">{side.headline.title}</p>
          {side.headline.english && <p className="text-[13px] text-faint">Key terms: {side.headline.english}</p>}
          <p className="text-[13px] text-faint">{side.headline.outlet}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Chapter 3. One Language Lens topic: the two languages whose framing of it differs most, side by side,
 * then the difference in the Lens page's own words (lib/lens/compare describeSharpest). Only a difference
 * Lens itself called out reaches here — see lib/demo/select selectLens.
 *
 * The English under a headline is labelled "Key terms", not presented as a translation: it is the stored
 * key terms or the curated Japanese glossary, and a side with neither shows its headline alone.
 */
export function LensScene({ data }: { data: LensData }) {
  return (
    <SceneFrame>
      <Beat at={0} className="text-center">
        <div className="text-[12px] uppercase tracking-[0.2em] text-faint">Language Lens</div>
        <h2 className="mt-1 text-2xl font-semibold text-text">{data.topic}</h2>
      </Beat>

      <div className="grid w-full gap-3 sm:grid-cols-2">
        <Beat at={700} kind="slide"><Side side={data.high} domain={data.domain} /></Beat>
        <Beat at={1500} kind="slide"><Side side={data.low} domain={data.domain} /></Beat>
      </div>

      <Beat at={5000} className="max-w-2xl text-center">
        <p className="text-[17px] leading-relaxed text-text">{data.sentence}</p>
        <p className="mt-1 text-[13px] text-faint">
          From Kautilya&apos;s own searches in each language — a sample, not each country&apos;s whole press.
        </p>
      </Beat>
    </SceneFrame>
  );
}
