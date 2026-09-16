/**
 * Which ids are new since the last call, given what has already been seen. Mutates
 * `seen` to include everything just passed in, so a repeated call with the same
 * list reports nothing new the second time — the arithmetic behind "flash the
 * events that arrived after someone was already looking at the page."
 */
export function markSeen(seen: Set<string>, ids: string[]): string[] {
  const fresh = ids.filter((id) => !seen.has(id));
  for (const id of ids) seen.add(id);
  return fresh;
}
