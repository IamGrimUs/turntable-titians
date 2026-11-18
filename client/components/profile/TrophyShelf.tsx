import { Crown, Lock, Medal, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildTrophyShelf, type MilestoneId, type RecordInput } from '@/lib/trophies'

const ICONS: Record<MilestoneId, LucideIcon> = {
  'first-win': Crown,
  'three-wins': Trophy,
  'ten-wins': Trophy,
  'first-podium': Medal,
}

/**
 * A DJ's results at a glance: a few numbers to beat and milestone badges. Locked badges stay
 * visible with how to earn them. Facts from completed battles only; nothing to follow or like.
 */
export function TrophyShelf({ record }: { record: RecordInput | null | undefined }) {
  const shelf = buildTrophyShelf(record)

  return (
    <section aria-labelledby="trophy-shelf-title" className="mb-8">
      <h2 id="trophy-shelf-title" className="mb-4 text-base font-bold uppercase tracking-widest text-muted-foreground">
        Trophies
      </h2>

      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {shelf.stats.map((s) => (
          <div key={s.label} className="rounded-md border border-border px-4 py-3">
            <dd className="text-2xl font-bold text-foreground">{s.value}</dd>
            <dt className="text-base text-muted-foreground">{s.label}</dt>
          </div>
        ))}
      </dl>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shelf.milestones.map((m) => {
          const Icon = ICONS[m.id]
          return (
            <li
              key={m.id}
              className={cn(
                'flex items-center gap-3 rounded-md border px-4 py-3',
                m.earned ? 'border-amber-500/45 bg-amber-500/5' : 'border-dashed border-border',
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2',
                  m.earned ? 'border-amber-500 text-amber-500' : 'border-border text-muted-foreground',
                )}
              >
                {m.earned ? <Icon className="h-5 w-5" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <p className={cn('text-lg font-bold leading-tight', m.earned ? 'text-foreground' : 'text-muted-foreground')}>
                  {m.label}
                </p>
                <p className="text-base text-muted-foreground">
                  {m.earned ? 'Earned' : m.hint}
                  {!m.earned && <span className="sr-only"> (not earned yet)</span>}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
