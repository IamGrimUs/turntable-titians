'use client'

import { DELETE_VOTE_MUTATION, VOTE_MUTATION } from '@/lib/graphql/queries'
import { useMutation } from '@apollo/client'
import Link from 'next/link'
import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { getEmbedUrl } from './getEmbedUrl'
import { VoteCount } from '@/components/VoteCount'
import { propsButtonLabel } from '@/lib/props-button'
import { OWN_ENTRY_NOTE, ownEntryBlocksVote } from '@/lib/own-entry'
import { VideoModal } from './VideoModal'
import type { EntryStyle } from '@/lib/battle-entry-style'

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

interface Props {
  submission: Submission
  /** Crown, rank badge and podium border, decided by `entryStyle` (never by this card). */
  style: EntryStyle
  userVotedSubmissionId: string | null
  currentUserId: string | null
  onVoteChange: () => void
  battleStatus: 'UPCOMING' | 'ACTIVE' | 'COMPLETED'
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

export function SubmissionCard({ submission, style, userVotedSubmissionId, currentUserId, onVoteChange, battleStatus }: Props) {
  const [vote, { loading: voting }] = useMutation(VOTE_MUTATION)
  const [deleteVote, { loading: deleting }] = useMutation(DELETE_VOTE_MUTATION)
  const [voteError, setVoteError] = useState('')
  const [cardHovered, setCardHovered] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  // The expanded video renders in a portal, which React still counts as "inside" this card, so
  // the card never sees the mouse leave. While the modal is open the thumbnail must be still.
  const previewActive = cardHovered && !isModalOpen
  const [hasBeenHovered, setHasBeenHovered] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [])

  const embedUrl = getEmbedUrl(submission.videoUrl)
  const videoId = embedUrl?.split('/').pop() || null
  const hoverEmbedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}`
    : null

  // Styling comes from `entryStyle`: the crown only for the winners the server names, rank badges
  // only once results are revealed and no runoff is deciding the top spot.
  const { isWinner, badge } = style
  const isVotedHere = userVotedSubmissionId === submission.id
  const hasVotedElsewhere = userVotedSubmissionId !== null && !isVotedHere
  const ownEntryBlocked = ownEntryBlocksVote({
    currentUserId,
    entryOwnerId: submission.user.id,
    isVotedHere,
  })
  const displayName = submission.user.username ?? submission.user.name ?? 'DJ'
  const initial = displayName.charAt(0).toUpperCase()
  const loading = voting || deleting

  const showCrown = isWinner

  const cardGlowStyle: CSSProperties = (() => {
    if (isWinner) {
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
    <div
      className="relative isolate"
      onMouseEnter={() => {
        setCardHovered(true)
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = setTimeout(() => setHasBeenHovered(true), 250)
      }}
      onMouseLeave={() => {
        setCardHovered(false)
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current)
          hoverTimerRef.current = null
        }
      }}
    >
      {showCrown && <GraffitiCrown hidden={previewActive} />}
      <div className={`rounded-lg border-2 bg-card overflow-hidden relative ${isWinner || style.podium ? 'border-amber-400' : 'border-border'}`} style={cardGlowStyle}>
        {/* Video */}
        <div
          className="aspect-video bg-muted relative cursor-pointer"
          onClick={() => embedUrl && setIsModalOpen(true)}
        >
          {badge === 'RANK_2' && <span className="absolute bottom-2 right-2 z-10 text-base font-black px-2 py-0.5 rounded-full bg-slate-400 text-black">#2</span>}
          {badge === 'RANK_3' && <span className="absolute bottom-2 right-2 z-10 text-base font-black px-2 py-0.5 rounded-full bg-amber-700 text-white">#3</span>}
          {embedUrl ? (
            <>
              <img
                src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                alt={submission.title ?? 'Submission thumbnail'}
                className={`w-full h-full object-cover absolute inset-0 z-0 transition-opacity duration-300 ${previewActive && hasBeenHovered ? 'opacity-0' : 'opacity-100'}`}
              />
              {hasBeenHovered && hoverEmbedUrl && !isModalOpen && (
                <iframe
                  src={hoverEmbedUrl}
                  allow="autoplay"
                  title={submission.title ?? 'Video preview'}
                  style={{ border: 'none' }}
                  className={`w-full h-full absolute inset-0 z-[1] transition-opacity duration-300 pointer-events-none ${previewActive ? 'opacity-100' : 'opacity-0'}`}
                  tabIndex={-1}
                />
              )}
              {!previewActive && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-black/60 border border-white/20 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <a href={submission.videoUrl} target="_blank" rel="noopener noreferrer" className="text-base text-amber-500 underline underline-offset-2">
                Watch video
              </a>
            </div>
          )}
        </div>

        {/* Card body */}
        <div className="p-4 space-y-3 relative">
          {submission.title && <p className="text-base font-bold text-foreground leading-snug">{submission.title}</p>}
          {submission.description && <p className="text-base text-muted-foreground leading-relaxed">{submission.description}</p>}

          {/* DJ info + vote */}
          <div className="flex items-center justify-between pt-1">
            <Link href={`/users/${submission.user.id}`} className="flex min-w-0 items-center gap-2 group">
              {submission.user.image ? (
                <img src={submission.user.image} alt={displayName} className="w-7 h-7 rounded-full object-cover border border-border" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-500 text-base font-bold flex items-center justify-center border border-amber-500/30">{initial}</span>
              )}
              <span className="truncate text-base font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{displayName}</span>
            </Link>

            <VoteCount voteCount={submission.voteCount} className="text-base text-muted-foreground font-mono" />
          </div>

          {/* On its own line; the stack's gap keeps the spacing above it equal to the other rows. */}
          {currentUserId && battleStatus === 'ACTIVE' && ownEntryBlocked && (
            <p className="text-base text-muted-foreground">{OWN_ENTRY_NOTE}</p>
          )}
          {currentUserId && battleStatus === 'ACTIVE' && !ownEntryBlocked && (
            <button
              onClick={handleVote}
              disabled={hasVotedElsewhere || loading}
              aria-pressed={isVotedHere}
              className={`w-full text-base font-black uppercase tracking-widest px-3 py-1.5 rounded-md transition-all disabled:cursor-not-allowed ${
                isVotedHere ? 'bg-amber-500 text-black hover:bg-amber-400' : hasVotedElsewhere ? 'bg-muted text-muted-foreground opacity-50' : 'border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black'
              }`}>
              {propsButtonLabel({ loading, isVotedHere })}
            </button>
          )}
          {voteError && <p className="text-base text-red-400">{voteError}</p>}
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
          ownEntryBlocked={ownEntryBlocked}
          loading={loading}
          battleStatus={battleStatus}
          currentUserId={currentUserId}
          onVote={handleVote}
          onClose={() => { setIsModalOpen(false); setHasBeenHovered(false) }}
        />
      )}
    </div>
  )
}
