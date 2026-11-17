'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@apollo/client'
import { useSession } from 'next-auth/react'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { CommentList } from '@/components/board/CommentList'
import { ConfirmDeleteButton } from '@/components/board/ConfirmDeleteButton'
import { HiddenBadge } from '@/components/board/HiddenBadge'
import { ModerationControls } from '@/components/board/ModerationControls'
import { StatusBadge } from '@/components/board/StatusBadge'
import { VoteButton } from '@/components/board/VoteButton'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { isAdminRole } from '@/lib/admin-access'
import { authorDisplayName, boardAccess, categoryLabel, topicLabel, type IdeaRow } from '@/lib/board-view'
import { DELETE_IDEA, GET_IDEA, UNVOTE_IDEA, VOTE_IDEA } from '@/lib/graphql/board'
import { formatRelativeDate } from '@/lib/relative-date'

function BackLink() {
  return (
    <Link href="/board" className="mb-6 inline-flex min-h-11 items-center gap-1 text-base text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back to the board
    </Link>
  )
}

export default function IdeaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session, status } = useSession()
  const sessionLoading = status === 'loading'
  const access = boardAccess(session?.user)
  const viewerId = session?.user?.id ?? null
  // Only decides whether the moderation controls are drawn; the server enforces every action.
  const isAdmin = isAdminRole(session?.user?.role)

  const [actionError, setActionError] = useState<string | null>(null)
  const [votePending, setVotePending] = useState(false)
  const votingRef = useRef(false)

  // cache-and-network: a deleted or changed idea is not served stale from an earlier visit.
  const { data, loading, error, refetch } = useQuery<{ idea: (IdeaRow & { comments: NonNullable<IdeaRow['comments']> }) | null }>(
    GET_IDEA,
    { variables: { id }, fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' },
  )
  const [voteIdea] = useMutation(VOTE_IDEA)
  const [unvoteIdea] = useMutation(UNVOTE_IDEA)
  const [deleteIdea] = useMutation(DELETE_IDEA, {
    // The list page is not mounted here, so refetchQueries would find nothing to refetch.
    // Evicting the cached `ideas` field makes the list fetch fresh (rows, total, page count)
    // the next time it is shown.
    update(cache) {
      cache.evict({ fieldName: 'ideas' })
    },
  })

  const idea = data?.idea

  async function toggleVote() {
    if (!idea || votingRef.current) return
    votingRef.current = true
    setVotePending(true)
    setActionError(null)
    try {
      // The result (id, voteCount, viewerHasVoted) updates the normalized `Idea:<id>`.
      await (idea.viewerHasVoted ? unvoteIdea : voteIdea)({ variables: { ideaId: idea.id } })
    } catch (e) {
      setActionError(e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.')
      // The cached vote state may be stale (for example it was changed in another tab): reload the
      // idea so the button corrects itself. A failing reload must not replace the message above.
      refetch().catch(() => {})
    } finally {
      votingRef.current = false
      setVotePending(false)
    }
  }

  async function removeIdea() {
    if (!idea) return
    setActionError(null)
    try {
      await deleteIdea({ variables: { id: idea.id } })
      router.push('/board')
    } catch (e) {
      setActionError(e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.')
    }
  }

  let content
  if (error && !idea) {
    content = (
      <div className="py-16 text-center">
        <p role="alert" className="mb-4 text-destructive">
          Error loading idea: {error.message}
        </p>
        <Button variant="outline" onClick={() => refetch().catch(() => {})}>
          Retry
        </Button>
      </div>
    )
  } else if (!idea && loading) {
    content = <p className="py-16 text-center text-muted-foreground">Loading idea...</p>
  } else if (!idea) {
    content = (
      <div className="py-16 text-center">
        <h1 className="mb-2 text-3xl font-graffiti text-foreground">Idea not found</h1>
        <p className="mb-4 text-base text-muted-foreground">It may have been removed, or the link is wrong.</p>
        <Button asChild>
          <Link href="/board">Back to the board</Link>
        </Button>
      </div>
    )
  } else {
    const isOwn = !!viewerId && viewerId === idea.author.id
    content = (
      <>
        <Card className="p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <VoteButton
              count={idea.voteCount}
              viewerHasVoted={idea.viewerHasVoted}
              access={access}
              onToggle={toggleVote}
              disabled={votePending}
              sessionLoading={sessionLoading}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h1 dir="auto" className="min-w-0 break-words text-3xl font-semibold text-foreground">{idea.title}</h1>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {isAdmin && idea.hidden && <HiddenBadge />}
                  <StatusBadge status={idea.status} />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted-foreground">
                <span>{categoryLabel(idea.category)}</span>
                {idea.topic && <span>{topicLabel(idea.topic)}</span>}
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Comments: </span>
                  {idea.commentCount}
                </span>
              </div>
              <p className="mt-2 break-words text-base text-muted-foreground">
                {authorDisplayName(idea.author)} · {formatRelativeDate(idea.createdAt)}
              </p>
            </div>
          </div>
          <p dir="auto" className="mt-4 whitespace-pre-wrap break-words text-base text-foreground">{idea.body}</p>
          {isOwn && !isAdmin && (
            <div className="mt-4">
              <ConfirmDeleteButton
                label="Delete idea"
                question="Delete this idea and its comments? This cannot be undone."
                onConfirm={removeIdea}
                size="default"
              />
            </div>
          )}
          {isAdmin && (
            <div className="mt-4">
              <ModerationControls kind="idea" id={idea.id} status={idea.status} hidden={idea.hidden} />
            </div>
          )}
        </Card>

        {actionError && (
          <p role="alert" className="mt-4 text-base text-destructive">
            {actionError}
          </p>
        )}

        <CommentList
          ideaId={idea.id}
          comments={idea.comments}
          commentCount={idea.commentCount}
          access={access}
          sessionLoading={sessionLoading}
          viewerId={viewerId}
          isAdmin={isAdmin}
        />
      </>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <BackLink />
      {content}
    </div>
  )
}
