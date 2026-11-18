'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@apollo/client'
import { Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GET_BATTLE_RESULTS } from '@/lib/graphql/hall-of-fame'
import {
  RESULTS_PAGE_SIZE,
  buildResultRows,
  displayName,
  formatShortDate,
  groupRowsByMonth,
  noWinnerText,
  resultTypes,
  type ResultBattle,
} from '@/lib/hall-of-fame-view'
import { plural } from '@/lib/plural'
import { PersonAvatar } from './PersonAvatar'

const CHIP = 'rounded-full border px-4 py-2 text-base font-semibold transition-colors'
const CHIP_ON = 'border-amber-500 bg-amber-500 text-black'
const CHIP_OFF = 'border-border text-foreground hover:border-foreground/40'

/** The Battle results tab: completed battles, newest first, with who won each. */
export function BattleResults() {
  const { loading, error, data } = useQuery<{ battles: ResultBattle[] }>(GET_BATTLE_RESULTS)
  const [type, setType] = useState<string | null>(null)
  const [shown, setShown] = useState(RESULTS_PAGE_SIZE)

  if (loading) return <p className="py-12 text-center text-muted-foreground">Loading results...</p>
  if (error) return <p className="py-12 text-center text-destructive">Error loading results: {error.message}</p>

  const battles = data?.battles ?? []
  const types = resultTypes(battles)
  // A chosen type that has no completed battles any more falls back to showing everything.
  const selected = type !== null && types.includes(type) ? type : null
  const rows = buildResultRows(battles, selected)

  if (rows.length === 0 && selected === null) {
    return <p className="py-12 text-center text-base text-muted-foreground">No battles have finished yet.</p>
  }

  const visible = rows.slice(0, shown)
  const months = groupRowsByMonth(visible)

  function choose(next: string | null) {
    setType(next)
    setShown(RESULTS_PAGE_SIZE)
  }

  return (
    <div className="flex flex-col gap-6">
      {types.length > 1 && (
        <div role="group" aria-label="Filter by battle type" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={selected === null} onClick={() => choose(null)} className={cn(CHIP, selected === null ? CHIP_ON : CHIP_OFF)}>
            All types
          </button>
          {types.map((t) => (
            <button key={t} type="button" aria-pressed={selected === t} onClick={() => choose(selected === t ? null : t)} className={cn(CHIP, selected === t ? CHIP_ON : CHIP_OFF)}>
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-8">
        {months.map((month) => (
          <section key={month.label} className="flex flex-col gap-3">
            <h2 className="mb-1 border-b border-border pb-2 text-base font-semibold uppercase tracking-widest text-muted-foreground">
              {month.label}
            </h2>
            {month.rows.map((row) => (
              <Link
                key={row.id}
                href={`/battles/${row.id}`}
                className="flex flex-col gap-3.5 rounded-lg border border-border bg-card px-4 py-4 transition-colors hover:border-amber-500 md:flex-row md:items-center md:gap-6 md:px-5"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-base font-semibold text-muted-foreground md:hidden">{formatShortDate(row.endDate)}</span>
                  <div className="flex items-center gap-6">
                    <span className="hidden w-14 shrink-0 text-base font-semibold text-muted-foreground md:block">
                      {formatShortDate(row.endDate)}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold leading-tight" dir="auto">{row.title}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{row.type}</Badge>
                        {row.runoff?.status === 'OPEN' && <Badge variant="runoff">{row.runoff.label}</Badge>}
                        {row.tie && <Badge variant="upcoming">Tie</Badge>}
                        <span className="text-base text-muted-foreground">{plural(row.entries, 'entry', 'entries')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 border-t border-border pt-3.5 md:w-72 md:shrink-0 md:border-t-0 md:pt-0">
                  {row.runoff?.status === 'OPEN' ? (
                    <span className="text-base font-semibold text-foreground" dir="auto">{row.runoff.line}</span>
                  ) : row.noWinner ? (
                    <span className="text-base text-muted-foreground">{noWinnerText(row.entries)}</span>
                  ) : (
                    row.winners.map((w) => (
                      <div key={w.user.id} className="flex items-center gap-3">
                        <Crown className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
                        <PersonAvatar user={w.user} size={40} highlighted />
                        <div className="min-w-0">
                          <span className="block truncate text-lg font-bold leading-tight" dir="auto">{displayName(w.user)}</span>
                          {w.votes !== null && <span className="text-base text-muted-foreground">{plural(w.votes, 'vote')}</span>}
                        </div>
                      </div>
                    ))
                  )}
                  {row.runoff && row.runoff.status !== 'OPEN' && (
                    <span className="text-base text-muted-foreground" dir="auto">{row.runoff.line}</span>
                  )}
                </div>
              </Link>
            ))}
          </section>
        ))}
      </div>

      {rows.length > visible.length && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setShown((n) => n + RESULTS_PAGE_SIZE)}>
            Show earlier battles
          </Button>
        </div>
      )}
    </div>
  )
}
