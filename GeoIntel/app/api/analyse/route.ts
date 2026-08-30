import { NextResponse } from 'next/server';
import { eventDetail } from '@/lib/queries';
import { analyseEvent } from '@/lib/llm/analyse';
import { llmEnabled } from '@/lib/llm/client';
import { consume } from '@/lib/quota';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Runs the optional LLM framing comparison for one event.
 * Metered like any other deep analysis, and never required — the page renders its full
 * deterministic analysis whether or not this endpoint is ever called.
 */
export async function POST(req: Request) {
  if (!llmEnabled()) {
    return NextResponse.json({ unavailable: 'no_key' }, { status: 200 });
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
