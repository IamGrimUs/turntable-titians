'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation } from '@apollo/client'
import { Badge } from '@/components/ui/badge'
import { PersonAvatar } from '@/components/hall-of-fame/PersonAvatar'
import { VideoModal } from '@/app/battles/[id]/VideoModal'
import { getEmbedUrl } from '@/app/battles/[id]/getEmbedUrl'
import { CAST_RUNOFF_VOTE, REMOVE_RUNOFF_VOTE } from '@/lib/graphql/runoff'
import { adminErrorMessage } from '@/lib/admin-user-dialogs'
import type { BoardAccess } from '@/lib/board-view'
import { displayName, formatShortDate, type Person } from '@/lib/hall-of-fame-view'
import { plural } from '@/lib/plural'
import {
  runoffCardLine,
  runoffLockedReason,
  runoffRules,
  runoffStatusLabel,
  runoffVoteControl,
  type RunoffStatus,
} from '@/lib/runoff-view'

export interface RunoffCandidateData {
  /** Null while the runoff is OPEN: the server keeps the count secret. */
  votes: number | null
  submission: { id: string; videoUrl: string; user: Person }
}

export interface RunoffData {
  status: RunoffStatus
  opensAt: string
  endsAt: string
  viewerVoteSubmissionId: string | null
  viewerCanVote: boolean
  /** The tied entries, oldest first, exactly as the server sends them. Never re-sorted here. */
  candidates: RunoffCandidateData[]
}

/** Every entry of the battle with its round-one total (public once a battle is completed). */
export interface RunoffEntry {
  id: string
  userId: string
  voteCount: number | null
  user: Person
}

interface RunoffPanelProps {
  battleId: string
  runoff: RunoffData
  /** All entries, in the order the page lists them (round-one results). */
  entries: RunoffEntry[]
  currentUserId: string | null
  access: BoardAccess
  /** True while the session is loading: no sign-in links are shown yet. */
  sessionLoading: boolean
  /** Ids of `battle.winners`: the only entries ever highlighted as winners. */
  winnerUserIds: readonly string[]
  /** Called after a vote changes so the page reloads the battle. */
  onChange: () => Promise<unknown> | void
}

const buttonBase =
  'inline-flex min-h-11 w-full items-center justify-center rounded-md px-3 py-2 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
const primaryButton = `${buttonBase} bg-amber-500 text-black hover:bg-amber-400`
const secondaryButton = `${buttonBase} border border-border text-foreground hover:bg-muted`

function CandidateCard({
  candidate,
  roundOneVotes,
  isWinner,
  runoffClosed,
  control,
}: {
  candidate: RunoffCandidateData
  roundOneVotes: number | null
  isWinner: boolean
  runoffClosed: boolean
  control: React.ReactNode
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const { submission } = candidate
  const embedUrl = getEmbedUrl(submission.videoUrl)
  const videoId = embedUrl?.split('/').pop() ?? null
  const name = displayName(submission.user)

  return (
    <div className={`overflow-hidden rounded-lg border-2 bg-card ${isWinner ? 'border-amber-400' : 'border-border'}`}>
      <div className="relative aspect-video bg-muted">
        {embedUrl && videoId ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label={`Play ${name}'s entry`}
            className="absolute inset-0 h-full w-full"
          >
            <img
              src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/60">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </span>
            </span>
          </button>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <a
              href={submission.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base text-amber-500 underline underline-offset-2"
            >
              Watch video
            </a>
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <Link href={`/users/${submission.user.id}`} className="group flex min-w-0 items-center gap-3">
          <PersonAvatar user={submission.user} size={40} highlighted={isWinner} />
          <span className="truncate text-base font-semibold text-foreground group-hover:underline">{name}</span>
        </Link>
        <div className="text-base text-muted-foreground">
          <p>Round one: {roundOneVotes === null ? 'hidden' : plural(roundOneVotes, 'vote')}</p>
          {runoffClosed && candidate.votes !== null && (
            <p className="font-semibold text-foreground">Runoff: {plural(candidate.votes, 'vote')}</p>
          )}
        </div>
        {control}
      </div>

      {modalOpen && embedUrl && (
        <VideoModal
          embedUrl={embedUrl}
          title={null}
          user={submission.user}
          voteCount={roundOneVotes}
          isVotedHere={false}
          hasVotedElsewhere={false}
          ownEntryBlocked={false}
          loading={false}
          battleStatus="COMPLETED"
          currentUserId={null}
          onVote={() => {}}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * The runoff on the battle page: the tied candidates with their vote buttons, the rules, and the
 * round-one results. This component never decides who won; while the runoff is OPEN no runoff count
 * exists to show, and after it closes the server's counts and winners are displayed as sent.
 */
export function RunoffPanel({
  battleId,
  runoff,
  entries,
  currentUserId,
  access,
  sessionLoading,
  winnerUserIds,
  onChange,
}: RunoffPanelProps) {
  const [cast, { loading: casting }] = useMutation(CAST_RUNOFF_VOTE)
  const [remove, { loading: removing }] = useMutation(REMOVE_RUNOFF_VOTE)
  const [error, setError] = useState('')
  const busy = casting || removing

  const isOpen = runoff.status === 'OPEN'
  const roundOneOf = (submissionId: string) => entries.find((e) => e.id === submissionId)?.voteCount ?? null
  const candidateIds = new Set(runoff.candidates.map((c) => c.submission.id))
  const topVotes = runoff.candidates.length > 0 ? roundOneOf(runoff.candidates[0].submission.id) : null
  const isCandidateOwner = currentUserId !== null && runoff.candidates.some((c) => c.submission.user.id === currentUserId)

  async function run(action: () => Promise<unknown>) {
    setError('')
    try {
      await action()
    } catch (err: unknown) {
      setError(adminErrorMessage(err))
      return
    }
    try {
      await onChange()
    } catch {
      // The vote went through; a failed reload only leaves the page showing the old state until the next load.
    }
  }

  function controlFor(submissionId: string): React.ReactNode {
    if (!isOpen) return null
    if (sessionLoading) return null
    if (access === 'ANONYMOUS') {
      return (
        <Link href="/auth/signin" className={primaryButton}>
          Sign in to vote
        </Link>
      )
    }
    if (access === 'NEEDS_USERNAME') {
      return (
        <Link href="/onboarding" className={primaryButton}>
          Choose a username to vote
        </Link>
      )
    }

    const control = runoffVoteControl({
      viewerCanVote: runoff.viewerCanVote,
      viewerVoteSubmissionId: runoff.viewerVoteSubmissionId,
      submissionId,
    })
    if (control === 'LOCKED') {
      return <p className="text-base text-muted-foreground">{runoffLockedReason({ signedIn: true, isCandidateOwner })}</p>
    }
    if (control === 'VOTED') {
      return (
        <div className="space-y-2">
          <p className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/15 px-3 py-1 text-base font-semibold text-green-400">
            Your vote
          </p>
          <button
            type="button"
            className={secondaryButton}
            disabled={busy}
            onClick={() => run(() => remove({ variables: { battleId } }))}
          >
            {removing ? '…' : 'Remove vote'}
          </button>
        </div>
      )
    }
    return (
      <button
        type="button"
        className={primaryButton}
        disabled={busy}
        onClick={() => run(() => cast({ variables: { submissionId } }))}
      >
        {casting ? '…' : runoff.viewerVoteSubmissionId ? 'Switch my vote to this entry' : 'Vote in the runoff'}
      </button>
    )
  }

  const resultLine = runoffCardLine(
    runoff.status,
    runoff.candidates.map((c) => ({ name: displayName(c.submission.user), votes: c.votes })),
    runoff.endsAt,
  )

  return (
    <section aria-label="Runoff" className="mt-8 space-y-6">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={isOpen ? 'upcoming' : 'completed'}>{isOpen ? 'Runoff open' : runoffStatusLabel(runoff.status)}</Badge>
          <h2 className="text-xl font-bold text-foreground">
            {isOpen ? 'Tied for first: vote for who should win' : resultLine}
          </h2>
        </div>
        <p className="mt-2 text-base text-muted-foreground">
          {runoff.candidates.length} entries finished level{topVotes !== null ? ` at ${plural(topVotes, 'vote')}` : ''}.{' '}
          {isOpen
            ? `Voting reopens on just these until ${formatShortDate(runoff.endsAt)}. The runoff count stays hidden until it ends.`
            : `Voting reopened on just these and ended ${formatShortDate(runoff.endsAt)}.`}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-base text-red-400">
          {error}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {runoff.candidates.map((candidate) => (
          <CandidateCard
            key={candidate.submission.id}
            candidate={candidate}
            roundOneVotes={roundOneOf(candidate.submission.id)}
            isWinner={!isOpen && winnerUserIds.includes(candidate.submission.user.id)}
            runoffClosed={!isOpen}
            control={controlFor(candidate.submission.id)}
          />
        ))}
      </div>

      {isOpen && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-base font-bold text-foreground">Runoff rules</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-muted-foreground">
            {runoffRules(runoff.endsAt).map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-base font-bold text-foreground">Round one results</h3>
        <ul className="mt-2 divide-y divide-border">
          {entries.map((entry) => {
            const inRunoff = candidateIds.has(entry.id)
            return (
              <li
                key={entry.id}
                className={`flex items-center justify-between gap-3 py-2 text-base ${inRunoff ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                <span className="truncate">{displayName(entry.user)}</span>
                <span className="shrink-0 font-mono">{entry.voteCount === null ? 'hidden' : plural(entry.voteCount, 'vote')}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
