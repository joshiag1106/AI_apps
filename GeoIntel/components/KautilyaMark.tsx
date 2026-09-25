/**
 * The Kautilya mark: the rajamandala, the Arthashastra's circle of twelve kings — the
 * would-be conqueror (vijigishu) at the centre, and the eleven states he has to read around
 * him. It is what the product does: one state in the middle of everyone else's reporting.
 *
 * Replaced the four-bar escalation ladder on 2026-09-25 (Josh's pick from the logo canvas);
 * the ladder read as a phone's signal icon. Dots, not concentric rings, because rings read
 * as a target — and dots make it one family with the RamanujTech partition staircase.
 *
 * `KINGS` is exported so the splash can draw the same points one at a time.
 */
export const KINGS: ReadonlyArray<{ cx: number; cy: number }> = Array.from({ length: 11 }, (_, i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / 11;
  return { cx: +(32 + 22 * Math.cos(a)).toFixed(2), cy: +(32 + 22 * Math.sin(a)).toFixed(2) };
});

export const CENTRE_GOLD = '#e8b339';
export const RING_GOLD = '#a67f28';

export function KautilyaMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Kautilya">
      <circle cx="32" cy="32" r="8" fill={CENTRE_GOLD} />
      {KINGS.map(k => <circle key={`${k.cx},${k.cy}`} cx={k.cx} cy={k.cy} r="4.3" fill={RING_GOLD} />)}
    </svg>
  );
}
