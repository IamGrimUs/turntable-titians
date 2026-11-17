'use client'

import { useMutation, useQuery } from '@apollo/client'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { IdeaCard } from '@/components/board/IdeaCard'
import { PostIdeaForm } from '@/components/board/PostIdeaForm'
import { Button } from '@/components/ui/button'
import { isAdminRole } from '@/lib/admin-access'
import {
  CATEGORY_TABS,
  IDEA_STATUSES,
  IDEA_TOPICS,
  boardAccess,
  statusLabel,
  topicLabel,
  type IdeaCategory,
  type IdeaRow,
  type IdeaStatus,
  type IdeaTopic,
} from '@/lib/board-view'
import { boardListState } from '@/lib/board-list-state'
import { GET_IDEAS, UNVOTE_IDEA, VOTE_IDEA } from '@/lib/graphql/board'
import { fieldClass, labelClass } from '@/lib/form-styles'

// Matches the server's default page size for `ideas`.
const PAGE_SIZE = 20

type IdeaSort = 'VOTES' | 'NEWEST'

const SORT_OPTIONS: Array<{ value: IdeaSort; label: string }> = [
  { value: 'VOTES', label: 'Most voted' },
  { value: 'NEWEST', label: 'Newest' },
]

interface IdeasPage {
  rows: IdeaRow[]
  total: number
  page: number
  pageCount: number
}

const CHIP_BASE = 'px-3 py-1 rounded-full border text-base font-medium transition-colors'
const CHIP_IDLE = 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
const CHIP_ACTIVE = 'border-foreground/60 bg-foreground/10 text-foreground'

export default function BoardPage() {
  const { data: session, status: sessionStatus } = useSession()
  const sessionLoading = sessionStatus === 'loading'
  const access = boardAccess(session?.user)
  // Only decides whether the Show hidden toggle is drawn; the server decides who gets hidden ideas.
  const isAdmin = isAdminRole(session?.user?.role)

  const [category, setCategory] = useState<IdeaCategory | null>(null)
  const [topic, setTopic] = useState<IdeaTopic | null>(null)
  const [status, setStatus] = useState<IdeaStatus | null>(null)
  const [sort, setSort] = useState<IdeaSort>('VOTES')
  const [page, setPage] = useState(1)
  const [showHidden, setShowHidden] = useState(false)
  const [voteError, setVoteError] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)

  const { loading, error, data, previousData, refetch } = useQuery<{ ideas: IdeasPage }>(GET_IDEAS, {
    // `includeHidden` is only ever true for an admin who turned the toggle on (the server ignores it for anyone else).
    variables: { category, topic, status, sort, includeHidden: isAdmin && showHidden, page, pageSize: PAGE_SIZE },
  })
  const [voteIdea] = useMutation(VOTE_IDEA)
  const [unvoteIdea] = useMutation(UNVOTE_IDEA)

  // Keep showing the previous page of results while a new filter or page loads.
  const ideas = (data ?? previousData)?.ideas
  const listState = boardListState({
    hasError: !!error,
    hasData: !!data,
    hasPrevious: !!previousData,
    loading,
    rowCount: ideas?.rows.length ?? 0,
  })

  // Any filter or sort change starts again from page 1.
  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }
  const changeCategory = change(setCategory)
  const changeTopic = change(setTopic)
  const changeStatus = change(setStatus)
  const changeSort = change(setSort)

  // Close the form and show the new idea: newest first, no filters, first page. (The form has
  // already refetched the list; this makes sure the idea is not hidden by the current view.)
  function handlePosted() {
    setPosting(false)
    setCategory(null)
    setTopic(null)
    setStatus(null)
    setSort('NEWEST')
    setPage(1)
  }

  async function toggleVote(idea: IdeaRow) {
    setVoteError(null)
    try {
      // The mutation result (id, voteCount, viewerHasVoted) updates the normalized `Idea:<id>`
      // in Apollo's cache, so the card re-renders without a refetch.
      await (idea.viewerHasVoted ? unvoteIdea : voteIdea)({ variables: { ideaId: idea.id } })
    } catch (e) {
      setVoteError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      // The cached vote state may be stale (for example it was changed in another tab): reload the
      // list so the button corrects itself. A failing reload must not replace the message above.
      refetch().catch(() => {})
    }
  }

  const pageCount = ideas?.pageCount ?? 1
  const currentPage = ideas?.page ?? page

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-5xl font-graffiti mb-2 text-foreground">Board</h1>
          <p className="text-muted-foreground text-base">Suggest features, report bugs and vote on what the site should do next.</p>
        </div>
        {sessionLoading ? null : access === 'READY' ? (
          !posting && <Button onClick={() => setPosting(true)}>Post an idea</Button>
        ) : (
          <Button asChild>
            <Link href={access === 'ANONYMOUS' ? '/auth/signin' : '/onboarding'}>
              {access === 'ANONYMOUS' ? 'Sign in to post an idea' : 'Choose a username to post'}
            </Link>
          </Button>
        )}
      </div>

      {access === 'READY' && posting && <PostIdeaForm onPosted={handlePosted} onCancel={() => setPosting(false)} />}

      <div className="flex items-center gap-2 mb-4 flex-wrap" role="group" aria-label="Category">
        {CATEGORY_TABS.map((tab) => {
          const isActive = category === tab.value
          return (
            <button key={tab.label} type="button" aria-pressed={isActive} onClick={() => changeCategory(tab.value)} className={`${CHIP_BASE} ${isActive ? CHIP_ACTIVE : CHIP_IDLE}`}>
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="grid gap-4 mb-6 sm:grid-cols-3">
        <div className="min-w-0">
          <label htmlFor="board-topic" className={labelClass}>
            Topic
          </label>
          <select id="board-topic" value={topic ?? ''} onChange={(e) => changeTopic((e.target.value || null) as IdeaTopic | null)} className={`${fieldClass} mt-1`}>
            <option value="">All topics</option>
            {IDEA_TOPICS.map((t) => (
              <option key={t} value={t}>
                {topicLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="board-status" className={labelClass}>
            Status
          </label>
          <select id="board-status" value={status ?? ''} onChange={(e) => changeStatus((e.target.value || null) as IdeaStatus | null)} className={`${fieldClass} mt-1`}>
            <option value="">All statuses</option>
            {IDEA_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="board-sort" className={labelClass}>
            Sort
          </label>
          <select id="board-sort" value={sort} onChange={(e) => changeSort(e.target.value as IdeaSort)} className={`${fieldClass} mt-1`}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isAdmin && (
        <label className="mb-4 flex min-h-11 items-center gap-3 text-base text-foreground">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => {
              setShowHidden(e.target.checked)
              setPage(1)
            }}
            className="h-5 w-5 shrink-0 accent-amber-500"
          />
          Show hidden ideas
        </label>
      )}

      {voteError && (
        <p role="alert" className="mb-4 text-base text-destructive">
          {voteError}
        </p>
      )}

      {listState === 'error' ? (
        <div className="text-center py-16">
          <p role="alert" className="text-destructive mb-4">
            Error loading ideas: {error?.message}
          </p>
          <Button variant="outline" onClick={() => refetch().catch(() => {})}>
            Retry
          </Button>
        </div>
      ) : listState === 'loading' || !ideas ? (
        <p className="text-muted-foreground text-center py-16">Loading ideas...</p>
      ) : listState === 'empty' ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">{category || topic || status ? 'No ideas match these filters.' : 'No ideas yet.'}</p>
        </div>
      ) : (
        <>
          <div className={`flex flex-col gap-4 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {ideas.rows.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} access={access} onToggleVote={toggleVote} isAdmin={isAdmin} sessionLoading={sessionLoading} />
            ))}
          </div>

          {pageCount > 1 && (
            <nav className="flex items-center justify-between gap-4 mt-8" aria-label="Pagination">
              <Button variant="outline" disabled={currentPage <= 1 || loading} onClick={() => setPage(currentPage - 1)}>
                Previous
              </Button>
              <span className="text-base text-muted-foreground">
                Page {currentPage} of {pageCount}
              </span>
              <Button variant="outline" disabled={currentPage >= pageCount || loading} onClick={() => setPage(currentPage + 1)}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
