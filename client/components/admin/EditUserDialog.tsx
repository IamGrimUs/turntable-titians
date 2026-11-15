'use client'

import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@apollo/client'
import { Button } from '@/components/ui/button'
import { Modal, ModalError, ModalFooter, fieldClass, labelClass } from '@/components/admin/Modal'
import { useDialogSubmit } from '@/components/admin/useDialogSubmit'
import { ADMIN_UPDATE_USER, USER_EXTERNAL_CREWS_QUERY } from '@/lib/graphql/admin'
import type { AdminUserRow } from '@/lib/admin-users-view'
import {
  DIALOG_LIMITS,
  addCrew,
  buildUpdateInput,
  internalCrewNames,
  userLabel,
} from '@/lib/admin-user-dialogs'

export interface EditUserDialogProps {
  row: AdminUserRow
  onClose: () => void
  onSuccess: (message: string) => void
}

export function EditUserDialog({ row, onClose, onSuccess }: EditUserDialogProps) {
  const [username, setUsername] = useState(row.username ?? '')
  const [name, setName] = useState(row.name ?? '')
  const [removeAvatar, setRemoveAvatar] = useState(false)
  // null until the admin touches the list: until then the loaded list is shown as it is.
  const [editedCrews, setEditedCrews] = useState<string[] | null>(null)
  const [crewInput, setCrewInput] = useState('')

  const [updateUser] = useMutation(ADMIN_UPDATE_USER)
  const { submitting, error, submit } = useDialogSubmit(onSuccess)

  // The user's own crew list. network-only: never edit against a stale copy.
  const crewsQuery = useQuery<{ user: { externalCrews: string[] } | null }>(USER_EXTERNAL_CREWS_QUERY, {
    variables: { id: row.id },
    fetchPolicy: 'network-only',
  })
  const loadedCrews = crewsQuery.data?.user?.externalCrews ?? null
  const crewsFailed = !crewsQuery.loading && loadedCrews === null
  const crews = editedCrews ?? loadedCrews ?? []

  // Text typed in the crew box but not added yet still counts when saving.
  const pendingCrew = addCrew(crews, crewInput)
  const crewError = crewInput.trim() !== '' && !pendingCrew.ok ? pendingCrew.error : null
  const finalCrews = pendingCrew.ok ? pendingCrew.crews : crews

  const input = buildUpdateInput(row, loadedCrews, { username, name, crews: finalCrews, removeAvatar })
  const others = internalCrewNames(row.crews, loadedCrews ?? [])

  const onAddCrew = () => {
    if (pendingCrew.ok) {
      setEditedCrews(pendingCrew.crews)
      setCrewInput('')
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!input || crewError || submitting) return
    void submit(async () => {
      await updateUser({ variables: { userId: row.id, ...input } })
      return `Saved changes to ${userLabel({ username: input.username ?? row.username, email: row.email })}.`
    })
  }

  return (
    <Modal title={`Edit ${userLabel(row)}`} onClose={onClose} busy={submitting}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="space-y-1">
          <p className={labelClass}>Email</p>
          <p className="break-all text-base text-foreground">{row.email}</p>
          <p className="text-base text-muted-foreground">The email can&apos;t be changed.</p>
        </div>

        <div className="space-y-2">
          <label className={labelClass} htmlFor="edit-username">
            Username
          </label>
          <input
            id="edit-username"
            type="text"
            data-autofocus
            value={username}
            maxLength={DIALOG_LIMITS.username}
            autoComplete="off"
            disabled={submitting}
            placeholder={row.username ? undefined : 'No username yet'}
            onChange={(e) => setUsername(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="space-y-2">
          <label className={labelClass} htmlFor="edit-name">
            Display name
          </label>
          <input
            id="edit-name"
            type="text"
            value={name}
            maxLength={DIALOG_LIMITS.displayName}
            autoComplete="off"
            disabled={submitting}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
          />
          <p className="text-base text-muted-foreground">Leave it empty to clear the display name.</p>
        </div>

        <div className="space-y-2">
          <label className={labelClass} htmlFor="edit-crew">
            DJ crews (external)
          </label>
          {crewsQuery.loading ? (
            <p className="text-base text-muted-foreground">Loading crews...</p>
          ) : crewsFailed ? (
            <p className="text-base text-red-400">
              We couldn&apos;t load this user&apos;s crews, so they can&apos;t be edited right now. Close and reopen to try again.
            </p>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  id="edit-crew"
                  type="text"
                  value={crewInput}
                  maxLength={DIALOG_LIMITS.crewName}
                  autoComplete="off"
                  disabled={submitting}
                  placeholder="e.g. The Allies"
                  onChange={(e) => setCrewInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onAddCrew()
                    }
                  }}
                  className={`${fieldClass} flex-1`}
                />
                <Button type="button" variant="outline" className="h-auto" disabled={submitting} onClick={onAddCrew}>
                  Add
                </Button>
              </div>
              {crewError && <p className="text-base text-red-400">{crewError}</p>}
              {crews.length > 0 ? (
                <ul className="flex flex-wrap gap-2 pt-1">
                  {crews.map((crew) => (
                    <li
                      key={crew}
                      className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-base font-semibold text-amber-500"
                    >
                      {crew}
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => setEditedCrews(crews.filter((c) => c !== crew))}
                        className="rounded-sm hover:text-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                        aria-label={`Remove ${crew}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-base text-muted-foreground">No crews.</p>
              )}
              <p className="text-base text-muted-foreground">
                Up to {DIALOG_LIMITS.maxCrews} crews, {DIALOG_LIMITS.crewName} characters each.
                {others.length > 0 && ` Also in app crews (not edited here): ${others.join(', ')}.`}
              </p>
            </>
          )}
        </div>

        <div className="space-y-2">
          <p className={labelClass}>Avatar</p>
          {row.image ? (
            <label className="flex items-center gap-3 text-base">
              <input
                type="checkbox"
                checked={removeAvatar}
                disabled={submitting}
                onChange={(e) => setRemoveAvatar(e.target.checked)}
                className="h-5 w-5 accent-amber-500"
              />
              <img src={row.image} alt="" className="h-10 w-10 rounded-full border border-border object-cover" />
              Remove avatar
            </label>
          ) : (
            <p className="text-base text-muted-foreground">No avatar set.</p>
          )}
        </div>

        <ModalError message={error} />

        <ModalFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !input || crewError !== null}>
            {submitting ? 'Saving...' : 'Save changes'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
