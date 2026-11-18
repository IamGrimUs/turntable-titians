'use client'

import Link from 'next/link'
import { useQuery } from '@apollo/client'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { GET_MY_CHALLENGES } from '@/lib/graphql/challenges'
import { myChallengesSections, type MyChallengeInput } from '@/lib/profile-challenges'

/**
 * "Your challenges" on your own profile: waiting for your answer, sent, and recent. There is no
 * inbox page, so this is where challenges are found. Hidden entirely when there is nothing to show.
 * Every row links to the challenge screen (answer or withdraw there). The query never asks for a
 * message, video link or email.
 */
export function MyChallenges() {
  // cache-and-network: a visit to the profile always checks for challenges that arrived since.
  const { data, error } = useQuery<{ myChallenges: MyChallengeInput[] }>(GET_MY_CHALLENGES, {
    fetchPolicy: 'cache-and-network',
  })

  if (!data && error) {
    return <p className="mb-4 text-base text-muted-foreground">Couldn&apos;t load your challenges.</p>
  }

  const sections = myChallengesSections(data?.myChallenges)
  if (sections.length === 0) return null

  return (
    <section aria-labelledby="my-challenges-heading" className="mb-4">
      <h2 id="my-challenges-heading" className="mb-3 text-2xl font-graffiti text-foreground">
        Your challenges
      </h2>
      <div className="space-y-4">
        {sections.map((section) => (
          <Card key={section.key} className="p-4">
            <h3 className="mb-2 text-base font-bold uppercase tracking-widest text-muted-foreground">
              {section.title}
            </h3>
            <ul className="divide-y divide-border/60">
              {section.rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={row.href}
                    className="flex items-center gap-3 rounded-md py-3 transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-base font-semibold text-foreground">{row.title}</span>
                      <span className="block break-words text-base text-muted-foreground">with {row.otherName}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant={row.badgeVariant}>{row.statusLabel}</Badge>
                        {row.timeLeft && <span className="text-base text-muted-foreground">{row.timeLeft}</span>}
                      </span>
                    </span>
                    {row.actionLabel ? (
                      <span className="shrink-0 rounded-md bg-amber-500 px-4 py-2 text-base font-black uppercase tracking-widest text-black">
                        {row.actionLabel}
                      </span>
                    ) : (
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  )
}
