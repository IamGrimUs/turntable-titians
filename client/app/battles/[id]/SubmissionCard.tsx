'use client'

import { DELETE_VOTE_MUTATION, VOTE_MUTATION } from '@/lib/graphql/queries'
import { useMutation } from '@apollo/client'
import Link from 'next/link'
import { useState, type CSSProperties } from 'react'
import { getEmbedUrl } from './getEmbedUrl'

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

interface Props {
  submission: Submission
  rank: number
  userVotedSubmissionId: string | null
  currentUserId: string | null
  onVoteChange: () => void
  isLeading: boolean
  isWinner: boolean
  battleStatus: 'UPCOMING' | 'ACTIVE' | 'COMPLETED'
}

const podiumBorder: Record<number, string> = {
  1: 'border-amber-400',
  2: 'border-slate-400',
  3: 'border-amber-700'
}

const podiumBadge: Record<number, string> = {
  1: 'bg-amber-400 text-black',
  2: 'bg-slate-400 text-black',
  3: 'bg-amber-700 text-white'
}

function GraffitiCrown() {
  return (
    <img
      src="/crown.svg"
      alt=""
      style={{
        position: 'absolute',
        top: '-13%',
        left: '-22%',
        transform: 'rotate(-0.08turn)',
        width: 180,
        height: 'auto',
        pointerEvents: 'none',
        zIndex: 20
      }}
    />
  )
}

export function SubmissionCard({ submission, rank, userVotedSubmissionId, currentUserId, onVoteChange, isLeading, isWinner, battleStatus }: Props) {
  const [vote, { loading: voting }] = useMutation(VOTE_MUTATION)
  const [deleteVote, { loading: deleting }] = useMutation(DELETE_VOTE_MUTATION)
  const [voteError, setVoteError] = useState('')

  const embedUrl = getEmbedUrl(submission.videoUrl)
  const isPodium = rank <= 3
  const isVotedHere = userVotedSubmissionId === submission.id
  const hasVotedElsewhere = userVotedSubmissionId !== null && !isVotedHere
  const displayName = submission.user.username ?? submission.user.name ?? 'DJ'
  const initial = displayName.charAt(0).toUpperCase()
  const loading = voting || deleting

  const showCrown = rank === 1 && (isWinner || isLeading)

  const cardGlowStyle: CSSProperties = (() => {
    if (rank === 1 && (isWinner || isLeading)) {
      return {
        animation: 'card-glow-gold 2.5s ease-in-out alternate infinite',
        boxShadow: '0 0 24px 6px rgba(251, 191, 36, 0.45)',
        background: 'radial-gradient(ellipse at top center, rgba(251,191,36,0.18) 0%, transparent 70%), hsl(var(--card))',
      }
    }
    if (rank === 2 && battleStatus !== 'UPCOMING' && submission.voteCount > 0) {
      return {
        animation: 'card-glow-silver 2.5s ease-in-out alternate infinite',
        boxShadow: '0 0 20px 5px rgba(148, 163, 184, 0.35)',
        background: 'radial-gradient(ellipse at top center, rgba(148,163,184,0.14) 0%, transparent 70%), hsl(var(--card))',
      }
    }
    return {}
  })()

  async function handleVote() {
    setVoteError('')
    try {
      if (isVotedHere) {
        await deleteVote({ variables: { submissionId: submission.id } })
      } else {
        await vote({ variables: { submissionId: submission.id } })
      }
      onVoteChange()
    } catch (err: unknown) {
      setVoteError(err instanceof Error ? err.message : 'Vote failed')
    }
  }

  return (
    <div className="relative">
      {showCrown && <GraffitiCrown />}
      <div className={`rounded-lg border-2 bg-card overflow-hidden relative ${isPodium ? podiumBorder[rank] : 'border-border'}`} style={cardGlowStyle}>
        {isPodium && rank >= 3 && <span className={`absolute top-2 right-2 z-10 text-xs font-black px-2 py-0.5 rounded-full ${podiumBadge[rank]}`}>#{rank}</span>}
        {isWinner && <span className="absolute top-2 left-2 z-10 text-xs font-black px-2 py-0.5 rounded-full bg-amber-400 text-black">Winner</span>}
        {isLeading && !isWinner && <span className="absolute top-2 left-2 z-10 text-xs font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">Leading</span>}

        {/* Video */}
        <div className="aspect-video bg-muted">
          {embedUrl ? (
            <iframe src={embedUrl} title={submission.title ?? 'Submission video'} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <a href={submission.videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-amber-500 underline underline-offset-2">
                Watch video
              </a>
            </div>
          )}
        </div>

        {/* Card body */}
        <div className="p-4 space-y-3">
          {submission.title && <p className="text-sm font-bold text-foreground leading-snug">{submission.title}</p>}
          {submission.description && <p className="text-xs text-muted-foreground leading-relaxed">{submission.description}</p>}

          {/* DJ info + vote */}
          <div className="flex items-center justify-between pt-1">
            <Link href={`/users/${submission.user.id}`} className="flex items-center gap-2 group">
              {submission.user.image ? (
                <img src={submission.user.image} alt={displayName} className="w-7 h-7 rounded-full object-cover border border-border" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-500 text-xs font-bold flex items-center justify-center border border-amber-500/30">{initial}</span>
              )}
              <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{displayName}</span>
            </Link>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">{submission.voteCount}</span>
              {currentUserId && battleStatus === 'ACTIVE' && (
                <button
                  onClick={handleVote}
                  disabled={hasVotedElsewhere || loading}
                  className={`text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-md transition-all disabled:cursor-not-allowed ${
                    isVotedHere ? 'bg-amber-500 text-black hover:bg-amber-400' : hasVotedElsewhere ? 'bg-muted text-muted-foreground opacity-50' : 'border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black'
                  }`}>
                  {loading ? '…' : isVotedHere ? 'Voted' : 'Vote'}
                </button>
              )}
            </div>
          </div>
          {voteError && <p className="text-xs text-red-400">{voteError}</p>}
        </div>
      </div>
    </div>
  )
}
