'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@apollo/client'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { GET_BATTLE } from '@/lib/graphql/queries'
import { Badge } from '@/components/ui/badge'
import { SubmitEntryForm } from './SubmitEntryForm'
import { SubmissionCard } from './SubmissionCard'
import { WinnerBanner } from './WinnerBanner'

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
  voteCount: number
  createdAt: string
  votes: { id: string; userId: string }[]
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

  const sortedSubmissions = [...battle.submissions].sort((a, b) => b.voteCount - a.voteCount)

  const userVotedSubmissionId =
    currentUserId
      ? (sortedSubmissions.find((s) => s.votes.some((v) => v.userId === currentUserId))?.id ?? null)
      : null

  const hasSubmitted = currentUserId
    ? sortedSubmissions.some((s) => s.userId === currentUserId)
    : false

  const showForm = battle.status === 'ACTIVE' && !!currentUserId && !hasSubmitted

  const maxVoteCount = sortedSubmissions.length > 0
    ? Math.max(...sortedSubmissions.map((s) => s.voteCount))
    : 0

  const winners = battle.status === 'COMPLETED' && maxVoteCount > 0
    ? sortedSubmissions
        .filter((s) => s.voteCount === maxVoteCount)
        .map((s) => ({ ...s.user, voteCount: s.voteCount }))
    : []

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Battle Header */}
      <div className="mb-8">
        <p className="text-xs font-bold tracking-[0.3em] uppercase text-amber-500 mb-2">
          Turntable Titans
        </p>
        <div className="flex flex-wrap items-start gap-3 mb-3">
          <h1 className="text-3xl font-black tracking-tight uppercase text-foreground">
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
        <p className="text-xs text-muted-foreground">
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
            <p className="text-xs font-bold text-amber-500 mt-1">{label}</p>
          )
        })()}
        {battle.description && (
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{battle.description}</p>
        )}
      </div>

      {/* Winner Banner */}
      <WinnerBanner winners={winners} />

      {/* Submit Entry Form */}
      {showForm && (
        <SubmitEntryForm battleId={battle.id} onSuccess={() => refetch()} />
      )}

      {/* Sign-in prompt for unauthenticated users on active battles */}
      {battle.status === 'ACTIVE' && !currentUserId && (
        <div className="rounded-lg border border-border bg-card p-4 mb-8 text-sm text-muted-foreground">
          <Link href="/auth/signin" className="text-amber-500 hover:underline font-semibold">
            Sign in
          </Link>{' '}
          to submit your entry.
        </div>
      )}

      {/* Submissions Grid */}
      {sortedSubmissions.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-16">No submissions yet.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sortedSubmissions.map((submission, index) => (
            <SubmissionCard
              key={submission.id}
              submission={submission}
              rank={index + 1}
              userVotedSubmissionId={userVotedSubmissionId}
              currentUserId={currentUserId}
              onVoteChange={() => refetch()}
              battleStatus={battle.status}
              isLeading={battle.status === 'ACTIVE' && maxVoteCount > 0 && submission.voteCount === maxVoteCount}
              isWinner={battle.status === 'COMPLETED' && maxVoteCount > 0 && submission.voteCount === maxVoteCount}
            />
          ))}
        </div>
      )}
    </div>
  )
}
