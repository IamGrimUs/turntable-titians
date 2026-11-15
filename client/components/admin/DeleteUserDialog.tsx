'use client'

import { useState, type FormEvent } from 'react'
import { useMutation } from '@apollo/client'
import { Button } from '@/components/ui/button'
import { Modal, ModalError, ModalFooter, fieldClass, labelClass } from '@/components/admin/Modal'
import { useDialogSubmit } from '@/components/admin/useDialogSubmit'
import { ADMIN_DELETE_USER } from '@/lib/graphql/admin'
import type { AdminUserRow } from '@/lib/admin-users-view'
import { deleteConfirmMatches, deleteConfirmTarget, userLabel } from '@/lib/admin-user-dialogs'

export interface DeleteUserDialogProps {
  row: AdminUserRow
  onClose: () => void
  onSuccess: (message: string) => void
}

export function DeleteUserDialog({ row, onClose, onSuccess }: DeleteUserDialogProps) {
  const [typed, setTyped] = useState('')
  const [blockEmail, setBlockEmail] = useState(false)

  const [deleteUser] = useMutation(ADMIN_DELETE_USER)
  const { submitting, error, submit } = useDialogSubmit(onSuccess)

  const label = userLabel(row)
  const target = deleteConfirmTarget(row)
  const confirmed = deleteConfirmMatches(typed, row)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!confirmed || submitting) return
    void submit(async () => {
      await deleteUser({ variables: { userId: row.id, blockEmail } })
      return blockEmail
        ? `Deleted ${label} and blocked their email from signing up again.`
        : `Deleted ${label}.`
    })
  }

  return (
    <Modal
      title={`Delete ${label}`}
      onClose={onClose}
      busy={submitting}
      description="This permanently deletes the account and also removes their entries and the votes they cast or received. This can't be undone."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <label className="flex items-start gap-3 text-base">
          <input
            type="checkbox"
            checked={blockEmail}
            disabled={submitting}
            onChange={(e) => setBlockEmail(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-amber-500"
          />
          <span>
            Also block this email from signing up again
            <span className="block break-all text-muted-foreground">{row.email}</span>
          </span>
        </label>

        <div className="space-y-2">
          <label className={labelClass} htmlFor="delete-confirm">
            Type {row.username !== null ? 'the username' : 'the email'} to confirm
          </label>
          <p className="break-all text-base font-semibold text-foreground">{target}</p>
          <input
            id="delete-confirm"
            type="text"
            data-autofocus
            value={typed}
            disabled={submitting}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setTyped(e.target.value)}
            className={fieldClass}
          />
        </div>

        <ModalError message={error} />

        <ModalFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={!confirmed || submitting}>
            {submitting ? 'Deleting...' : 'Delete permanently'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
