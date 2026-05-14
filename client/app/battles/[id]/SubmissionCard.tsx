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
        zIndex: 20,
        pointerEvents: 'none',
        // drop-shadow respects clip-path on the child, tracing the crown silhouette
        filter: 'drop-shadow(0px 3px 5px rgba(0,0,0,0.55)) drop-shadow(0px 1px 2px rgba(120,53,15,0.7))',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          // light gold top-left → rich amber centre → deep brown bottom-right
          background: 'linear-gradient(145deg, #FEF3C7 0%, #FDE68A 18%, #FBBF24 45%, #D97706 72%, #92400E 100%)',
          clipPath: 'polygon(0% 100%, 0% 40%, 25% 70%, 50% 0%, 75% 70%, 100% 40%, 100% 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* specular highlight sweep */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)',
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
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
        <defs>
          {/* radial gradient — upper-left highlight gives each leaf a 3-D bump */}
          <radialGradient id="leafGrad" cx="30%" cy="28%" r="70%">
            <stop offset="0%"   stopColor="#F8FAFC"/>
            <stop offset="45%"  stopColor="#CBD5E1"/>
            <stop offset="100%" stopColor="#475569"/>
          </radialGradient>
          <radialGradient id="dotGrad" cx="35%" cy="30%" r="65%">
            <stop offset="0%"   stopColor="#F1F5F9"/>
            <stop offset="100%" stopColor="#475569"/>
          </radialGradient>
          <filter id="laurelShadow" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.45"/>
          </filter>
        </defs>
        <g filter="url(#laurelShadow)">
          {/* Left stem */}
          <path d="M22 39 C12 36 5 26 9 12" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round"/>
          {/* Left leaves */}
          <ellipse cx="8"  cy="30" rx="5" ry="2.5" transform="rotate(-50 8 30)"  fill="url(#leafGrad)"/>
          <ellipse cx="6"  cy="21" rx="5" ry="2.5" transform="rotate(-30 6 21)"  fill="url(#leafGrad)"/>
          <ellipse cx="9"  cy="13" rx="5" ry="2.5" transform="rotate(-10 9 13)"  fill="url(#leafGrad)"/>
          <ellipse cx="16" cy="8"  rx="5" ry="2.5" transform="rotate(20 16 8)"   fill="url(#leafGrad)"/>
          {/* Right stem */}
          <path d="M22 39 C32 36 39 26 35 12" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round"/>
          {/* Right leaves */}
          <ellipse cx="36" cy="30" rx="5" ry="2.5" transform="rotate(50 36 30)"  fill="url(#leafGrad)"/>
          <ellipse cx="38" cy="21" rx="5" ry="2.5" transform="rotate(30 38 21)"  fill="url(#leafGrad)"/>
          <ellipse cx="35" cy="13" rx="5" ry="2.5" transform="rotate(10 35 13)"  fill="url(#leafGrad)"/>
          <ellipse cx="28" cy="8"  rx="5" ry="2.5" transform="rotate(-20 28 8)"  fill="url(#leafGrad)"/>
          {/* Center tie */}
          <circle cx="22" cy="40" r="2.5" fill="url(#dotGrad)"/>
        </g>
      </svg>
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

  const showOrnament =
    (rank === 1 && (isWinner || isLeading)) ||
    (rank === 2 && battleStatus !== 'UPCOMING' && submission.voteCount > 0)

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
    const isRunnerUpConfirmed = battleStatus === 'COMPLETED'
    return {
      animation: isRunnerUpConfirmed ? 'card-glow-silver 2.5s ease-in-out alternate infinite' : 'none',
      boxShadow: '0 0 10px 2px rgba(148, 163, 184, 0.15)',
      background: isRunnerUpConfirmed
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
