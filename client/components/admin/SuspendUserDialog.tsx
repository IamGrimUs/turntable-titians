'use client'

import { useState, type FormEvent } from 'react'
import { useMutation } from '@apollo/client'
import { Button } from '@/components/ui/button'
import { Modal, ModalError, ModalFooter } from '@/components/admin/Modal'
import { useDialogSubmit } from '@/components/admin/useDialogSubmit'
import { fieldClass, labelClass } from '@/lib/form-styles'
import { ADMIN_SUSPEND_USER } from '@/lib/graphql/admin'
import type { AdminUserRow } from '@/lib/admin-users-view'
import {
  DIALOG_LIMITS,
  flattenReason,
  formatLocalDateTime,
  suspendErrorField,
  suspendUntilToIso,
  toDateTimeLocalValue,
  userLabel,
  validateSuspendReason,
} from '@/lib/admin-user-dialogs'

export interface SuspendUserDialogProps {
  row: AdminUserRow
  onClose: () => void
  onSuccess: (message: string) => void
  /** Told about a failed action (the page reloads the table when the row may be stale). */
  onFailure?: (error: unknown) => void
}

export function SuspendUserDialog({ row, onClose, onSuccess, onFailure }: SuspendUserDialogProps) {
  const [reason, setReason] = useState('')
  const [untilValue, setUntilValue] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const [suspendUser] = useMutation(ADMIN_SUSPEND_USER)
  const { submitting, error, setError, submit } = useDialogSubmit(onSuccess, onFailure)

  const label = userLabel(row)
  const parsedUntil = suspendUntilToIso(untilValue)
  // One message at a time: our own form check, else the server's. The field it is about is marked invalid.
  const message = formError ?? error
  const errorField = suspendErrorField(message)
  const untilText = parsedUntil.ok && parsedUntil.until ? formatLocalDateTime(parsedUntil.until) : null

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const reasonError = validateSuspendReason(reason)
    if (reasonError) return setFormError(reasonError)
    const until = suspendUntilToIso(untilValue)
    if (!until.ok) return setFormError(until.error)
    setFormError(null)

    void submit(async () => {
      await suspendUser({ variables: { userId: row.id, reason: reason.trim(), until: until.until } })
      return until.until
        ? `Suspended ${label} until ${formatLocalDateTime(until.until)}.`
        : `Suspended ${label} until they are reinstated.`
    })
  }

  return (
    <Modal
      title={`Suspend ${label}`}
      onClose={onClose}
      busy={submitting}
      description="A suspended account is signed out and can't sign in or use the site."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="space-y-2">
          <label className={labelClass} htmlFor="suspend-reason">
            Reason
          </label>
          <textarea
            id="suspend-reason"
            data-autofocus
            required
            rows={3}
            value={reason}
            maxLength={DIALOG_LIMITS.suspensionReason}
            disabled={submitting}
            aria-invalid={errorField === 'reason'}
            aria-describedby={`${errorField === 'reason' ? 'suspend-error ' : ''}suspend-reason-help suspend-reason-warning`}
            onChange={(e) => {
              setReason(flattenReason(e.target.value))
              setFormError(null)
              setError(null)
            }}
            onKeyDown={(e) => {
              // One line only: the server refuses line breaks.
              if (e.key === 'Enter') e.preventDefault()
            }}
            className={`${fieldClass} resize-none`}
          />
          <div className="flex items-start justify-between gap-3 text-base text-muted-foreground">
            <p id="suspend-reason-help">This reason will be shown to the user.</p>
            <p className="shrink-0 tabular-nums">
              <span aria-hidden="true">
                {reason.length}/{DIALOG_LIMITS.suspensionReason}
              </span>
              <span className="sr-only">
                {reason.length} of {DIALOG_LIMITS.suspensionReason} characters used
              </span>
            </p>
          </div>
          <p
            id="suspend-reason-warning"
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-base text-amber-300"
          >
            The reason is also visible to anyone who enters this account&apos;s email address on the sign-in page, so
            don&apos;t include anything private or sensitive.
          </p>
        </div>

        <div className="space-y-2">
          <label className={labelClass} htmlFor="suspend-until">
            Suspend until (optional)
          </label>
          <input
            id="suspend-until"
            type="datetime-local"
            value={untilValue}
            min={toDateTimeLocalValue(new Date())}
            disabled={submitting}
            aria-invalid={errorField === 'until'}
            aria-describedby={`${errorField === 'until' ? 'suspend-error ' : ''}suspend-until-help`}
            onChange={(e) => {
              setUntilValue(e.target.value)
              setFormError(null)
              setError(null)
            }}
            className={fieldClass}
          />
          <p id="suspend-until-help" className="text-base text-muted-foreground">
            {untilText
              ? `The suspension ends on ${untilText} (your local time).`
              : 'Leave blank to suspend until you reinstate them. Times are in your local time.'}
          </p>
        </div>

        <ModalError id="suspend-error" message={message} />

        <ModalFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={submitting}>
            {submitting ? 'Suspending...' : 'Suspend'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
