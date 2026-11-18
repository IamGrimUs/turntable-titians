import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { headToHeadCard, type HeadToHeadInput } from '@/lib/profile-head-to-head'

const KIND_CLASS: Record<string, string> = {
  WON: 'text-green-400',
  LOST: 'text-muted-foreground',
  DRAW: 'text-amber-400',
}

/**
 * A DJ's head to head duel record and their last five finished duels. Hidden until they have a
 * finished duel (no empty card), and kept apart from the career wins and the trophy shelf.
 */
export function HeadToHeadCard({ record }: { record: HeadToHeadInput | null | undefined }) {
  const card = headToHeadCard(record)
  if (!card) return null

  return (
    <section aria-labelledby="head-to-head-title" className="mb-8">
      <h2 id="head-to-head-title" className="mb-4 text-base font-bold uppercase tracking-widest text-muted-foreground">
        Head to head
      </h2>
      <Card className="p-4">
        <p className="text-2xl font-bold text-foreground">
          <span aria-hidden="true">{card.recordText}</span>
          <span className="sr-only">{card.recordLabel}</span>
        </p>
        <p className="text-base text-muted-foreground">Wins - losses - draws</p>
        <p className="mt-1 text-base text-muted-foreground">{card.note}</p>

        {card.rows.length > 0 && (
          <ul className="mt-3 divide-y divide-border/60 border-t border-border/60">
            {card.rows.map((row) => (
              <li key={row.key}>
                <Link
                  href={row.href}
                  className="flex items-center gap-3 rounded-md py-3 transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                >
                  <span className="min-w-0 flex-1 break-words text-base text-foreground">
                    <span className={cn('font-bold', KIND_CLASS[row.kind] ?? 'text-foreground')}>{row.kindLabel}</span>
                    <span className="text-muted-foreground"> against </span>
                    <span className="font-semibold">{row.opponentName}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}
