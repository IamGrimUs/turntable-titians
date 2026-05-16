'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card'
import { GET_BATTLES } from '@/lib/graphql/queries'
import { useQuery } from '@apollo/client'
import Link from 'next/link'
import { useState } from 'react'

function ParticipantAvatars({ submissions }: { submissions: any[] }) {
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
          <div key={sub.id} className={`w-[34px] h-[34px] rounded-full border-2 border-card overflow-hidden flex items-center justify-center bg-muted text-muted-foreground text-xs font-medium shrink-0 ${i > 0 ? '-ml-3' : ''}`} title={user.username ?? user.name ?? 'DJ'}>
            {user.image ? <img src={user.image} alt={initials} className="w-full h-full object-cover" /> : initials}
          </div>
        )
      })}
      {overflow > 0 && <div className="-ml-3 w-[34px] h-[34px] rounded-full border-2 border-card bg-muted flex items-center justify-center text-xs text-muted-foreground font-medium shrink-0">+{overflow}</div>}
    </div>
  )
}

function BattleCard({ battle }: { battle: any }) {
  const submissionCount = battle.submissions?.length || 0
  const statusVariantMap: Record<string, 'upcoming' | 'active' | 'completed'> = {
    UPCOMING: 'upcoming',
    ACTIVE: 'active',
    COMPLETED: 'completed'
  }

  const statusVariant = statusVariantMap[battle.status] || 'upcoming'

  return (
    <Link href={`/battles/${battle.id}`} className="block h-full">
      <Card className="h-full hover:border-border transition-all cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-3">
            <h2 className="text-3xl font-graffiti">{battle.title}</h2>
            <Badge variant={statusVariant} className="shrink-0">
              {battle.status}
            </Badge>
          </div>
          {battle.description && <CardDescription className="line-clamp-2 text-xs mt-2">{battle.description}</CardDescription>}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col gap-2 text-xs text-muted-foreground">
            <div className="flex gap-4">
              <span>Start: {new Date(battle.startDate).toLocaleDateString()}</span>
              <span>End: {new Date(battle.endDate).toLocaleDateString()}</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-3 flex flex-col items-start gap-2">
          <ParticipantAvatars submissions={battle.submissions ?? []} />
          <span className="text-xs text-muted-foreground">
            {submissionCount} {submissionCount === 1 ? 'submission' : 'submissions'}
          </span>
        </CardFooter>
      </Card>
    </Link>
  )
}

const FILTER_STYLES: Record<string, { base: string; active: string }> = {
  ALL: { base: 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30', active: 'border-foreground/60 bg-foreground/10 text-foreground' },
  ACTIVE: { base: 'border-green-500/30 text-green-600 hover:bg-green-500/10', active: 'border-green-500/60 bg-green-500/20 text-green-400' },
  UPCOMING: { base: 'border-amber-500/30 text-amber-600 hover:bg-amber-500/10', active: 'border-amber-500/60 bg-amber-500/20 text-amber-400' },
  COMPLETED: { base: 'border-slate-500/30 text-slate-500 hover:bg-slate-500/10', active: 'border-slate-500/60 bg-slate-500/20 text-slate-400' }
}

export default function BattlesPage() {
  const [activeFilter, setActiveFilter] = useState<'ACTIVE' | 'UPCOMING' | 'COMPLETED' | null>(null)
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

  const battles = data?.battles || []

  const STATUS_ORDER = ['ACTIVE', 'UPCOMING', 'COMPLETED'] as const
  const STATUS_LABELS: Record<string, string> = {
    ACTIVE: 'Active',
    UPCOMING: 'Upcoming',
    COMPLETED: 'Completed'
  }

  const grouped = STATUS_ORDER.reduce<Record<string, any[]>>((acc, status) => {
    acc[status] = battles.filter((b: any) => b.status === status)
    return acc
  }, {})

  const hasAny = battles.length > 0
  const visibleStatuses = activeFilter ? [activeFilter] : STATUS_ORDER

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-5xl font-graffiti mb-2 text-foreground">Battles</h1>
        <p className="text-muted-foreground text-sm">Compete, submit your sets, and vote for the winners</p>
      </div>

      {hasAny && (
        <div className="flex items-center gap-2 mb-8 flex-wrap">
          <button onClick={() => setActiveFilter(null)} className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${activeFilter === null ? FILTER_STYLES.ALL.active : FILTER_STYLES.ALL.base}`}>
            All · {battles.length}
          </button>
          {STATUS_ORDER.map(status => {
            const count = grouped[status].length
            if (count === 0) return null
            const isActive = activeFilter === status
            const styles = FILTER_STYLES[status]
            return (
              <button key={status} onClick={() => setActiveFilter(isActive ? null : status)} className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${isActive ? styles.active : styles.base}`}>
                {STATUS_LABELS[status]} · {count}
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
          {visibleStatuses.map(status => {
            const group = grouped[status]
            if (group.length === 0) return null
            return (
              <section key={status}>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">{STATUS_LABELS[status]}</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {group.map((battle: any) => (
                    <BattleCard key={battle.id} battle={battle} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
