'use client'

import Link from 'next/link'
import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { HiddenBadge } from '@/components/board/HiddenBadge'
import { StatusBadge } from '@/components/board/StatusBadge'
import { VoteButton } from '@/components/board/VoteButton'
import { authorDisplayName, categoryLabel, topicLabel, type BoardAccess, type IdeaRow } from '@/lib/board-view'
import { formatRelativeDate } from '@/lib/relative-date'

interface IdeaCardProps {
  idea: IdeaRow
  access: BoardAccess
  onToggleVote: (idea: IdeaRow) => void | Promise<void>
  /** Mark a hidden idea. Only the admin list sends hidden ideas; the marker is for admins alone. */
  isAdmin?: boolean
}

/**
 * One idea in the board list. The vote call is made by the page (so it can show the server's
 * message when it fails); the card only tracks the pending state while it runs.
 */
export function IdeaCard({ idea, access, onToggleVote, isAdmin = false }: IdeaCardProps) {
  const [pending, setPending] = useState(false)
  const authorName = authorDisplayName(idea.author)
  const initials = authorName.slice(0, 2).toUpperCase()

  async function toggle() {
    setPending(true)
    try {
      await onToggleVote(idea)
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className={`flex items-start gap-4 p-4 ${isAdmin && idea.hidden ? 'border-dashed opacity-80' : ''}`}>
      <VoteButton count={idea.voteCount} viewerHasVoted={idea.viewerHasVoted} access={access} onToggle={toggle} disabled={pending} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 break-words text-xl font-semibold">
            <Link href={`/board/${idea.id}`} className="hover:underline">
              {idea.title}
            </Link>
          </h2>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {isAdmin && idea.hidden && <HiddenBadge />}
            <StatusBadge status={idea.status} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted-foreground">
          <span>{categoryLabel(idea.category)}</span>
          {idea.topic && <span>{topicLabel(idea.topic)}</span>}
          <span className="inline-flex items-center gap-1" title="Comments">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Comments: </span>
            {idea.commentCount}
          </span>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-base text-muted-foreground">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-base font-medium">
            {idea.author.image ? <img src={idea.author.image} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : initials}
          </span>
          <span className="min-w-0 truncate">
            {authorName} · {formatRelativeDate(idea.createdAt)}
          </span>
        </div>
      </div>
    </Card>
  )
}
