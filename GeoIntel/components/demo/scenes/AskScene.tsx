// components/demo/scenes/AskScene.tsx
import { Badge, Panel, Stat } from '@/components/ui';
import { TypeIn } from '@/components/demo/TypeIn';
import type { AskData } from '@/lib/demo/types';
import { Beat, SceneFrame } from './Beat';

const TYPE_START_MS = 300;
const TYPE_PER_CHAR_MS = 40;

/**
 * When the reading, the answer and the figures appear. The reading never comes before the question
 * has finished typing: a fixed 3200 ms left the longest country pair (~72 characters, ~3180 ms to
 * type) a 20 ms margin, which chained 40 ms timers can eat. Ordinary questions keep 3200 / 4200 / 5200.
 */
export function askBeats(questionLength: number): { reading: number; answer: number; figures: number } {
  const typed = TYPE_START_MS + questionLength * TYPE_PER_CHAR_MS;
  const reading = Math.max(3200, typed + 400);
  return { reading, answer: reading + 1000, figures: reading + 2000 };
}

/**
 * Chapter 10. The question types itself; then how it was READ, then the answer. The reading comes
 * first on purpose: pattern matching misreads things, and app/ask shows the reading beside every
 * answer so a reader can tell a misparse from an empty corpus.
 */
export function AskScene({ data }: { data: AskData }) {
  const at = askBeats(data.question.length);
  return (
    <SceneFrame>
      <Beat at={0} className="w-full max-w-2xl">
        <Panel className="flex items-center gap-3 p-4 text-[18px] text-text">
          <span className="text-faint">Ask</span>
          <TypeIn text={data.question} startMs={TYPE_START_MS} perCharMs={TYPE_PER_CHAR_MS} />
        </Panel>
      </Beat>

      <Beat at={at.reading} className="flex max-w-2xl flex-wrap justify-center gap-2">
        {data.readAs.map((r) => <Badge key={r.label}>{`${r.label}: ${r.value}`}</Badge>)}
      </Beat>

      <Beat at={at.answer} className="max-w-2xl text-center text-[17px] leading-relaxed text-text">{data.headline}</Beat>

      <Beat at={at.figures} className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
        {data.figures.map((f) => <Stat key={f.label} label={f.label} value={f.value} sub={f.sub} />)}
      </Beat>
    </SceneFrame>
  );
}
