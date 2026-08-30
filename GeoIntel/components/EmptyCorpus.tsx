import Link from 'next/link';

/**
 * First-run state. Nothing here is broken when the corpus is empty — every page renders
 * — but "0 reports from 0 countries" with blank panels reads like a failure, so say
 * plainly what has not happened yet and how to fix it.
 */
export function EmptyCorpus() {
  return (
    <div className="panel border-l-2 border-l-[color:var(--color-accent)] p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-accent)]">
        No data ingested yet
      </div>
      <h2 className="mt-1.5 text-[17px] font-semibold tracking-tight">
        The engine has not been run
      </h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
        Nothing is broken — there is simply no corpus to analyse. Fetch one, which takes
        about seven seconds and needs no API keys:
      </p>
      <pre className="mono-num mt-3 overflow-x-auto rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3.5 py-2.5 text-[12.5px] text-text">
        npm run ingest
      </pre>
      <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-faint">
        That pulls roughly 5,000 reports from 73 feeds across 8 languages, scores them for
        corroboration, and clusters them into events. Re-run it any time to refresh; it also
        re-scores everything already stored, so a change to the lexicon or source registry
        takes effect on old rows too. Or check the feeds first with{' '}
        <span className="mono-num text-muted">npm run ingest -- --health</span>.
      </p>
      <p className="mt-3 text-[12px] text-faint">
        <Link href="/methodology" className="text-[color:var(--color-accent)] hover:underline">
          How the scoring works
        </Link>{' '}
        does not need any data and is worth reading first.
      </p>
    </div>
  );
}
