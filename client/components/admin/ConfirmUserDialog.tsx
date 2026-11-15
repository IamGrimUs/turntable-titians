'use client'

import type { FormEvent } from 'react'
import { useMutation } from '@apollo/client'
import { Button } from '@/components/ui/button'
import { Modal, ModalError, ModalFooter } from '@/components/admin/Modal'
import { useDialogSubmit } from '@/components/admin/useDialogSubmit'
import { ADMIN_REINSTATE_USER, ADMIN_SET_USER_ROLE } from '@/lib/graphql/admin'
import type { AdminUserRow } from '@/lib/admin-users-view'
import { userLabel } from '@/lib/admin-user-dialogs'

export type ConfirmAction = 'reinstate' | 'makeAdmin' | 'removeAdmin'

export interface ConfirmUserDialogProps {
  action: ConfirmAction
  row: AdminUserRow
  onClose: () => void
  onSuccess: (message: string) => void
  /** Told about a failed action (the page reloads the table when the row may be stale). */
  onFailure?: (error: unknown) => void
}

export function ConfirmUserDialog({ action, row, onClose, onSuccess, onFailure }: ConfirmUserDialogProps) {
  const [reinstateUser] = useMutation(ADMIN_REINSTATE_USER)
  const [setRole] = useMutation(ADMIN_SET_USER_ROLE)
  const { submitting, error, submit } = useDialogSubmit(onSuccess, onFailure)

  const label = userLabel(row)

  const copy = {
    reinstate: {
      title: `Reinstate ${label}`,
      body: `${label} will be able to sign in and use the site again. Their suspension reason and end date are cleared.`,
      button: 'Reinstate',
      busy: 'Reinstating...',
      done: `Reinstated ${label}.`,
    },
    makeAdmin: {
      title: `Make ${label} an admin`,
      body: `${label} will be able to open the admin area and edit, suspend, reinstate and delete regular users. They can't change anyone's role and can't act on other admins or the owner.`,
      button: 'Make admin',
      busy: 'Saving...',
      done: `${label} is now an admin.`,
    },
    removeAdmin: {
      title: `Remove admin from ${label}`,
      body: `${label} goes back to being a regular user and loses access to the admin area.`,
      button: 'Remove admin',
      busy: 'Saving...',
      done: `${label} is no longer an admin.`,
    },
  }[action]

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    void submit(async () => {
      if (action === 'reinstate') {
        await reinstateUser({ variables: { userId: row.id } })
      } else {
        await setRole({ variables: { userId: row.id, role: action === 'makeAdmin' ? 'ADMIN' : 'USER' } })
      }
      return copy.done
    })
  }

  return (
    <Modal title={copy.title} onClose={onClose} busy={submitting} description={copy.body}>
      <form onSubmit={onSubmit}>
        <ModalError message={error} />
        <ModalFooter>
          {/* The safest button gets the initial focus. */}
          <Button type="button" variant="outline" data-autofocus disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? copy.busy : copy.button}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
