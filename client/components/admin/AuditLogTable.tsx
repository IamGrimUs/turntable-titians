'use client'

import { useQuery } from '@apollo/client'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ADMIN_AUDIT_LOG_QUERY } from '@/lib/graphql/admin'
import { hasAccessError } from '@/lib/graphql-errors'
import {
  actionLabel,
  actionTone,
  formatAuditTime,
  partyLabel,
  summarizeDetails,
  type ActionTone,
  type AuditLogRow,
} from '@/lib/audit-log-view'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50

interface AuditLogData {
  adminAuditLog: { rows: AuditLogRow[]; total: number; page: number; pageCount: number }
}

const TONE_CLASS: Record<ActionTone, string> = {
  danger: 'border-red-500/30 bg-red-500/15 text-red-400',
  warn: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
  good: 'border-green-500/30 bg-green-500/15 text-green-400',
  neutral: 'border-slate-500/30 bg-slate-500/15 text-slate-400',
}

const TH =
  'h-12 border-b border-border bg-muted px-3 text-left text-base font-semibold uppercase tracking-wider whitespace-nowrap text-muted-foreground'
const TD = 'border-b border-border px-3 py-3 align-top'

function Party({ username, email }: { username: string | null; email: string | null }) {
  const label = partyLabel(username, email)
  // With a username shown, the email is still available on hover; without, it is the label.
  const title = username && email ? `${username} (${email})` : label
  return (
    <span className="block truncate" title={title}>
      {label}
    </span>
  )
}

export function AuditLogTable() {
  const [page, setPage] = useState(1)

  const { data, previousData, loading, error, refetch } = useQuery<AuditLogData>(ADMIN_AUDIT_LOG_QUERY, {
    variables: { page, pageSize: PAGE_SIZE },
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  })

  // The server clamps an out-of-range page; the pager follows the page it returns.
  const shown = (data ?? previousData)?.adminAuditLog
  const noAccess = error ? hasAccessError(error) : false

  if (noAccess) {
    return (
      <div className="p-8">
        <h1 className="font-graffiti text-4xl">Audit log</h1>
        <Card className="mt-6 max-w-xl">
          <CardContent className="p-6">
            <p className="text-lg font-medium">You don&apos;t have access</p>
            <p className="mt-1 text-base text-muted-foreground">
              The audit log is for the site owner. If you should have access, sign out and back in.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const pageNumber = shown?.page ?? page
  const pageCount = Math.max(1, shown?.pageCount ?? 1)

  return (
    <div className="flex min-w-0 flex-col gap-4 py-7 pl-4 md:pl-8">
      <div className="pr-4 md:pr-8">
        <h1 className="font-graffiti text-4xl md:text-5xl">Audit log</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Every admin action, newest first. Names and emails are copied when the action happens.
        </p>
      </div>

      {error && !shown ? (
        <div className="pr-4 md:pr-8">
          <Card className="max-w-xl">
            <CardContent className="p-6">
              <p className="text-base text-destructive">
                We couldn&apos;t load the audit log right now. Please try again in a moment.
              </p>
              <Button type="button" variant="outline" className="mt-4" onClick={() => void refetch()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : !shown ? (
        <p className="text-base text-muted-foreground">Loading audit log...</p>
      ) : (
        <>
          {error && (
            <p className="pr-4 text-base text-destructive md:pr-8" role="alert">
              We couldn&apos;t refresh the log. Showing the last results.
            </p>
          )}
          <div className={cn('pr-4 transition-opacity md:pr-8', loading && 'opacity-60')} aria-busy={loading}>
            {shown.rows.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-base text-muted-foreground">No admin actions yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card [color-scheme:dark]">
                <table className="w-full min-w-[1000px] table-fixed border-separate border-spacing-0 text-base">
                  <caption className="sr-only">Admin audit log</caption>
                  <colgroup>
                    <col style={{ width: 200 }} />
                    <col style={{ width: 190 }} />
                    <col style={{ width: 170 }} />
                    <col style={{ width: 190 }} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className={cn(TH, 'pl-4')}>Time</th>
                      <th scope="col" className={TH}>Actor</th>
                      <th scope="col" className={TH}>Action</th>
                      <th scope="col" className={TH}>Target</th>
                      <th scope="col" className={cn(TH, 'pr-4')}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.rows.map((row) => {
                      const summary = summarizeDetails(row.action, row.details)
                      return (
                        <tr key={row.id}>
                          <td className={cn(TD, 'pl-4 text-muted-foreground')}>
                            <time dateTime={row.createdAt}>{formatAuditTime(row.createdAt)}</time>
                          </td>
                          <td className={TD}>
                            <Party username={row.actorUsername} email={row.actorEmail} />
                          </td>
                          <td className={TD}>
                            <Badge variant="outline" className={cn('whitespace-nowrap', TONE_CLASS[actionTone(row.action)])}>
                              {actionLabel(row.action)}
                            </Badge>
                          </td>
                          <td className={TD}>
                            <Party username={row.targetUsername} email={row.targetEmail} />
                          </td>
                          <td className={cn(TD, 'break-words pr-4 text-muted-foreground')}>
                            {summary || (
                              <>
                                <span aria-hidden="true">&mdash;</span>
                                <span className="sr-only">No details</span>
                              </>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pr-4 text-base text-muted-foreground md:pr-8">
            <span>
              {shown.total} {shown.total === 1 ? 'action' : 'actions'} in total
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
    </div>
  )
}
