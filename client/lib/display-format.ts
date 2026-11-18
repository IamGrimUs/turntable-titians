/** Small text helpers shared by the Hall of Fame and runoff display rules. Pure. */

/** "ann", "ann and bob", "ann, bob and cy". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** "Nov 20", in the viewer's local time. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
