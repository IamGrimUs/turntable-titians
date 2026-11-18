/** Small text helpers shared by the Hall of Fame and runoff display rules. Pure. */

/** "ann", "ann and bob", "ann, bob and cy". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * "Nov 20" for a runoff's `endsAt`, read in UTC. The server sends `endsAt` as midnight in its own
 * timezone (UTC in production), the start of the last day voting is open, so the date part must be
 * read in UTC: in the viewer's local time a New York viewer would see Nov 19 for 2026-11-20T00:00Z.
 */
export function formatUtcShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** "Nov 20", in the viewer's local time. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
