import { NextResponse } from 'next/server';
import { eventDetail } from '@/lib/queries';
import { analyseEvent } from '@/lib/llm/analyse';
import { llmEnabled } from '@/lib/llm/client';
import { consume } from '@/lib/quota';
import { currentUser } from '@/lib/auth';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Runs the optional LLM framing comparison for one event.
 * Metered like any other deep analysis, and never required — the page renders its full
 * deterministic analysis whether or not this endpoint is ever called.
 *
 * Unlike every other metered view, this one needs an account. It is the only call that
 * spends money, and the anonymous allowance cannot bound it: the device cookie it is keyed
 * on is minted afresh by middleware for any client that does not store it, so a script
 * gets a new allowance with every request. An account is what makes the five mean five.
 */
export async function POST(req: Request) {
  if (!llmEnabled()) {
    return NextResponse.json({ unavailable: 'no_key' }, { status: 200 });
  }
  if (!(await currentUser())) {
    return NextResponse.json({ unavailable: 'signin' }, { status: 401 });
  }

  let id: string;
  try {
    ({ id } = (await req.json()) as { id: string });
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'missing event id' }, { status: 400 });
  }

  const detail = eventDetail(id);
  if (!detail) return NextResponse.json({ error: 'unknown event' }, { status: 404 });

  const gate = await consume('china_deepdive', `llm:${id}`);
  if (!gate.allowed) {
    return NextResponse.json({ unavailable: 'quota', remaining: 0 }, { status: 402 });
  }

  const result = await analyseEvent(detail.event, detail.articles);
  return NextResponse.json({ ...result, remaining: gate.remaining, unlimited: gate.unlimited });
}
