'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card'
import { GET_BATTLES } from '@/lib/graphql/queries'
import { groupBattlesByType } from '@/lib/battle-groups'
import { battleCardView } from '@/lib/battle-card-view'
import type { ListRunoff, Person } from '@/lib/hall-of-fame-view'
import { Crown, Plus } from 'lucide-react'
import { useQuery } from '@apollo/client'
import Link from 'next/link'
import { useState } from 'react'

// The fields GET_BATTLES returns that this page uses.
interface Participant {
  id: string
  user: { id: string; username: string | null; name: string | null; image: string | null }
}
interface BattleSummary {
  id: string
  title: string
  type: string | null
  description: string | null
  startDate: string
  endDate: string
  status: string
  winners: Person[] | null
  runoff: ListRunoff | null
  submissions: Participant[] | null
}

function ParticipantAvatars({ submissions }: { submissions: Participant[] }) {
  const MAX_SHOWN = 5
  const participants = submissions.slice(0, MAX_SHOWN)
  const overflow = submissions.length - MAX_SHOWN

  if (submissions.length === 0) return null

  return (
    <div className="flex items-center">
      {participants.map((sub, i) => {
        const user = sub.user
        const initials = (user.username ?? user.name ?? 'DJ').slice(0, 2).toUpperCase()
        return (
          <div key={sub.id} className={`w-[34px] h-[34px] rounded-full border-2 border-card overflow-hidden flex items-center justify-center bg-muted text-muted-foreground text-base font-medium shrink-0 ${i > 0 ? '-ml-3' : ''}`} title={user.username ?? user.name ?? 'DJ'}>
            {user.image ? <img src={user.image} alt={initials} className="w-full h-full object-cover" /> : initials}
          </div>
        )
      })}
      {overflow > 0 && <div className="-ml-3 w-[34px] h-[34px] rounded-full border-2 border-card bg-muted flex items-center justify-center text-base text-muted-foreground font-medium shrink-0">+{overflow}</div>}
    </div>
  )
}

function BattleCard({ battle }: { battle: BattleSummary }) {
  const submissionCount = battle.submissions?.length || 0
  const { statusLabel, statusVariant, winnerLine: winners, runoffLine } = battleCardView(battle)

  return (
    <Link href={`/battles/${battle.id}`} className="block h-full">
      <Card className="h-full flex flex-col hover:border-border transition-all cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-3">
            <h2 className="text-3xl font-graffiti">{battle.title}</h2>
            <Badge variant={statusVariant} className="shrink-0">
              {statusLabel}
            </Badge>
          </div>
          {battle.description && <CardDescription className="line-clamp-2 text-base mt-2">{battle.description}</CardDescription>}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col gap-2 text-base text-muted-foreground">
            <div className="flex gap-4">
              <span>Start: {new Date(battle.startDate).toLocaleDateString()}</span>
              <span>End: {new Date(battle.endDate).toLocaleDateString()}</span>
            </div>
            {runoffLine && (
              <p className={`flex items-center gap-2 font-semibold ${runoffLine.crown ? 'text-amber-400' : 'text-foreground'}`}>
                {runoffLine.crown && <Crown className="h-4 w-4 shrink-0" aria-hidden="true" />}
                <span dir="auto">{runoffLine.text}</span>
              </p>
            )}
            {winners && (
              <p className="flex items-center gap-2 font-semibold text-amber-400">
                <Crown className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span dir="auto">{winners}</span>
              </p>
            )}
          </div>
        </CardContent>
        {/* mt-auto pins the avatars and submission count to the bottom of every card, whatever the title and description take. */}
        <CardFooter className="mt-auto pt-3 flex flex-col items-start gap-2">
          <ParticipantAvatars submissions={battle.submissions ?? []} />
          <span className="text-base text-muted-foreground">
            {submissionCount} {submissionCount === 1 ? 'submission' : 'submissions'}
          </span>
        </CardFooter>
      </Card>
    </Link>
  )
}

const FILTER_STYLES = {
  all: {
    base: 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
    active: 'border-foreground/60 bg-foreground/10 text-foreground'
  },
  type: {
    base: 'border-amber-500/30 text-amber-600 hover:bg-amber-500/10',
    active: 'border-amber-500/60 bg-amber-500/20 text-amber-400'
  }
}

export default function BattlesPage() {
  const [activeType, setActiveType] = useState<string | null>(null)
  const { loading, error, data } = useQuery(GET_BATTLES)

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-full p-8">
        <p className="text-muted-foreground">Loading battles...</p>
      </div>
    )

  if (error)
    return (
      <div className="flex items-center justify-center min-h-full p-8">
        <p className="text-destructive">Error loading battles: {error.message}</p>
      </div>
    )

  const battles: BattleSummary[] = data?.battles || []

  // One section per battle type; Active battles first inside each (see lib/battle-groups.ts).
  const groups = groupBattlesByType(battles)
  const hasAny = battles.length > 0
  // A chosen type that no longer has battles (they were deleted) falls back to showing everything.
  const selected = groups.some((g) => g.type === activeType) ? activeType : null
  const visibleGroups = selected ? groups.filter((g) => g.type === selected) : groups

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-5xl font-graffiti mb-2 text-foreground">Battles</h1>
          <p className="text-muted-foreground text-base">
            Compete, submit your sets, and vote for the winners.{' '}
            <Link href="/how-it-works" className="text-amber-500 font-semibold hover:underline">
              How it works
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/hall-of-fame"
            className="flex items-center gap-2 rounded-md border border-amber-500/40 px-4 py-2 text-base font-semibold text-amber-500 transition-colors hover:bg-amber-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
          >
            <Crown className="h-5 w-5" aria-hidden="true" />
            Hall of Fame
          </Link>
          <Button asChild variant="default">
            <Link href="/battles/create">
              <Plus className="h-5 w-5" aria-hidden="true" />
              Create Battle
            </Link>
          </Button>
        </div>
      </div>

      {hasAny && (
        <div className="flex items-center gap-2 mb-8 flex-wrap">
          <button onClick={() => setActiveType(null)} className={`px-3 py-1 rounded-full border text-base font-medium transition-colors ${selected === null ? FILTER_STYLES.all.active : FILTER_STYLES.all.base}`}>
            All · {battles.length}
          </button>
          {groups.map(({ type, battles: inType }) => {
            const isActive = selected === type
            return (
              <button key={type} onClick={() => setActiveType(isActive ? null : type)} className={`px-3 py-1 rounded-full border text-base font-medium transition-colors ${isActive ? FILTER_STYLES.type.active : FILTER_STYLES.type.base}`}>
                {type} · {inType.length}
              </button>
            )
          })}
        </div>
      )}

      {!hasAny ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-6">No battles yet</p>
          <Button asChild variant="default">
            <Link href="/battles/create">Create First Battle</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {visibleGroups.map(({ type, battles: inType }) => (
            <section key={type}>
              <h2 className="text-base font-semibold uppercase tracking-widest text-muted-foreground mb-4">{type}</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {inType.map((battle) => (
                  <BattleCard key={battle.id} battle={battle} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
