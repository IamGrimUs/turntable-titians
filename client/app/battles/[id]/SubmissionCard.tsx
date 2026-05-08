'use client'

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

export function SubmissionCard({ submission, rank, userVotedSubmissionId, currentUserId, onVoteChange }: Props) {
  const [vote, { loading: voting }] = useMutation(VOTE_MUTATION)
  const [deleteVote, { loading: deleting }] = useMutation(DELETE_VOTE_MUTATION)

  const embedUrl = getEmbedUrl(submission.videoUrl)
  const isPodium = rank <= 3
  const isVotedHere = userVotedSubmissionId === submission.id
  const hasVotedElsewhere = userVotedSubmissionId !== null && !isVotedHere
  const displayName = submission.user.username ?? submission.user.name ?? 'DJ'
  const initial = displayName.charAt(0).toUpperCase()
  const loading = voting || deleting

  async function handleVote() {
    try {
      if (isVotedHere) {
        await deleteVote({ variables: { submissionId: submission.id } })
      } else {
        await vote({ variables: { submissionId: submission.id } })
      }
      onVoteChange()
    } catch {
      // swallow — parent refetch will correct state
    }
  }

  return (
    <div
      className={`rounded-lg border bg-card overflow-hidden relative ${
        isPodium ? podiumBorder[rank] : 'border-border'
      }`}
    >
      {isPodium && (
        <span
          className={`absolute top-2 right-2 z-10 text-xs font-black px-2 py-0.5 rounded-full ${podiumBadge[rank]}`}
        >
          #{rank}
        </span>
      )}

      {/* Video */}
      <div className="aspect-video bg-muted">
        {embedUrl ? (
          <iframe
            src={embedUrl}
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
            {currentUserId && (
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
      </div>
    </div>
  )
}
