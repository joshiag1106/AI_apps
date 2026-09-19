/**
 * Space to keep above a deep-link target so the sticky header does not cover it.
 *
 * The header is not a fixed height: its menu wraps onto extra rows as the window narrows,
 * and it measured 92px at 1440 wide, 121px at 1024 and 171px on a phone (checked against a
 * production build, since a test cannot measure layout). Each step below clears the header
 * at the widths it applies to, with a little air. Tailwind scans source for whole class
 * names, so they are written out here rather than assembled.
 *
 * If the header gains a row or a link, re-measure before trusting these.
 */
export const ANCHOR_OFFSET = 'scroll-mt-48 md:scroll-mt-36 xl:scroll-mt-32';
