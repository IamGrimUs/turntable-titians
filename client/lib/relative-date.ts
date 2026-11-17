/**
 * Short, relative date for lists ("just now", "5m ago", "3d ago"); older than 30 days falls back
 * to a plain date. `now` is a parameter so the function stays pure and testable.
 */
export function formatRelativeDate(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days <= 30) return `${days}d ago`
  return then.toLocaleDateString()
}
