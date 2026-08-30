import Link from 'next/link';
import { Panel, SectionTitle, Stat, Badge, Empty } from '@/components/ui';
import { EventCard } from '@/components/EventCard';
import { AskBox } from '@/components/AskBox';
import { answerQuestion } from '@/lib/ask/answer';
import { corpus } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Ask · Kautilya' };

/**
 * Questions answered from the corpus.
 *
 * The answer is assembled deterministically, so it works with no API key and returns the
 * same result twice for the same question. It shows the reading of the question alongside
 * the answer, because pattern matching misreads things and a reader who cannot see the
 * reading has no way to tell a misparse from an empty corpus.
 */
const EXAMPLES = [
  'What is happening between China and the Philippines?',
  'Any naval incidents in the South China Sea this week?',
  'How many events involve Pakistan?',
  'What is the Chinese-language reporting on Taiwan?',
  'Has Beijing issued a strong protest?',
  'What is well corroborated about Nepal?',
];

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const question = (q ?? '').trim();
  const answer = question ? answerQuestion(question, corpus()) : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-faint">Ask the corpus</p>
        <h1 className="mt-2 max-w-3xl text-2xl font-semibold leading-snug tracking-tight">
          {question || 'Ask a question about what is being reported'}
        </h1>
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted">
          Answers are computed from the scored corpus, not generated. Every figure below is
          traceable to the events that produced it, and the reading of your question is shown
          alongside the answer so a wrong result can be told apart from a thin corpus.
        </p>
      </div>

      <AskBox initial={question} autoFocus={!question} className="max-w-2xl" />

      {!answer && (
        <Panel className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-faint">Try one of these</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <Link key={e} href={`/ask?q=${encodeURIComponent(e)}`}
                className="rounded border border-[color:var(--color-line-soft)] px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:border-[color:var(--color-accent-dim)] hover:text-text">
                {e}
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {answer && (
        <>
          <Panel className="border-l-2 border-l-[color:var(--color-accent)] p-4">
            <p className="text-[14px] leading-relaxed text-text">{answer.headline}</p>
            {answer.readAs.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-faint">Read as</span>
                {answer.readAs.map((r) => (
                  <Badge key={`${r.label}-${r.value}`} tone="var(--color-muted)">
                    {r.label}: {r.value}
                  </Badge>
                ))}
              </div>
            )}
            {answer.readAs.length === 0 && (
              <p className="mt-3 text-[11.5px] text-faint">
                Nothing in that question matched a state, flashpoint, domain or time window this
                engine tracks, so it was answered on your words alone.
              </p>
            )}
          </Panel>

          {answer.figures.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {answer.figures.map((f) => (
                <Stat key={f.label} label={f.label} value={f.value} sub={f.sub} />
              ))}
            </div>
          )}

          <section>
            <SectionTitle kicker="Ranked by escalation × corroboration, most recent weighted up">
              {answer.empty ? 'No matching events' : 'The evidence'}
            </SectionTitle>
            {answer.empty ? (
              <Empty>
                Nothing in the corpus matches. The corpus is a rolling window of recent reporting,
                not an archive, so a question about something older than that will come back empty
                even when the event was real.
              </Empty>
            ) : (
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {answer.matched.map((e) => <EventCard key={e.id} event={e} />)}
              </div>
            )}
            {answer.total > answer.matched.length && (
              <p className="mt-3 text-[11.5px] text-faint">
                Showing the strongest {answer.matched.length} of {answer.total}.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
