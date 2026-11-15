'use client'

import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@apollo/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { UsersTable } from '@/components/admin/UsersTable'
import { EditUserDialog } from '@/components/admin/EditUserDialog'
import { SuspendUserDialog } from '@/components/admin/SuspendUserDialog'
import { DeleteUserDialog } from '@/components/admin/DeleteUserDialog'
import { ConfirmUserDialog } from '@/components/admin/ConfirmUserDialog'
import type { Role } from '@/lib/admin-access'
import { shouldRefreshAfterFailure } from '@/lib/admin-user-dialogs'
import { ADMIN_USERS_QUERY } from '@/lib/graphql/admin'
import {
  DEFAULT_SORT,
  nextSort,
  type AdminUserRow,
  type RowAction,
  type SortState,
  type UserSortKey,
} from '@/lib/admin-users-view'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25
const SEARCH_DEBOUNCE_MS = 300
const NOTICE_MS = 5000

type Filter = 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'ADMINS'

interface AdminUsersData {
  adminUsers: {
    rows: AdminUserRow[]
    total: number
    page: number
    pageCount: number
    counts: { all: number; active: number; suspended: number; admins: number }
  }
}

const FILTERS: { value: Filter; label: string; count: keyof AdminUsersData['adminUsers']['counts'] }[] = [
  { value: 'ALL', label: 'All', count: 'all' },
  { value: 'ACTIVE', label: 'Active', count: 'active' },
  { value: 'SUSPENDED', label: 'Suspended', count: 'suspended' },
  { value: 'ADMINS', label: 'Admins', count: 'admins' },
]

const CHIP_BASE =
  'rounded-full border px-3 py-0.5 text-base font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60'
const CHIP_OFF = 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
const CHIP_ON = 'border-foreground/60 bg-foreground/10 text-foreground'

const SEARCH_CLASS =
  'h-10 w-full max-w-[260px] rounded-md border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors'

function hasAccessError(error: { graphQLErrors?: readonly { extensions?: Record<string, unknown> }[] }): boolean {
  return (error.graphQLErrors ?? []).some(
    (e) => e.extensions?.code === 'FORBIDDEN' || e.extensions?.code === 'UNAUTHENTICATED'
  )
}

// `viewerRole` comes from the server page, read from the database (not the session hint). It only
// decides which action buttons to draw; the API re-checks the real role on every request.
export function UsersView({ viewerRole }: { viewerRole: Role }) {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  // The row action the admin picked; the confirm and edit dialogs act on this.
  const [pendingAction, setPendingAction] = useState<{ action: RowAction; row: AdminUserRow } | null>(null)

  // A short "it worked" line at the top of the page, gone after a few seconds.
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data, previousData, loading, error, refetch } = useQuery<AdminUsersData>(ADMIN_USERS_QUERY, {
    variables: {
      search: search || null,
      filter,
      sortKey: sort.key,
      sortDir: sort.dir,
      page,
      pageSize: PAGE_SIZE,
    },
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  })

  const closeDialog = useCallback(() => setPendingAction(null), [])
  const onActionDone = useCallback(
    (message: string) => {
      setPendingAction(null)
      setNotice(message)
      // Same query variables: the table shows the change (and a deleted user is gone).
      void refetch()
    },
    [refetch]
  )

  // A dialog's action failed. When the row may be stale (already deleted or changed by someone
  // else, or a delete whose answer was lost) reload the table; the dialog stays open with its message.
  const pendingKind = pendingAction?.action
  const onActionFailed = useCallback(
    (failure: unknown) => {
      if (shouldRefreshAfterFailure(failure, pendingKind === 'delete')) void refetch()
    },
    [pendingKind, refetch]
  )

  // A different action or row mounts a fresh dialog: fresh form state and a fresh showModal().
  const dialogKey = pendingAction ? `${pendingAction.action}:${pendingAction.row.id}` : undefined

  // The server clamps an out-of-range page; the pager below follows the page it returns.
  const shown = (data ?? previousData)?.adminUsers
  const noAccess = error ? hasAccessError(error) : false

  const onSort = (key: UserSortKey) => {
    setSort((current) => nextSort(current, key))
    setPage(1)
  }

  const onFilter = (value: Filter) => {
    setFilter(value)
    setPage(1)
  }

  if (noAccess) {
    return (
      <div className="p-8">
        <h1 className="font-graffiti text-4xl">Users</h1>
        <Card className="mt-6 max-w-xl">
          <CardContent className="p-6">
            <p className="text-lg font-medium">You don&apos;t have access</p>
            <p className="mt-1 text-base text-muted-foreground">
              This area is for admins. If you should have access, sign out and back in.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const pageNumber = shown?.page ?? page
  const pageCount = Math.max(1, shown?.pageCount ?? 1)
  const firstShown = shown && shown.rows.length > 0 ? (pageNumber - 1) * PAGE_SIZE + 1 : 0
  const lastShown = shown ? firstShown + shown.rows.length - (shown.rows.length > 0 ? 1 : 0) : 0

  return (
    <div className="flex min-w-0 flex-col gap-4 py-7 pl-4 md:pl-8">
      <div className="pr-4 md:pr-8">
        <h1 className="font-graffiti text-4xl md:text-5xl">Users</h1>
        <p className="mt-1 text-base text-muted-foreground">Edit, suspend or remove accounts.</p>
      </div>

      <div role="status" className="pr-4 md:pr-8">
        {notice && (
          <p className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-2 text-base font-medium text-green-400">
            {notice}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pr-4 md:pr-8">
        <input
          type="search"
          aria-label="Search users"
          placeholder="Search name or email"
          value={searchInput}
          maxLength={100}
          onChange={(e) => setSearchInput(e.target.value)}
          className={SEARCH_CLASS}
        />
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => onFilter(f.value)}
            className={cn(CHIP_BASE, filter === f.value ? CHIP_ON : CHIP_OFF)}
          >
            {f.label}
            {shown ? ` · ${shown.counts[f.count]}` : ''}
          </button>
        ))}
      </div>

      {error && !shown ? (
        <div className="pr-4 md:pr-8">
          <Card className="max-w-xl">
            <CardContent className="p-6">
              <p className="text-base text-destructive">
                We couldn&apos;t load the users right now. Please try again in a moment.
              </p>
              <Button type="button" variant="outline" className="mt-4" onClick={() => void refetch()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : !shown ? (
        <p className="text-base text-muted-foreground">Loading users...</p>
      ) : (
        <>
          {error && (
            <p className="pr-4 text-base text-destructive md:pr-8" role="alert">
              We couldn&apos;t refresh the list. Showing the last results.
            </p>
          )}
          <div className={cn('pr-4 transition-opacity md:pr-8', loading && 'opacity-60')} aria-busy={loading}>
            {shown.rows.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-base text-muted-foreground">No users match.</p>
                </CardContent>
              </Card>
            ) : (
              <UsersTable
                viewerRole={viewerRole}
                rows={shown.rows}
                sort={sort}
                onSort={onSort}
                onAction={(action, row) => setPendingAction({ action, row })}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pr-4 text-base text-muted-foreground md:pr-8">
            <span>
              {shown.total === 0
                ? 'Showing 0 users'
                : `Showing ${firstShown}-${lastShown} of ${shown.total} users`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageNumber <= 1 || loading}
                onClick={() => setPage(Math.max(1, pageNumber - 1))}
              >
                Previous
              </Button>
              <span aria-live="polite">
                Page {pageNumber} of {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageNumber >= pageCount || loading}
                onClick={() => setPage(Math.min(pageCount, pageNumber + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {pendingAction?.action === 'edit' && (
        <EditUserDialog
          key={dialogKey}
          row={pendingAction.row}
          onClose={closeDialog}
          onSuccess={onActionDone}
          onFailure={onActionFailed}
        />
      )}
      {pendingAction?.action === 'suspend' && (
        <SuspendUserDialog
          key={dialogKey}
          row={pendingAction.row}
          onClose={closeDialog}
          onSuccess={onActionDone}
          onFailure={onActionFailed}
        />
      )}
      {pendingAction?.action === 'delete' && (
        <DeleteUserDialog
          key={dialogKey}
          row={pendingAction.row}
          onClose={closeDialog}
          onSuccess={onActionDone}
          onFailure={onActionFailed}
        />
      )}
      {(pendingAction?.action === 'reinstate' ||
        pendingAction?.action === 'makeAdmin' ||
        pendingAction?.action === 'removeAdmin') && (
        <ConfirmUserDialog
          key={dialogKey}
          action={pendingAction.action}
          row={pendingAction.row}
          onClose={closeDialog}
          onSuccess={onActionDone}
          onFailure={onActionFailed}
        />
      )}
    </div>
  )
}
