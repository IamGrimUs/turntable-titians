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
  submissions: Submission[]
}

const statusVariantMap: Record<string, 'upcoming' | 'active' | 'completed'> = {
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  COMPLETED: 'completed',
}

export default function BattleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session } = useSession()
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
  const { ordered: sortedSubmissions, votesRevealed, maxVoteCount, hasWinner } = rankSubmissions(
    battle.submissions,
    battle.status
  )

  const userVotedSubmissionId =
    currentUserId
      ? (sortedSubmissions.find((s) => s.viewerHasVoted)?.id ?? null)
      : null

  const hasSubmitted = currentUserId
    ? sortedSubmissions.some((s) => s.userId === currentUserId)
    : false

  const showForm = battle.status === 'ACTIVE' && !!currentUserId && !hasSubmitted

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Battle Header */}
      <div className="mb-8">
        <p className="text-xl font-graffiti text-amber-500 mb-2">
          Battle Skratch
        </p>
        <div className="flex flex-wrap items-start gap-3 mb-3">
          <h1 className="text-5xl font-graffiti text-foreground">
            {battle.title}
          </h1>
          <Badge variant={statusVariantMap[battle.status] ?? 'upcoming'}>
            {battle.status}
          </Badge>
          <Badge variant="outline" className="text-muted-foreground">
            {battle.type}
          </Badge>
        </div>
        <div className="mt-3 h-px bg-gradient-to-r from-amber-500 to-transparent mb-4" />
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
              Results are revealed once the battle ends.{' '}
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
          to submit your entry.
        </div>
      )}

      {/* Submissions Grid */}
      {sortedSubmissions.length === 0 ? (
        <p className={`${hasWinner ? 'mt-12' : 'mt-8'} text-muted-foreground text-base text-center py-16`}>No submissions yet.</p>
      ) : (
        <div className={`${hasWinner ? 'mt-12' : 'mt-8'} grid gap-6 md:grid-cols-2 lg:grid-cols-3`}>
          {sortedSubmissions.map((submission, index) => (
            <SubmissionCard
              key={submission.id}
              submission={submission}
              rank={index + 1}
              userVotedSubmissionId={userVotedSubmissionId}
              currentUserId={currentUserId}
              onVoteChange={() => refetch()}
              battleStatus={battle.status}
              isLeading={false}
              isWinner={votesRevealed && maxVoteCount > 0 && submission.voteCount === maxVoteCount}
            />
          ))}
        </div>
      )}
    </div>
  )
}
