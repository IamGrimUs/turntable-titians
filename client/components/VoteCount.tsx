import { Lock } from 'lucide-react'
import { formatVoteCount } from '@/lib/vote-visibility'

/**
 * Shows a vote count, or, when the server is withholding it, an unmistakable
 * "Hidden" marker so people know the number is hidden on purpose, not missing.
 */
export function VoteCount({ voteCount, suffix = '', className = '' }: { voteCount: number | null; suffix?: string; className?: string }) {
  const v = formatVoteCount(voteCount)
  if (v.hidden) {
    return (
      <span
        title={v.hint}
        aria-label={v.hint}
        className={`inline-flex items-center gap-1 text-muted-foreground ${className}`}
      >
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wider">{v.text}</span>
      </span>
    )
  }
  return <span className={className}>{v.text}{suffix}</span>
}
