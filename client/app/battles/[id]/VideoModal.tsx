'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface SubmissionUser {
  id: string
  username: string | null
  name: string | null
  image: string | null
}

interface Props {
  embedUrl: string
  title: string | null
  user: SubmissionUser
  voteCount: number
  isVotedHere: boolean
  hasVotedElsewhere: boolean
  loading: boolean
  battleStatus: 'UPCOMING' | 'ACTIVE' | 'COMPLETED'
  currentUserId: string | null
  onVote: () => void
  onClose: () => void
}

export function VideoModal({
  embedUrl,
  title,
  user,
  voteCount,
  isVotedHere,
  hasVotedElsewhere,
  loading,
  battleStatus,
  currentUserId,
  onVote,
  onClose,
}: Props) {
  const displayName = user.username ?? user.name ?? 'DJ'
  const initial = displayName.charAt(0).toUpperCase()

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end mb-2">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
            aria-label="Close video"
          >
            ✕
          </button>
        </div>

        <div className="aspect-video w-full bg-muted rounded-lg overflow-hidden">
          <iframe
            src={embedUrl}
            title={title ?? 'Submission video'}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        <div className="flex items-center justify-between mt-3 px-1">
          <div>
            {title && (
              <p className="text-sm font-bold text-foreground">{title}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {user.image ? (
                <img
                  src={user.image}
                  alt={displayName}
                  className="w-6 h-6 rounded-full object-cover border border-border"
                />
              ) : (
                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 text-xs font-bold flex items-center justify-center border border-amber-500/30">
                  {initial}
                </span>
              )}
              <span className="text-xs font-semibold text-muted-foreground">
                {displayName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-mono">
              {voteCount}
            </span>
            {currentUserId && battleStatus === 'ACTIVE' && (
              <button
                onClick={(e) => { e.stopPropagation(); onVote() }}
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
      </div>
    </div>,
    document.body
  )
}
