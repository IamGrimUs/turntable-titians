import Link from 'next/link'
import { db } from '@/lib/db'
import { isSuspendedNow, readSuspensionNotice } from '@/lib/suspension'

// The URL carries only a signed 10-minute notice (the user id), never the reason. An
// invalid, expired or missing notice, or a user who is no longer suspended, shows the same
// generic message, so this page cannot be used to find out whether an address exists.

interface Details {
  reason: string | null
  until: Date | null
}

async function loadDetails(notice: string | undefined): Promise<Details | null> {
  const secret = process.env.AUTH_SECRET
  if (!notice || !secret) return null
  const userId = await readSuspensionNotice(notice, secret)
  if (!userId) return null
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { suspendedAt: true, suspendedUntil: true, suspensionReason: true },
  })
  if (!row || !isSuspendedNow(row)) return null
  return { reason: row.suspensionReason, until: row.suspendedUntil }
}

export default async function SuspendedPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>
}) {
  const { notice } = await searchParams
  const details = await loadDetails(typeof notice === 'string' ? notice : undefined)

  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8">
          <p className="text-xl font-graffiti text-amber-500 mb-2">Battle Skratch</p>
          <h1 className="text-3xl font-graffiti text-foreground">
            {details ? 'Account Suspended' : 'Account Unavailable'}
          </h1>
          <div className="mt-3 h-px bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
        </div>

        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          {details ? (
            <>
              <p className="text-base text-foreground">This account is suspended.</p>
              {details.reason && (
                <p className="text-base text-muted-foreground whitespace-pre-wrap break-words">
                  Reason: {details.reason}
                </p>
              )}
              <p className="text-base text-muted-foreground">
                {details.until
                  ? `The suspension ends on ${details.until.toISOString().slice(0, 10)} (UTC).`
                  : 'The suspension has no end date.'}
              </p>
            </>
          ) : (
            <p className="text-base text-muted-foreground">This account is unavailable.</p>
          )}
          <Link
            href="/auth/signin"
            className="block text-base text-amber-500 hover:text-amber-400 transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
