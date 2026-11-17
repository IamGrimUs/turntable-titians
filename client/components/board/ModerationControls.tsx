'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useApolloClient, useMutation, type ApolloCache } from '@apollo/client'
import { Button } from '@/components/ui/button'
import { Modal, ModalError, ModalFooter } from '@/components/admin/Modal'
import { useDialogSubmit } from '@/components/admin/useDialogSubmit'
import { adminErrorMessage, shouldRefreshAfterFailure } from '@/lib/admin-user-dialogs'
import { IDEA_STATUSES, statusLabel, type IdeaStatus } from '@/lib/board-view'
import { fieldClass, labelClass } from '@/lib/form-styles'
import {
  ADMIN_DELETE_COMMENT,
  ADMIN_DELETE_IDEA,
  ADMIN_HIDE_COMMENT,
  ADMIN_HIDE_IDEA,
  ADMIN_SET_IDEA_STATUS,
  ADMIN_UNHIDE_COMMENT,
  ADMIN_UNHIDE_IDEA,
  GET_IDEA,
} from '@/lib/graphql/board'

/**
 * Admin moderation of one idea or one comment. The caller renders this ONLY for an admin
 * (`isAdminRole(session?.user?.role)`); that is a display hint, the server checks the role and any
 * suspension on every mutation and its message is shown here when it refuses.
 *
 * Dialogs: delete is permanent, so it opens the admin `Modal` (the same confirm flow the admin user
 * dialogs use, `useDialogSubmit`: one request at a time, the server's message kept in the dialog).
 * Hide is one click and undone with Unhide, so it has no dialog. Status is a select that saves on change.
 *
 * No double send: every action goes through one runner with a ref set synchronously, and the
 * controls are disabled while it runs.
 *
 * Cache, per action:
 * - set status / hide / unhide idea: the mutation result (`id status` / `id hidden`) updates the
 *   normalized `Idea:<id>`, so the badge and the Hidden marker change at once. The root `ideas`
 *   field is also evicted, so the list (whose filters, the Show hidden toggle and page counts depend
 *   on this) fetches fresh the next time it is shown.
 * - delete idea: evicts the root `ideas` field (as the author's delete does), then goes to /board.
 * - hide / unhide / delete comment: refetches `GET_IDEA` (awaited), because hiding or deleting
 *   changes the idea's `commentCount` as well as the list.
 * - after a failure that may have changed something (anything but BAD_USER_INPUT or RATE_LIMITED,
 *   as `UsersView` does) the active queries are refetched, so a stale row catches up.
 */

type IdeaProps = { kind: 'idea'; id: string; status: IdeaStatus; hidden: boolean }
type CommentProps = { kind: 'comment'; id: string; hidden: boolean }
export type ModerationControlsProps = IdeaProps | CommentProps

const ACTION_BUTTON = 'min-h-11 w-full sm:w-auto'

function evictIdeas(cache: ApolloCache<unknown>) {
  cache.evict({ fieldName: 'ideas' })
}

/** One action at a time: a synchronous ref guard, a pending flag, and the failure message. */
function useModerationRunner() {
  const client = useApolloClient()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runningRef = useRef(false)

  const refreshActive = useCallback(() => {
    // A failed reload shows in the page's own error state; it must not be an unhandled rejection here.
    Promise.resolve(client.refetchQueries({ include: 'active' })).catch(() => {})
  }, [client])

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      if (runningRef.current) return
      runningRef.current = true
      setPending(true)
      setError(null)
      try {
        await action()
      } catch (e) {
        setError(adminErrorMessage(e))
        if (shouldRefreshAfterFailure(e)) refreshActive()
      } finally {
        runningRef.current = false
        setPending(false)
      }
    },
    [refreshActive],
  )

  return { pending, error, run, refreshActive }
}

/** The permanent-delete confirmation. It stays "submitting" after success, so it can not be sent twice while it closes. */
function DeleteDialog({
  title,
  description,
  onClose,
  onDelete,
  onDone,
  onFailure,
}: {
  title: string
  description: ReactNode
  onClose: () => void
  onDelete: () => Promise<void>
  onDone: () => void
  onFailure: (error: unknown) => void
}) {
  const { submitting, error, submit } = useDialogSubmit(onDone, onFailure)
  return (
    <Modal title={title} description={description} onClose={onClose} busy={submitting}>
      <ModalError message={error} />
      <ModalFooter>
        <Button type="button" variant="outline" data-autofocus disabled={submitting} onClick={onClose} className="min-h-11">
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={submitting}
          onClick={() => void submit(async () => {
            await onDelete()
            return 'Deleted.'
          })}
          className="min-h-11"
        >
          {submitting ? 'Deleting...' : 'Delete permanently'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function ActionError({ message }: { message: string | null }) {
  // Always rendered, so a screen reader announces it when it fills.
  return (
    <div role="alert" className={message ? 'mt-3' : undefined}>
      {message && <p className="text-base font-medium text-destructive">{message}</p>}
    </div>
  )
}

function IdeaModeration({ id, status, hidden }: Omit<IdeaProps, 'kind'>) {
  const router = useRouter()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const { pending, error, run, refreshActive } = useModerationRunner()

  const [setStatus] = useMutation(ADMIN_SET_IDEA_STATUS, { update: evictIdeas })
  const [hideIdea] = useMutation(ADMIN_HIDE_IDEA, { update: evictIdeas })
  const [unhideIdea] = useMutation(ADMIN_UNHIDE_IDEA, { update: evictIdeas })
  const [deleteIdea] = useMutation(ADMIN_DELETE_IDEA, { update: evictIdeas })

  const selectId = `idea-status-${id}`

  return (
    <div role="group" aria-label="Moderation" className="rounded-lg border border-dashed border-border p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 sm:w-56">
          <label htmlFor={selectId} className={labelClass}>
            Status
          </label>
          <select
            id={selectId}
            value={status}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.value as IdeaStatus
              if (next === status) return
              void run(() => setStatus({ variables: { id, status: next } }))
            }}
            className={`${fieldClass} mt-1`}
          >
            {IDEA_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => void run(() => (hidden ? unhideIdea : hideIdea)({ variables: { id } }))}
          className={ACTION_BUTTON}
        >
          {hidden ? 'Unhide idea' : 'Hide idea'}
        </Button>
        <Button type="button" variant="destructive" disabled={pending} onClick={() => setConfirmingDelete(true)} className={ACTION_BUTTON}>
          Delete idea
        </Button>
      </div>
      <ActionError message={error} />

      {confirmingDelete && (
        <DeleteDialog
          title="Delete this idea?"
          description="This permanently deletes the idea together with its comments and votes. This can't be undone."
          onClose={() => setConfirmingDelete(false)}
          onDelete={async () => {
            await deleteIdea({ variables: { id } })
          }}
          onDone={() => router.push('/board')}
          onFailure={(e) => {
            if (shouldRefreshAfterFailure(e)) refreshActive()
          }}
        />
      )}
    </div>
  )
}

function CommentModeration({ id, hidden }: Omit<CommentProps, 'kind'>) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const { pending, error, run, refreshActive } = useModerationRunner()

  // Hiding or deleting changes the idea's visible `commentCount`, so the detail query is refetched.
  const refetch = { refetchQueries: [GET_IDEA], awaitRefetchQueries: true }
  const [hideComment] = useMutation(ADMIN_HIDE_COMMENT, refetch)
  const [unhideComment] = useMutation(ADMIN_UNHIDE_COMMENT, refetch)
  const [deleteComment] = useMutation(ADMIN_DELETE_COMMENT, refetch)

  return (
    <div role="group" aria-label="Moderation" className="mt-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => void run(() => (hidden ? unhideComment : hideComment)({ variables: { id } }))}
          className={ACTION_BUTTON}
        >
          {hidden ? 'Unhide comment' : 'Hide comment'}
        </Button>
        <Button type="button" variant="destructive" disabled={pending} onClick={() => setConfirmingDelete(true)} className={ACTION_BUTTON}>
          Delete comment
        </Button>
      </div>
      <ActionError message={error} />

      {confirmingDelete && (
        <DeleteDialog
          title="Delete this comment?"
          description="This permanently deletes the comment and its votes. This can't be undone."
          onClose={() => setConfirmingDelete(false)}
          onDelete={async () => {
            await deleteComment({ variables: { id } })
          }}
          onDone={() => setConfirmingDelete(false)}
          onFailure={(e) => {
            if (shouldRefreshAfterFailure(e)) refreshActive()
          }}
        />
      )}
    </div>
  )
}

export function ModerationControls(props: ModerationControlsProps) {
  return props.kind === 'idea' ? (
    <IdeaModeration id={props.id} status={props.status} hidden={props.hidden} />
  ) : (
    <CommentModeration id={props.id} hidden={props.hidden} />
  )
}
