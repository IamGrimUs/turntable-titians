import Link from 'next/link'
import { Crown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PersonAvatar } from '@/components/hall-of-fame/PersonAvatar'
import { DUEL_BADGE_LABEL, duelCardView, type DuelBattle, type DuelSide } from '@/lib/duel-view'

function Side({ user, name, won }: { user: NonNullable<DuelBattle['duel']>['challenger']; name: string; won: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <PersonAvatar user={user} size={56} highlighted={won} />
      <span className={`max-w-full break-words text-base font-semibold ${won ? 'text-amber-400' : 'text-foreground'}`} dir="auto">
        {name}
      </span>
    </div>
  )
}

/**
 * One head to head duel on the Battles page: both DJs with "vs", a Head to head pill, the status
 * pill and, once the duel is over, the result the server decided. The whole card opens the battle.
 * Sides are the duel's own challenger and opponent, never the order of the entries.
 */
export function DuelCard({ battle }: { battle: DuelBattle }) {
  const duel = battle.duel
  if (!duel) return null
  const view = duelCardView(battle)
  const won = (side: DuelSide) => view.winnerSide === side

  return (
    <Link href={`/battles/${battle.id}`} className="block h-full">
      <Card className="flex h-full cursor-pointer flex-col transition-all hover:border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{DUEL_BADGE_LABEL}</Badge>
            <Badge variant={view.statusVariant}>{view.statusLabel}</Badge>
          </div>
          <h3 className="break-words font-graffiti text-3xl" dir="auto">
            {battle.title}
          </h3>
        </CardHeader>
        <CardContent className="mt-auto pt-0">
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
            <Side user={duel.challenger} name={view.challengerName} won={won('CHALLENGER')} />
            <span className="self-center text-base font-semibold uppercase text-muted-foreground">
              vs
            </span>
            <Side user={duel.opponent} name={view.opponentName} won={won('OPPONENT')} />
          </div>
          {view.resultLine && (
            <p className={`mt-4 flex items-center gap-2 text-base font-semibold ${view.crown ? 'text-amber-400' : 'text-foreground'}`}>
              {view.crown && <Crown className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <span className="min-w-0 break-words" dir="auto">
                {view.resultLine}
              </span>
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
