'use client'

import Link from 'next/link'
import { useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@apollo/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDeleteButton } from '@/components/board/ConfirmDeleteButton'
import { HiddenBadge } from '@/components/board/HiddenBadge'
import { ModerationControls } from '@/components/board/ModerationControls'
import { VoteButton } from '@/components/board/VoteButton'
import { BOARD_LIMITS, authorDisplayName, type BoardAccess, type CommentRow } from '@/lib/board-view'
import { canSubmitComment, isCommentListTruncated } from '@/lib/comment-form'
import { fieldClass, labelClass } from '@/lib/form-styles'
import { CREATE_COMMENT, DELETE_COMMENT, GET_IDEA, UNVOTE_COMMENT, VOTE_COMMENT } from '@/lib/graphql/board'
import { remainingChars } from '@/lib/post-idea-form'
import { formatRelativeDate } from '@/lib/relative-date'

interface CommentListProps {
  ideaId: string
  comments: CommentRow[]
  /** All visible comments on the idea; larger than `comments.length` when the server capped the list. */
  commentCount: number
  access: BoardAccess
  /** True while the session is loading: no sign-in links and no form are shown yet. */
  sessionLoading: boolean
  viewerId: string | null
  /** Show the hidden marker and the moderation controls. Display only; the server enforces. */
  isAdmin?: boolean
}

function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.'
}

interface CommentItemProps {
  comment: CommentRow
  access: BoardAccess
  sessionLoading: boolean
  isOwn: boolean
  isAdmin: boolean
  onError: (message: string | null) => void
}

function CommentItem({ comment, access, sessionLoading, isOwn, isAdmin, onError }: CommentItemProps) {
  const [pending, setPending] = useState(false)
  const votingRef = useRef(false)
  const [voteComment] = useMutation(VOTE_COMMENT)
  const [unvoteComment] = useMutation(UNVOTE_COMMENT)
  // Deleting changes `commentCount` and the list, so the detail query is refetched.
  const [deleteComment] = useMutation(DELETE_COMMENT, { refetchQueries: [GET_IDEA], awaitRefetchQueries: true })

  async function toggleVote() {
    if (votingRef.current) return
    votingRef.current = true
    setPending(true)
    onError(null)
    try {
      // The result (id, voteCount, viewerHasVoted) updates the normalized `IdeaComment:<id>`.
      await (comment.viewerHasVoted ? unvoteComment : voteComment)({ variables: { commentId: comment.id } })
    } catch (e) {
      onError(errorText(e))
    } finally {
      votingRef.current = false
      setPending(false)
    }
  }

  async function remove() {
    onError(null)
    try {
      await deleteComment({ variables: { id: comment.id } })
    } catch (e) {
      onError(errorText(e))
    }
  }

  const name = authorDisplayName(comment.author)
  // The server sends hidden comments only to admins (inside an opened idea); the marker is for them alone.
  const showHidden = isAdmin && comment.hidden

  return (
    <li>
      <Card className={`flex items-start gap-4 p-4 ${showHidden ? 'border-dashed opacity-80' : ''}`}>
        <VoteButton
          count={comment.voteCount}
          viewerHasVoted={comment.viewerHasVoted}
          access={access}
          onToggle={toggleVote}
          disabled={pending}
          sessionLoading={sessionLoading}
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{name}</span> · {formatRelativeDate(comment.createdAt)}
            </span>
            {showHidden && <HiddenBadge />}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-base text-foreground">{comment.body}</p>
          {isOwn && !isAdmin && (
            <div className="mt-2">
              <ConfirmDeleteButton label="Delete" question="Delete this comment?" onConfirm={remove} />
            </div>
          )}
          {isAdmin && <ModerationControls kind="comment" id={comment.id} hidden={comment.hidden} />}
        </div>
      </Card>
    </li>
  )
}

/**
 * The comments of an idea (oldest first, as the server sends them) and the comment form.
 * The form is only for READY viewers; the others get a link to what they need to do first,
 * and no mutation is ever sent for them.
 *
 * Cache: creating or deleting a comment refetches the active `GET_IDEA` query, which brings
 * the new list and the idea's `commentCount` in one go (and stays right when the server caps
 * the list). Votes rely on the normalized `IdeaComment:<id>` the mutation result updates.
 */
export function CommentList({ ideaId, comments, commentCount, access, sessionLoading, viewerId, isAdmin = false }: CommentListProps) {
  const [body, setBody] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [itemError, setItemError] = useState<string | null>(null)

  // `loading` only updates after a render, so a fast double click could slip a second request
  // through; the ref closes that gap.
  const sendingRef = useRef(false)
  const [createComment, { loading }] = useMutation(CREATE_COMMENT, {
    refetchQueries: [GET_IDEA],
  })

  const canSubmit = canSubmitComment(body) && !loading

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (sendingRef.current || !canSubmit || access !== 'READY') return
    sendingRef.current = true
    setFormError(null)
    try {
      await createComment({ variables: { ideaId, body: body.trim() } })
      setBody('')
    } catch (err) {
      // Keep the typed text so the person can fix it (remove a link, change the wording).
      setFormError(errorText(err))
    } finally {
      sendingRef.current = false
    }
  }

  return (
    <section aria-labelledby="comments-heading" className="mt-8">
      <h2 id="comments-heading" className="mb-4 text-2xl font-graffiti text-foreground">
        Comments ({commentCount})
      </h2>

      {isCommentListTruncated(commentCount, comments.length) && (
        <p className="mb-4 text-base text-muted-foreground">
          Only the first {comments.length} comments are shown.
        </p>
      )}

      {itemError && (
        <p role="alert" className="mb-4 text-base text-destructive">
          {itemError}
        </p>
      )}

      {comments.length === 0 ? (
        <p className="mb-6 text-base text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="mb-6 flex flex-col gap-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              access={access}
              sessionLoading={sessionLoading}
              isOwn={!!viewerId && viewerId === comment.author.id}
              isAdmin={isAdmin}
              onError={setItemError}
            />
          ))}
        </ul>
      )}

      {sessionLoading ? null : access === 'READY' ? (
        <form onSubmit={handleSubmit} className="space-y-2" aria-busy={loading}>
          <label htmlFor="comment-body" className={labelClass}>
            Add a comment
          </label>
          <textarea
            id="comment-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={BOARD_LIMITS.commentBody}
            rows={4}
            aria-describedby="comment-body-hint"
            placeholder="Links are not allowed"
            disabled={loading}
            className={fieldClass}
          />
          <p id="comment-body-hint" className="text-base text-muted-foreground">
            {remainingChars(body, BOARD_LIMITS.commentBody)} characters left
          </p>
          {formError && (
            <p role="alert" className="text-base font-medium text-destructive">
              {formError}
            </p>
          )}
          <div className="flex sm:justify-end">
            <Button type="submit" disabled={!canSubmit} className="w-full sm:w-auto">
              {loading ? 'Posting…' : 'Post comment'}
            </Button>
          </div>
        </form>
      ) : (
        <Button asChild>
          <Link href={access === 'ANONYMOUS' ? '/auth/signin' : '/onboarding'}>
            {access === 'ANONYMOUS' ? 'Sign in to comment' : 'Choose a username to comment'}
          </Link>
        </Button>
      )}
    </section>
  )
}
