'use client'

import Link from 'next/link'
import { useQuery } from '@apollo/client'
import { Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GET_HALL_OF_FAME } from '@/lib/graphql/hall-of-fame'
import { displayName, formatShortDate, isTopThree, winRate, type Person } from '@/lib/hall-of-fame-view'
import { PersonAvatar } from './PersonAvatar'

interface Champion {
  rank: number
  wins: number
  battlesEntered: number
  lastWinAt: string
  user: Person
}

// One grid for the header and every row on wider screens, so the columns line up.
const GRID = 'md:grid md:grid-cols-[3rem_minmax(0,1fr)_5rem_6rem_6rem_7rem] md:items-center md:gap-4'

/** The Champions tab: everyone with at least one win, ranked by wins (the server decides the order and ranks). */
export function ChampionsTable() {
  const { loading, error, data } = useQuery<{ hallOfFame: Champion[] }>(GET_HALL_OF_FAME)

  if (loading) return <p className="py-12 text-center text-muted-foreground">Loading champions...</p>
  if (error) return <p className="py-12 text-center text-destructive">Error loading champions: {error.message}</p>

  const champions = data?.hallOfFame ?? []
  if (champions.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-base text-muted-foreground">No champions yet. Win a completed battle to be the first.</p>
        <Link href="/battles" className="text-base font-semibold text-amber-500 hover:underline">
          See the battles
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className={cn('hidden px-5 text-base font-semibold text-muted-foreground', GRID)} aria-hidden="true">
        <span>Rank</span>
        <span>DJ</span>
        <span className="text-right">Wins</span>
        <span className="text-right">Entered</span>
        <span className="text-right">Win rate</span>
        <span className="text-right">Last win</span>
      </div>

      {champions.map((c) => {
        const top = isTopThree(c.rank)
        const rate = winRate(c.wins, c.battlesEntered)
        return (
          <Link
            key={c.user.id}
            href={`/users/${c.user.id}`}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-4 py-3.5 transition-colors hover:border-amber-500 md:px-5',
              GRID,
              top ? 'border-amber-500/45 bg-amber-500/5' : 'border-border bg-card',
            )}
          >
            <span
              className={cn(
                'w-8 shrink-0 text-center font-graffiti text-2xl leading-none md:w-auto md:text-left md:text-3xl',
                top ? 'text-amber-500' : 'text-muted-foreground',
              )}
            >
              <span className="sr-only">Rank </span>
              {c.rank}
            </span>

            <div className="flex min-w-0 flex-1 items-center gap-3">
              <PersonAvatar user={c.user} highlighted={top} />
              <div className="min-w-0">
                <span className="flex items-center gap-2 text-lg font-bold leading-tight md:text-xl">
                  <span className="truncate" dir="auto">{displayName(c.user)}</span>
                  {c.rank === 1 && <Crown className="h-5 w-5 shrink-0 text-amber-500" aria-label="Top champion" role="img" />}
                </span>
                <span className="text-base text-muted-foreground md:hidden">
                  {c.battlesEntered} entered · {rate}
                </span>
              </div>
            </div>

            <span className="flex shrink-0 flex-col items-end md:block md:text-right">
              <span className="text-2xl font-bold leading-none text-amber-400">{c.wins}</span>
              <span className="text-base text-muted-foreground md:sr-only">{c.wins === 1 ? 'win' : 'wins'}</span>
            </span>
            <span className="hidden text-right text-base md:block">{c.battlesEntered}</span>
            <span className="hidden text-right text-base md:block">{rate}</span>
            <span className="hidden text-right text-base text-muted-foreground md:block">{formatShortDate(c.lastWinAt)}</span>
          </Link>
        )
      })}

      <p className="mt-1 text-base text-muted-foreground">
        Ranked by wins. Equal wins share a rank. A win means finishing first in a completed battle with at least one vote.
      </p>
    </div>
  )
}
