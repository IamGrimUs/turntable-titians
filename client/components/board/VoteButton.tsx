'use client'

import Link from 'next/link'
import { ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BoardAccess } from '@/lib/board-view'

interface VoteButtonProps {
  count: number
  viewerHasVoted: boolean
  access: BoardAccess
  onToggle: () => void
  disabled?: boolean
  /** True while the session is still loading: shows an inert control instead of a sign-in link. */
  sessionLoading?: boolean
}

const base =
  'inline-flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-md border px-2 py-1 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const idle = 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
const voted = 'border-amber-500/60 bg-amber-500/20 text-amber-400'

/**
 * Up-vote control with its count. READY viewers toggle their vote; anyone else gets a link to
 * what they need to do first (sign in, or choose a username). Generic on purpose: ideas and
 * comments both use it.
 */
export function VoteButton({ count, viewerHasVoted, access, onToggle, disabled, sessionLoading }: VoteButtonProps) {
  const content = (
    <>
      <ChevronUp className="h-5 w-5" aria-hidden="true" />
      <span>{count}</span>
    </>
  )

  // Until the session is known, a signed-in viewer must not be shown a "sign in" link.
  if (sessionLoading) {
    return (
      <button type="button" disabled aria-label={`${count} votes`} className={cn(base, idle, 'disabled:pointer-events-none disabled:opacity-50')}>
        {content}
      </button>
    )
  }

  if (access === 'ANONYMOUS') {
    return (
      <Link href="/auth/signin" aria-label={`Sign in to vote, ${count} so far`} title="Sign in to vote" className={cn(base, idle)}>
        {content}
      </Link>
    )
  }

  if (access === 'NEEDS_USERNAME') {
    return (
      <Link href="/onboarding" aria-label={`Choose a username to vote, ${count} so far`} title="Choose a username to vote" className={cn(base, idle)}>
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={viewerHasVoted}
      aria-label={`${viewerHasVoted ? 'Remove your vote' : 'Vote'}, ${count} so far`}
      className={cn(base, viewerHasVoted ? voted : idle, 'disabled:pointer-events-none disabled:opacity-50')}
    >
      {content}
    </button>
  )
}
