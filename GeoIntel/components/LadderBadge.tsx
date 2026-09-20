import { Badge } from '@/components/ui';
import type { LadderSpeaker } from '@/lib/lang/speaker';

/**
 * The rung on one article, and — because a rung only says a formula is PRESENT — whose it is.
 *
 * Beijing's reads as a plain rung. Another party's says so, and one the headline does not settle
 * says that, so a reader never takes a bare rung for Beijing's when it is India's or Vietnam's.
 * (About two in five hits in the real corpus were other governments' — see lib/lang/speaker.)
 *
 * Each label is ONE string: React puts comment markers between adjacent text nodes, which would
 * split "rung 8 · not Beijing" in the markup a screen reader is given.
 */
export function LadderBadge({ rung, speaker }: { rung: number; speaker?: LadderSpeaker | null }) {
  if (speaker === 'prc') {
    return <Badge tone="var(--color-zh)">{`rung ${rung}`}</Badge>;
  }
  if (speaker === 'other') {
    return (
      <Badge tone="var(--color-faint)"
        title="This formula was spoken by another party, not Beijing. It still counts as tension, but not as a PRC statement.">
        {`rung ${rung} · not Beijing`}
      </Badge>
    );
  }
  return (
    <Badge tone="var(--color-faint)"
      title="A formula is present, but the headline does not show whose it is, so it is not counted as Beijing's.">
      {`rung ${rung} · speaker unclear`}
    </Badge>
  );
}
