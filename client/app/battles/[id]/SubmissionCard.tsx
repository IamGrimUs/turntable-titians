'use client'

import { DELETE_VOTE_MUTATION, VOTE_MUTATION } from '@/lib/graphql/queries'
import { useMutation } from '@apollo/client'
import Link from 'next/link'
import { useState, type CSSProperties } from 'react'
import { getEmbedUrl } from './getEmbedUrl'
import { VideoModal } from './VideoModal'

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
  2: 'border-border',
  3: 'border-border'
}

const podiumBadge: Record<number, string> = {
  1: 'bg-amber-400 text-black',
  2: 'bg-slate-400 text-black',
  3: 'bg-amber-700 text-white'
}

function GraffitiCrown({ hidden }: { hidden: boolean }) {
  return (
    <img
      src="/crown.svg"
      alt=""
      style={{
        position: 'absolute',
        top: '-13%',
        left: '-22%',
        width: 180,
        height: 'auto',
        pointerEvents: 'none',
        zIndex: hidden ? -1 : 20,
        transform: hidden ? 'rotate(-0.08turn) translate(1%, 1%)' : 'rotate(-0.08turn) translate(0%, 0%)',
        transition: 'transform 0.3s ease'
      }}
    />
  )
}

export function SubmissionCard({ submission, rank, userVotedSubmissionId, currentUserId, onVoteChange, isLeading, isWinner, battleStatus }: Props) {
  const [vote, { loading: voting }] = useMutation(VOTE_MUTATION)
  const [deleteVote, { loading: deleting }] = useMutation(DELETE_VOTE_MUTATION)
  const [voteError, setVoteError] = useState('')
  const [cardHovered, setCardHovered] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

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
        animation: 'card-glow-gold 5s ease-in-out alternate infinite',
        boxShadow: '0 0 12px 3px rgba(251, 191, 36, 0.35)',
        background: 'radial-gradient(ellipse at top center, rgba(251,191,36,0.18) 0%, transparent 70%), hsl(var(--card))'
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
    <div className="relative isolate" onMouseEnter={() => setCardHovered(true)} onMouseLeave={() => setCardHovered(false)}>
      {showCrown && <GraffitiCrown hidden={cardHovered} />}
      <div className={`rounded-lg border-2 bg-card overflow-hidden relative ${isPodium ? podiumBorder[rank] : 'border-border'}`} style={cardGlowStyle}>
        {isWinner && <span className="absolute top-2 left-2 z-10 text-xs font-black px-2 py-0.5 rounded-full bg-amber-400 text-black">Winner</span>}

        {/* Video */}
        <div
          className="aspect-video bg-muted relative cursor-pointer"
          onClick={() => embedUrl && setIsModalOpen(true)}
        >
          {embedUrl ? (
            <>
              <iframe
                src={embedUrl}
                title={submission.title ?? 'Submission video'}
                className="w-full h-full pointer-events-none"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <button
                onClick={(e) => { e.stopPropagation(); setIsModalOpen(true) }}
                className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 border border-white/20 rounded px-2 py-1 text-white text-xs font-semibold z-10"
                aria-label="Watch fullscreen"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
                Watch
              </button>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <a href={submission.videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-amber-500 underline underline-offset-2">
                Watch video
              </a>
            </div>
          )}
        </div>

        {/* Card body */}
        <div className="p-4 space-y-3 relative">
          {isLeading && !isWinner && submission.voteCount > 0 && <span className="absolute top-4 right-4 z-10 text-xs font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">Leading</span>}
          {rank === 2 && submission.voteCount > 0 && <span className="absolute top-4 right-4 z-10 text-xs font-black px-2 py-0.5 rounded-full bg-slate-400 text-black">#2</span>}
          {rank === 3 && submission.voteCount > 0 && <span className={`absolute top-4 right-4 z-10 text-xs font-black px-2 py-0.5 rounded-full ${podiumBadge[rank]}`}>#{rank}</span>}
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

      {isModalOpen && embedUrl && (
        <VideoModal
          embedUrl={embedUrl}
          title={submission.title}
          user={submission.user}
          voteCount={submission.voteCount}
          isVotedHere={isVotedHere}
          hasVotedElsewhere={hasVotedElsewhere}
          loading={loading}
          battleStatus={battleStatus}
          currentUserId={currentUserId}
          onVote={handleVote}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  )
}
