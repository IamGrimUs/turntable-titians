'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useMutation } from '@apollo/client'
import { VOTE_MUTATION, DELETE_VOTE_MUTATION } from '@/lib/graphql/queries'
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
  3: 'border-amber-700',
}

const podiumBadge: Record<number, string> = {
  1: 'bg-amber-400 text-black',
  2: 'bg-slate-400 text-black',
  3: 'bg-amber-700 text-white',
}

function CrownOrnament() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        transform: 'translate(33%, -50%) rotate(25deg)',
        transformOrigin: 'bottom left',
        width: 48,
        height: 36,
        animation: 'ornament-float 3s ease-in-out infinite',
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#FBBF24',
          clipPath: 'polygon(0% 100%, 0% 40%, 25% 70%, 50% 0%, 75% 70%, 100% 40%, 100% 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'ornament-shimmer 2.2s ease infinite',
          }}
        />
      </div>
    </div>
  )
}

function LaurelOrnament() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        transform: 'translate(33%, -50%) rotate(25deg)',
        transformOrigin: 'bottom left',
        width: 44,
        height: 44,
        animation: 'ornament-float 3s ease-in-out infinite',
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* Left arc */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: '10%',
            width: '55%',
            height: '80%',
            border: '3px solid #CBD5E1',
            borderRight: 'none',
            borderRadius: '50% 0 0 50%',
          }}
        />
        {/* Right arc */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '10%',
            width: '55%',
            height: '80%',
            border: '3px solid #CBD5E1',
            borderLeft: 'none',
            borderRadius: '0 50% 50% 0',
          }}
        />
        {/* Center dot */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: '#CBD5E1',
          }}
        />
        {/* Shimmer */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'ornament-shimmer 2.2s ease infinite',
          }}
        />
      </div>
    </div>
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

  const showOrnament = (rank === 1 || rank === 2) && (isWinner || isLeading)

  const cardGlowStyle: CSSProperties = (() => {
    if (!showOrnament) return {}
    const isGold = rank === 1
    if (isGold) {
      return {
        animation: isWinner ? 'card-glow-gold 2.5s ease-in-out alternate infinite' : 'none',
        boxShadow: '0 0 10px 2px rgba(251, 191, 36, 0.2)',
        background: isWinner
          ? 'radial-gradient(ellipse at top center, rgba(251,191,36,0.09) 0%, transparent 65%), hsl(var(--card))'
          : 'radial-gradient(ellipse at top center, rgba(251,191,36,0.05) 0%, transparent 65%), hsl(var(--card))',
      }
    }
    return {
      animation: isWinner ? 'card-glow-silver 2.5s ease-in-out alternate infinite' : 'none',
      boxShadow: '0 0 10px 2px rgba(148, 163, 184, 0.15)',
      background: isWinner
        ? 'radial-gradient(ellipse at top center, rgba(148,163,184,0.07) 0%, transparent 65%), hsl(var(--card))'
        : 'radial-gradient(ellipse at top center, rgba(148,163,184,0.04) 0%, transparent 65%), hsl(var(--card))',
    }
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
      {showOrnament && rank === 1 && <CrownOrnament />}
      {showOrnament && rank === 2 && <LaurelOrnament />}
      <div
        className={`rounded-lg border bg-card overflow-hidden relative ${
          isPodium ? podiumBorder[rank] : 'border-border'
        }`}
        style={cardGlowStyle}
      >
        {isPodium && rank >= 3 && (
          <span
            className={`absolute top-2 right-2 z-10 text-xs font-black px-2 py-0.5 rounded-full ${podiumBadge[rank]}`}
          >
            #{rank}
          </span>
        )}
        {isWinner && (
          <span className="absolute top-2 left-2 z-10 text-xs font-black px-2 py-0.5 rounded-full bg-amber-400 text-black">
            Winner
          </span>
        )}
        {isLeading && !isWinner && (
          <span className="absolute top-2 left-2 z-10 text-xs font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
            Leading
          </span>
        )}

        {/* Video */}
        <div className="aspect-video bg-muted">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={submission.title ?? 'Submission video'}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <a
                href={submission.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-amber-500 underline underline-offset-2"
              >
                Watch video
              </a>
            </div>
          )}
        </div>

        {/* Card body */}
        <div className="p-4 space-y-3">
          {submission.title && (
            <p className="text-sm font-bold text-foreground leading-snug">{submission.title}</p>
          )}
          {submission.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">{submission.description}</p>
          )}

          {/* DJ info + vote */}
          <div className="flex items-center justify-between pt-1">
            <Link href={`/users/${submission.user.id}`} className="flex items-center gap-2 group">
              {submission.user.image ? (
                <img
                  src={submission.user.image}
                  alt={displayName}
                  className="w-7 h-7 rounded-full object-cover border border-border"
                />
              ) : (
                <span className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-500 text-xs font-bold flex items-center justify-center border border-amber-500/30">
                  {initial}
                </span>
              )}
              <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                {displayName}
              </span>
            </Link>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">{submission.voteCount}</span>
              {currentUserId && battleStatus === 'ACTIVE' && (
                <button
                  onClick={handleVote}
                  disabled={hasVotedElsewhere || loading}
                  className={`text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-md transition-all disabled:cursor-not-allowed ${
                    isVotedHere
                      ? 'bg-amber-500 text-black hover:bg-amber-400'
                      : hasVotedElsewhere
                      ? 'bg-muted text-muted-foreground opacity-50'
                      : 'border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black'
                  }`}
                >
                  {loading ? '…' : isVotedHere ? 'Voted' : 'Vote'}
                </button>
              )}
            </div>
          </div>
          {voteError && (
            <p className="text-xs text-red-400">{voteError}</p>
          )}
        </div>
      </div>
    </div>
  )
}
