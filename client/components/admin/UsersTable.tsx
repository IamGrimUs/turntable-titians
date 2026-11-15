'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Role } from '@/lib/admin-access'
import { formatLocalDateTime } from '@/lib/admin-user-dialogs'
import {
  crewsCell,
  formatJoined,
  formatLastSignIn,
  rowActions,
  rowNote,
  type AdminUserRow,
  type RowAction,
  type SortState,
  type UserSortKey,
} from '@/lib/admin-users-view'
import { cn } from '@/lib/utils'

interface Column {
  key: UserSortKey | null // null: not sortable (Actions)
  label: string
  width: number
}

// Order and labels are fixed by the design. "Votes (in)" = votes the user cast,
// "Votes (out)" = votes their entries received.
const COLUMNS: Column[] = [
  { key: 'username', label: 'Username', width: 220 },
  { key: 'role', label: 'Role', width: 120 },
  { key: 'crews', label: 'Crews', width: 190 },
  { key: 'status', label: 'Status', width: 140 },
  { key: 'entries', label: 'Entries', width: 110 },
  { key: 'battlesWon', label: 'Battles won', width: 150 },
  { key: 'votesCast', label: 'Votes (in)', width: 140 },
  { key: 'votesReceived', label: 'Votes (out)', width: 150 },
  { key: 'createdAt', label: 'Joined', width: 140 },
  { key: 'lastSignInAt', label: 'Last sign-in', width: 160 },
  { key: 'email', label: 'Email', width: 250 },
  { key: null, label: 'Actions', width: 436 },
]

// Only an OWNER sees the fourth button (Make admin / Remove admin), so the Actions
// column is narrower for everyone else. Widths are the measured worst case (Edit +
// Reinstate + Delete + Remove admin: ~384px; without the fourth button: ~240px) plus the
// cell padding (12px left, 16px right) and ~16px of slack for font-rendering differences.
const ADMIN_ACTIONS_WIDTH = 320


const ACTION_LABELS: Record<RowAction, string> = {
  edit: 'Edit',
  suspend: 'Suspend',
  reinstate: 'Reinstate',
  delete: 'Delete',
  makeAdmin: 'Make admin',
  removeAdmin: 'Remove admin',
}

const DANGER_ACTIONS: RowAction[] = ['suspend', 'delete']

const ROLE_BADGE: Record<Role, { variant: 'default' | 'upcoming' | 'completed'; label: string }> = {
  OWNER: { variant: 'default', label: 'OWNER' },
  ADMIN: { variant: 'upcoming', label: 'ADMIN' }, // amber
  USER: { variant: 'completed', label: 'USER' }, // slate
}

// Username (left) and Actions (right) are pinned from the xl breakpoint up. On narrower
// screens the pinned columns would cover too much of the width, so everything scrolls
// together there. Sticky cells need an opaque background so scrolling content does not
// show through.
const stickyLeft = 'xl:sticky xl:left-0 xl:z-10 bg-card xl:shadow-[8px_0_8px_-8px_rgba(0,0,0,0.6)]'
const stickyRight = 'xl:sticky xl:right-0 xl:z-10 bg-card xl:shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.6)]'

function SortHeader({
  column,
  sort,
  onSort,
  className,
}: {
  column: Column
  sort: SortState
  onSort: (key: UserSortKey) => void
  className?: string
}) {
  const base =
    'h-12 border-b border-border bg-muted px-3 text-left text-base font-semibold uppercase tracking-wider whitespace-nowrap'

  if (column.key === null) {
    return (
      <th scope="col" className={cn(base, 'text-right text-muted-foreground', className)}>
        {column.label}
      </th>
    )
  }

  const key = column.key
  const sorted = sort.key === key
  const Arrow = sort.dir === 'ASC' ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={sorted ? (sort.dir === 'ASC' ? 'ascending' : 'descending') : 'none'}
      className={cn(base, className)}
    >
      <button
        type="button"
        onClick={() => onSort(key)}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60',
          sorted ? 'text-amber-400' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {column.label}
        <span className="inline-block h-4 w-4" aria-hidden="true">
          {sorted && <Arrow className="h-4 w-4" />}
        </span>
      </button>
    </th>
  )
}

function RoleBadge({ role }: { role: Role }) {
  const { variant, label } = ROLE_BADGE[role]
  return <Badge variant={variant}>{label}</Badge>
}

function StatusBadge({ row }: { row: AdminUserRow }) {
  if (row.status === 'ACTIVE') return <Badge variant="active">Active</Badge>
  const details = [
    row.suspendedUntil ? `Until ${formatLocalDateTime(row.suspendedUntil)}` : 'No end date',
    row.suspensionReason ? `Reason: ${row.suspensionReason}` : null,
  ]
    .filter(Boolean)
    .join('. ')
  return (
    <Badge
      variant="outline"
      className="border-red-500/30 bg-red-500/15 text-red-400"
      title={details}
    >
      Suspended
    </Badge>
  )
}

function Avatar({ row }: { row: AdminUserRow }) {
  const initials = (row.username ?? row.name ?? '?').slice(0, 2).toUpperCase()
  return (
    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-base font-medium text-muted-foreground">
      {row.image ? (
        <img src={row.image} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  )
}

function CrewsCell({ crews }: { crews: string[] }) {
  const { first, more } = crewsCell(crews)
  if (!first) return <span className="text-muted-foreground">None</span>
  return (
    <span className="flex items-center gap-1">
      <span
        className="min-w-0 truncate rounded-md border border-border bg-muted px-2 text-base"
        title={crews.join(', ')}
      >
        {first}
      </span>
      {more > 0 && <span className="shrink-0 text-muted-foreground">+{more}</span>}
    </span>
  )
}

export interface UsersTableProps {
  /** Render hint only (which buttons to draw). The server decides what is allowed. */
  viewerRole: Role
  rows: AdminUserRow[]
  sort: SortState
  onSort: (key: UserSortKey) => void
  onAction: (action: RowAction, row: AdminUserRow) => void
}

export function UsersTable({ viewerRole, rows, sort, onSort, onAction }: UsersTableProps) {
  const widths = COLUMNS.map((c) =>
    c.key === null && viewerRole !== 'OWNER' ? ADMIN_ACTIONS_WIDTH : c.width
  )
  const tableWidth = widths.reduce((sum, w) => sum + w, 0)
  const cell = 'h-[62px] border-b border-border px-3 align-middle'
  const truncate = 'block truncate'

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table
        className="table-fixed border-separate border-spacing-0 text-base"
        style={{ width: tableWidth, minWidth: '100%' }}
      >
        <caption className="sr-only">Users</caption>
        <colgroup>
          {COLUMNS.map((c, i) => (
            <col key={c.label} style={{ width: widths[i] }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((column, i) => (
              <SortHeader
                key={column.label}
                column={column}
                sort={sort}
                onSort={onSort}
                className={cn(
                  i === 0 && cn(stickyLeft, 'pl-4 xl:z-20 bg-muted'),
                  column.key === null && cn(stickyRight, 'xl:z-20 bg-muted pr-4')
                )}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const actions = rowActions(viewerRole, row)
            const note = rowNote(viewerRole, row)
            const who = row.username ?? row.email
            return (
              <tr key={row.id}>
                <td className={cn(cell, stickyLeft, 'pl-4')}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar row={row} />
                    {row.username ? (
                      <span className="min-w-0 truncate" title={row.username}>
                        {row.username}
                      </span>
                    ) : (
                      <span className="min-w-0 truncate italic text-muted-foreground">No username yet</span>
                    )}
                  </span>
                </td>
                <td className={cell}>
                  <RoleBadge role={row.role} />
                </td>
                <td className={cell}>
                  <CrewsCell crews={row.crews} />
                </td>
                <td className={cell}>
                  <StatusBadge row={row} />
                </td>
                <td className={cn(cell, 'tabular-nums text-muted-foreground')}>{row.entries}</td>
                <td className={cn(cell, 'tabular-nums text-muted-foreground')}>{row.battlesWon}</td>
                <td className={cn(cell, 'tabular-nums text-muted-foreground')}>{row.votesCast}</td>
                <td className={cn(cell, 'tabular-nums text-muted-foreground')}>{row.votesReceived}</td>
                <td className={cn(cell, 'whitespace-nowrap text-muted-foreground')}>{formatJoined(row.createdAt)}</td>
                <td className={cn(cell, 'whitespace-nowrap text-muted-foreground')}>
                  {formatLastSignIn(row.lastSignInAt)}
                </td>
                <td className={cn(cell, 'text-muted-foreground')}>
                  <span className={truncate} title={row.email}>
                    {row.email}
                  </span>
                </td>
                <td className={cn(cell, stickyRight, 'pr-4')}>
                  <div className="flex justify-end gap-1.5 whitespace-nowrap">
                    {actions.length > 0 ? (
                      actions.map((action) => (
                        <Button
                          key={action}
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(DANGER_ACTIONS.includes(action) && 'text-red-400 hover:text-red-300')}
                          aria-label={`${ACTION_LABELS[action]} ${who}`}
                          onClick={() => onAction(action, row)}
                        >
                          {ACTION_LABELS[action]}
                        </Button>
                      ))
                    ) : note ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled
                        className="border-dashed opacity-45"
                      >
                        {note}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
