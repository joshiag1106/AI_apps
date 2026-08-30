import { NextResponse } from 'next/server';
import { runIngest } from '@/lib/ingest/pipeline';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Refresh endpoint for a scheduler (Vercel Cron, systemd timer, GitHub Action).
 * Protected by CRON_SECRET when set; refuses to run unauthenticated in production.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'CRON_SECRET must be set in production' }, { status: 403 });
  }

  try {
    const report = await runIngest();
    return NextResponse.json({ success: true, ...report });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
