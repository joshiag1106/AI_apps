'use client';

import { useEffect, useRef } from 'react';

/**
 * Puts the reader on the answer after a question is asked.
 *
 * Asking a question is a client-side navigation — AskBox calls router.push so that every
 * question is a real, shareable URL — and Next replaces the page content in place without
 * a document load. The browser therefore does none of the things it does on a real
 * navigation: it does not move focus, and there is no new document for a screen reader to
 * announce. Verified in the running page rather than reasoned about: after following a
 * question link, the URL and the <h1> had both changed to the question and
 * document.activeElement was <body>. The reader is left at the top of the document with
 * nothing said, and no way to know an answer arrived.
 *
 * The fix is to move focus to the heading, which is the standard route-change repair and
 * the one that suits what actually happened here. It is deliberately NOT the live region
 * that LivePulse uses, and the difference is worth stating because both look like "the
 * page changed": LivePulse rewrites the page UNDER a reader who did not ask for it, so it
 * must speak without stealing focus. Here the reader asked, so the right response is to
 * take them to what they asked for and let them read down from it, exactly as a real page
 * load would. Announcing as well would talk over the heading it just moved to.
 *
 * Keyed on the question so that re-rendering for any other reason — a poll from
 * LivePulse, a palette change — does not yank focus back out of whatever the reader has
 * since moved to.
 */
export function AnswerFocus({ question, targetId }: { question: string; targetId: string }) {
  const landed = useRef<string | null>(null);

  useEffect(() => {
    if (!question || landed.current === question) return;
    landed.current = question;
    document.getElementById(targetId)?.focus();
  }, [question, targetId]);

  return null;
}
