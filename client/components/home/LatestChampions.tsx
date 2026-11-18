'use client'

import Link from 'next/link'
import { useQuery } from '@apollo/client'
import { Crown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PersonAvatar } from '@/components/hall-of-fame/PersonAvatar'
import { GET_LATEST_CHAMPIONS } from '@/lib/graphql/hall-of-fame'
import { formatShortDate } from '@/lib/hall-of-fame-view'
import { buildLatestChampions, championHeadline, type HallOfFameWins, type LatestBattle } from '@/lib/latest-champions'
import { plural } from '@/lib/plural'

/**
 * The most recent battle winners, on the home page. It is a scoreboard: each card links to the
 * battle's result and there is nothing to follow or like. It is optional content, so while loading,
 * on an error, or with no results yet it shows nothing rather than an error on the front page.
 */
export function LatestChampions() {
  const { data } = useQuery<{ battles: LatestBattle[]; hallOfFame: HallOfFameWins[] }>(GET_LATEST_CHAMPIONS)
  const cards = data ? buildLatestChampions(data.battles, data.hallOfFame) : []
  if (cards.length === 0) return null

  return (
    <section aria-labelledby="latest-champions-title" className="w-full max-w-5xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Crown className="h-7 w-7 text-amber-500" aria-hidden="true" />
          <h2 id="latest-champions-title" className="text-2xl font-graffiti text-foreground md:text-3xl">
            Latest champions
          </h2>
        </div>
        <Link href="/hall-of-fame" className="whitespace-nowrap text-base font-semibold text-amber-500 hover:underline">
          Hall of Fame &rarr;
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3 md:gap-5">
        {cards.map((card) => {
          const { name, action } = championHeadline(card)
          return (
            <Link
              key={card.battleId}
              href={`/battles/${card.battleId}`}
              className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-amber-500 md:p-5"
            >
              <div className="flex items-center gap-3">
                <PersonAvatar user={card.winners[0]} size={52} highlighted />
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight md:text-xl" dir="auto">{name}</p>
                  <p className="text-base text-muted-foreground" dir="auto">{action}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-base text-muted-foreground">
                  {card.winningVotes !== null && <>{plural(card.winningVotes, 'vote')} · </>}
                  Ended {formatShortDate(card.endDate)}
                </span>
                {card.careerWins !== null && <Badge variant="upcoming">{plural(card.careerWins, 'career win')}</Badge>}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
