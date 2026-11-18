'use client'

import { useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@apollo/client'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { GET_BATTLE } from '@/lib/graphql/queries'
import { Badge } from '@/components/ui/badge'
import { SubmitEntryForm } from './SubmitEntryForm'
import { SubmitFAB } from './SubmitFAB'
import { SubmissionCard } from './SubmissionCard'
import { Lock } from 'lucide-react'
import { rankSubmissions, VOTES_HIDDEN_HINT } from '@/lib/vote-visibility'
import { entryStyle } from '@/lib/battle-entry-style'
import { boardAccess } from '@/lib/board-view'
import { battleCardView } from '@/lib/battle-card-view'
import { RunoffPanel, type RunoffData } from '@/components/battles/RunoffPanel'
import { duelPageView, duelSignInText, type DuelBattle } from '@/lib/duel-view'

interface SubmissionUser {
  id: string
  username: string | null
  name: string | null
  image: string | null
}

interface Submission {
  id: string
  userId: string
  videoUrl: string
  title: string | null
  description: string | null
  voteCount: number | null
  createdAt: string
  viewerHasVoted: boolean
  user: SubmissionUser
}

interface Battle {
  id: string
  title: string
  type: string
  description: string | null
  startDate: string
  endDate: string
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED'
  /** The server's answer to who won. The page never works it out from vote counts. */
  winners: { id: string }[]
  /** Set when the battle ended tied for first: voting reopens on the tied entries. */
  runoff: RunoffData | null
  submissions: Submission[]
  /** Set for a head to head duel (a 1v1 challenge); null for a regular battle. */
  duel: DuelBattle['duel']
}

export default function BattleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session, status: sessionStatus } = useSession()
  const { data, loading, error, refetch } = useQuery(GET_BATTLE, { variables: { id } })
  const [isFormOpen, setIsFormOpen] = useState(false)
  const handleCloseForm = useCallback(() => setIsFormOpen(false), [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-full p-8">
        <p className="text-muted-foreground">Loading battle…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-full p-8">
        <p className="text-destructive">Error: {error.message}</p>
      </div>
    )
  }

  const battle: Battle | null = data?.battle ?? null

  if (!battle) {
    return (
      <div className="flex items-center justify-center min-h-full p-8">
        <p className="text-muted-foreground">Battle not found.</p>
      </div>
    )
  }

  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null

  // While voting is open the order stays neutral (oldest first) so it can't reveal who is ahead.
  const { ordered: sortedSubmissions } = rankSubmissions(battle.submissions, battle.status)

  // Crowns come only from the server's `winners`. In a tied battle round-one counts would crown
  // both tied entries, so while a runoff exists the rank badges are off too (see entryStyle).
  const winnerUserIds = battle.winners.map((w) => w.id)
  // A duel (1v1 challenge) has its own page layout and never a runoff: a level duel is a draw.
  const duelView = duelPageView(battle)
  const runoff = duelView ? null : battle.runoff
  const styleFor = (submission: Submission, index: number) =>
    entryStyle({
      battleStatus: battle.status,
      hasRunoff: runoff !== null,
      winnerUserIds,
      userId: submission.userId,
      rank: index + 1,
      voteCount: submission.voteCount,
      // The duel's winner is found by user id: the two entries come in no meaningful order.
      duel: battle.duel ? { winnerId: battle.duel.winner?.id ?? null } : null,
    })
  const hasWinner = sortedSubmissions.some((s, i) => styleFor(s, i).isWinner)

  const userVotedSubmissionId =
    currentUserId
      ? (sortedSubmissions.find((s) => s.viewerHasVoted)?.id ?? null)
      : null

  const hasSubmitted = currentUserId
    ? sortedSubmissions.some((s) => s.userId === currentUserId)
    : false

  // Nobody can add an entry to a duel: both entries come from the challenge.
  const showForm = battle.status === 'ACTIVE' && !!currentUserId && !hasSubmitted && !duelView

  // Same pill as the battle cards: an open runoff reads RUNOFF, not COMPLETED.
  const headerView = battleCardView({ status: battle.status, runoff })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Battle Header */}
      <div className="mb-8">
        <p className="text-xl font-graffiti text-amber-500 mb-2">
          Battle Skratch
        </p>
        <div className="flex flex-wrap items-start gap-3 mb-3">
          <h1 className="min-w-0 max-w-full break-words text-5xl font-graffiti text-foreground">
            {duelView ? duelView.headline : battle.title}
          </h1>
          <Badge variant={headerView.statusVariant}>{headerView.statusLabel}</Badge>
          <Badge variant="outline" className="text-muted-foreground">
            {duelView ? duelView.badgeLabel : battle.type}
          </Badge>
        </div>
        {duelView && (
          <p className="mb-3 break-words text-xl font-bold text-foreground">{duelView.subtitle}</p>
        )}
        <div className="mt-3 h-px bg-gradient-to-r from-amber-500 to-transparent mb-4" />
        {duelView && (
          <>
            <p className="mb-2 text-base text-muted-foreground">{duelView.intro}</p>
            {duelView.resultLine && (
              <p className="mb-2 break-words text-xl font-bold text-amber-500">{duelView.resultLine}</p>
            )}
          </>
        )}
        <p className="text-base text-muted-foreground">
          {new Date(battle.startDate).toLocaleDateString()} → {new Date(battle.endDate).toLocaleDateString()}
        </p>
        {battle.status === 'ACTIVE' && (() => {
          const today = new Date()
          const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
          const [eyear, emonth, eday] = battle.endDate.split('T')[0].split('-').map(Number)
          const end = new Date(eyear, emonth - 1, eday)
          const diffMs = end.getTime() - todayDay.getTime()
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
          const label = diffDays === 0 ? 'Closes today' : `${diffDays} day${diffDays === 1 ? '' : 's'} remaining`
          return (
            <p className="text-base font-bold text-amber-500 mt-1">{label}</p>
          )
        })()}
        {battle.description && (
          <p className="mt-3 text-base text-muted-foreground leading-relaxed">{battle.description}</p>
        )}
        {battle.status === 'ACTIVE' && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-base text-muted-foreground">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <p>
              <span className="font-semibold text-foreground">{VOTES_HIDDEN_HINT}.</span>{' '}
              <Link href="/how-it-works" className="text-amber-500 font-semibold hover:underline">
                How battles work
              </Link>
            </p>
          </div>
        )}
      </div>

      {/* Submit Entry FAB + bottom sheet */}
      {showForm && (
        <SubmitFAB onClick={() => setIsFormOpen(true)} />
      )}
      {showForm && isFormOpen && (
        <SubmitEntryForm
          battleId={battle.id}
          onSuccess={() => refetch()}
          onClose={handleCloseForm}
        />
      )}

      {/* Sign-in prompt for unauthenticated users on active battles */}
      {battle.status === 'ACTIVE' && !currentUserId && (
        <div className="rounded-lg border border-border bg-card p-4 mb-8 text-base text-muted-foreground">
          <Link href="/auth/signin" className="text-amber-500 hover:underline font-semibold">
            Sign in
          </Link>{' '}
          {duelSignInText(duelView !== null)}
        </div>
      )}

      {/* Runoff: the tie-break vote on the entries that tied for first */}
      {runoff && (
        <RunoffPanel
          battleId={battle.id}
          runoff={runoff}
          entries={sortedSubmissions}
          currentUserId={currentUserId}
          access={boardAccess(session?.user)}
          sessionLoading={sessionStatus === 'loading'}
          winnerUserIds={winnerUserIds}
          onChange={() => refetch()}
        />
      )}

      {/* Submissions Grid */}
      {runoff && sortedSubmissions.length > 0 && (
        <h2 className="mt-12 text-xl font-bold text-foreground">Round one entries</h2>
      )}
      {sortedSubmissions.length === 0 ? (
        <p className={`${hasWinner ? 'mt-12' : 'mt-8'} text-muted-foreground text-base text-center py-16`}>No submissions yet.</p>
      ) : (
        <div className={`${hasWinner ? 'mt-12' : 'mt-8'} grid gap-6 md:grid-cols-2 lg:grid-cols-3`}>
          {sortedSubmissions.map((submission, index) => (
            <SubmissionCard
              key={submission.id}
              submission={submission}
              style={styleFor(submission, index)}
              userVotedSubmissionId={userVotedSubmissionId}
              currentUserId={currentUserId}
              onVoteChange={() => refetch()}
              battleStatus={battle.status}
              duel={battle.duel}
            />
          ))}
        </div>
      )}
    </div>
  )
}
