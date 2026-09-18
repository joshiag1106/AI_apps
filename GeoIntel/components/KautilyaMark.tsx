/**
 * The Kautilya mark: four ascending bars with an arrow escaping the tallest one.
 *
 * Drawn from the product's most distinctive feature rather than invented as decoration —
 * the PRC escalation-ladder detector reads official statements as a sequence of rising,
 * named severities. The bars are that ladder; the arrow is what "escalates beyond it" means.
 *
 * `withArrow` defaults on for the wordmark lockup (nav, splash) and off for anywhere the
 * mark renders small — the arrow's diagonal stroke is the first thing to blur into noise
 * below about 24px, so app/icon.tsx (the 32px favicon) explicitly turns it off rather than
 * risk a smudge in a browser tab.
 */
export function KautilyaMark({ size = 28, withArrow = true }: { size?: number; withArrow?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" role="img" aria-label="Kautilya">
      <rect x="14" y="52" width="8" height="10" rx="1.5" fill="#7a5f1d" />
      <rect x="26" y="42" width="8" height="20" rx="1.5" fill="#a67f28" />
      <rect x="38" y="30" width="8" height="32" rx="1.5" fill="#c99f31" />
      <rect x="50" y="14" width="8" height="48" rx="1.5" fill="#e8b339" />
      {withArrow && (
        <path d="M50 14 L60 8 M50 20 L60 8" stroke="#e8b339" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      )}
    </svg>
  );
}
