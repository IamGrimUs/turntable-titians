'use client'

import { useState } from 'react'
import { Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChampionsTable } from '@/components/hall-of-fame/ChampionsTable'
import { BattleResults } from '@/components/hall-of-fame/BattleResults'

type Tab = 'champions' | 'results'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'champions', label: 'Champions' },
  { id: 'results', label: 'Battle results' },
]

export default function HallOfFamePage() {
  const [tab, setTab] = useState<Tab>('champions')

  return (
    <div className="mx-auto w-full max-w-5xl p-8">
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-3">
          <Crown className="h-10 w-10 text-amber-500" aria-hidden="true" />
          <h1 className="text-5xl font-graffiti text-foreground">Hall of Fame</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          {tab === 'champions'
            ? 'Everyone who has won a battle, ranked by career wins.'
            : 'Every completed battle and who won it.'}
        </p>
      </header>

      <div role="tablist" aria-label="Hall of Fame views" className="mb-6 flex gap-2 border-b border-border">
        {TABS.map((t) => {
          const selected = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                '-mb-px border-b-[3px] px-5 py-3 text-base transition-colors',
                selected
                  ? 'border-amber-500 font-bold text-foreground'
                  : 'border-transparent font-semibold text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'champions' ? <ChampionsTable /> : <BattleResults />}
      </div>
    </div>
  )
}
