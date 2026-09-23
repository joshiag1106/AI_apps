import { DemoTour, type TourChapter } from '@/components/demo/DemoTour';
import { isInteractive, renderScene } from '@/components/demo/scenes';
import { sourceBadge } from '@/lib/demo/badge';
import { gatherDemoInput } from '@/lib/demo/gather';
import { buildDemoScript } from '@/lib/demo/script';
import { billing } from '@/lib/billing';
import { FREE_LIMIT, QUOTA_ENFORCED } from '@/lib/quota';

// Reads the live corpus on every request, like the splash. A cached page would show yesterday's
// "Live · updated 14m ago".
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Demo',
  description: "A two-minute tour of what Kautilya does, on today's reporting.",
};

/**
 * The demo tour. This page decides nothing: it gathers the corpus, hands it to the pure builder,
 * renders each chapter's scene on the server, and passes the result to the client shell that runs
 * the clock. See docs/specs/2026-09-20-demo-tour-design.md.
 */
export default function DemoPage() {
  const now = Date.now();
  const input = gatherDemoInput({ enforced: QUOTA_ENFORCED, mode: billing().mode, freeLimit: FREE_LIMIT }, now);
  const script = buildDemoScript(input);

  const chapters: TourChapter[] = script.chapters.map((c) => ({
    id: c.id,
    title: c.title,
    caption: c.caption,
    seconds: c.seconds,
    badge: sourceBadge(c.source, script.updatedAt, now),
    chip: c.chip,
    interactive: isInteractive(c.id),
    scene: renderScene(c),
  }));

  return <DemoTour chapters={chapters} />;
}
