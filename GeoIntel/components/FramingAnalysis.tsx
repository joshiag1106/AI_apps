'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { EventAnalysis } from '@/lib/llm/analyse';

type State =
  | { k: 'idle' }
  | { k: 'loading' }
  | { k: 'done'; a: EventAnalysis; cached: boolean; remaining?: number; unlimited?: boolean }
  | { k: 'blocked'; why: 'no_key' | 'quota' | 'refused' | 'error'; detail?: string };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-faint">{title}</div>
      {children}
    </div>
  );
}

export function FramingAnalysis({ eventId, initial, enabled }: {
  eventId: string; initial: EventAnalysis | null; enabled: boolean;
}) {
  const [state, setState] = useState<State>(
    initial ? { k: 'done', a: initial, cached: true } : { k: 'idle' },
  );

  async function run() {
    setState({ k: 'loading' });
    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: eventId }),
      });
      const data = await res.json();
      if (data.unavailable === 'quota') return setState({ k: 'blocked', why: 'quota' });
      if (data.unavailable === 'no_key') return setState({ k: 'blocked', why: 'no_key' });
      if (data.unavailable) return setState({ k: 'blocked', why: data.unavailable, detail: data.detail });
      if (!data.analysis) return setState({ k: 'blocked', why: 'error', detail: 'No analysis returned.' });
      setState({ k: 'done', a: data.analysis, cached: !!data.cached, remaining: data.remaining, unlimited: data.unlimited });
    } catch (e) {
      setState({ k: 'blocked', why: 'error', detail: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-faint">Optional layer</div>
          <h3 className="mt-0.5 text-[15px] font-semibold tracking-tight">Cross-language framing comparison</h3>
        </div>
        {state.k === 'idle' && enabled && (
          <button onClick={run}
            className="rounded-md bg-[color:var(--color-accent)] px-3 py-1.5 text-[12.5px] font-medium text-[#0a0d13] hover:opacity-90">
            Compare how sources frame this
          </button>
        )}
        {state.k === 'done' && state.cached && (
          <span className="text-[10px] uppercase tracking-wider text-faint">cached</span>
        )}
      </div>

      <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-muted">
        The rest of this page is deterministic — glossary, ladder and corroboration scoring run
        with no external service. This one panel asks a language model to read the cluster&apos;s
        reports in their own languages and set out how their framings differ. It compares
        accounts; it does not adjudicate them.
      </p>

      {!enabled && (
        <div className="mt-3 rounded-md border border-[color:var(--color-line)] px-3 py-2.5 text-[12px] leading-relaxed text-muted">
          Not configured. Set <code className="mono-num text-[color:var(--color-accent)]">ANTHROPIC_API_KEY</code> to
          enable it. Everything else on this page works without it.
        </div>
      )}

      {state.k === 'loading' && (
        <div className="sweep relative mt-3 overflow-hidden rounded-md border border-[color:var(--color-line)] px-3 py-6 text-center text-[12px] text-muted">
          Reading {' '}the cluster in its source languages…
        </div>
      )}

      {state.k === 'blocked' && (
        <div className="mt-3 rounded-md border border-[color:var(--color-line)] px-3 py-2.5 text-[12px] leading-relaxed text-muted">
          {state.why === 'quota' && (
            <>Free allowance used. <Link href="/pricing" className="text-[color:var(--color-accent)] hover:underline">See plans</Link> — the deterministic analysis above stays available.</>
          )}
          {state.why === 'no_key' && <>Not configured on this deployment.</>}
          {state.why === 'refused' && <>The model declined to analyse this material. {state.detail}</>}
          {state.why === 'error' && <>The optional layer failed: {state.detail}. Nothing else on this page is affected.</>}
        </div>
      )}

      {state.k === 'done' && (
        <div className="mt-4 space-y-4">
          {state.a.headline_translations.length > 0 && (
            <Section title="Translations">
              <div className="space-y-2">
                {state.a.headline_translations.map((t, i) => (
                  <div key={i} className="rounded border border-[color:var(--color-line-soft)] p-2.5">
                    <div className="text-[10px] text-faint">{t.outlet}</div>
                    <div className="zh-text mt-0.5 text-[13px]">{t.original}</div>
                    <div className="mt-1 text-[12.5px] text-text">{t.english}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="How each bloc frames it">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {state.a.framing_by_bloc.map((f, i) => (
                <div key={i} className="rounded border border-[color:var(--color-line-soft)] p-2.5">
                  <div className="text-[12px] font-medium text-[color:var(--color-accent)]">{f.bloc}</div>
                  <p className="mt-1 text-[12px] leading-snug text-muted">{f.frames_it_as}</p>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-faint">
                    <span className="uppercase tracking-wider">Language: </span>{f.notable_language}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <div className="grid gap-4 sm:grid-cols-2">
            <Section title="Sources agree on">
              <ul className="space-y-1">
                {state.a.points_of_agreement.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[12px] leading-snug text-muted">
                    <span className="text-[color:var(--color-low)]">·</span>{p}
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Sources contest">
              <ul className="space-y-1">
                {state.a.points_of_divergence.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[12px] leading-snug text-muted">
                    <span className="text-[color:var(--color-high)]">·</span>{p}
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <Section title="India relevance">
            <p className="text-[12.5px] leading-relaxed text-text">{state.a.india_relevance}</p>
          </Section>

          <Section title="What would settle the contested points">
            <ul className="space-y-1">
              {state.a.what_would_confirm.map((p, i) => (
                <li key={i} className="flex gap-2 text-[12px] leading-snug text-muted">
                  <span className="text-faint">→</span>{p}
                </li>
              ))}
            </ul>
          </Section>

          <p className="border-t border-[color:var(--color-line-soft)] pt-2.5 text-[11px] leading-relaxed text-faint">
            <span className="uppercase tracking-wider">Caveat: </span>{state.a.caveat}
          </p>

          {state.remaining !== undefined && !state.unlimited && (
            <p className="text-[11px] text-faint">{state.remaining} of 5 free analyses remaining.</p>
          )}
        </div>
      )}
    </div>
  );
}
