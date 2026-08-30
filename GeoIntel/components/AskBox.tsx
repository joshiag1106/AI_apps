'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The question input.
 *
 * A plain form navigating to /ask?q=… rather than a fetch: the answer is server-rendered,
 * which makes every question a real URL that can be linked, bookmarked and shared with a
 * colleague. An analyst who finds something wants to send it to someone.
 */
export function AskBox({ initial = '', className = '', autoFocus = false }: {
  initial?: string; className?: string; autoFocus?: boolean;
}) {
  const [q, setQ] = useState(initial);
  const router = useRouter();

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = q.trim();
        if (trimmed) router.push(`/ask?q=${encodeURIComponent(trimmed)}`);
      }}
    >
      <label htmlFor="ask" className="sr-only">Ask a question about the corpus</label>
      <input
        id="ask"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask — what is China doing in the South China Sea?"
        className="w-full rounded border border-[color:var(--color-line)] bg-[color:var(--color-panel)] px-3 py-2 text-[13px] text-text placeholder:text-faint focus:border-[color:var(--color-accent-dim)] focus:outline-none"
      />
    </form>
  );
}
