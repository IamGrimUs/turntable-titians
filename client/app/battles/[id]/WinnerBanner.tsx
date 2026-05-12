interface Winner {
  id: string
  username: string | null
  name: string | null
  image: string | null
  voteCount: number
}

interface Props {
  winners: Winner[]
}

export function WinnerBanner({ winners }: Props) {
  if (winners.length === 0) return null

  const isTie = winners.length > 1
  const totalVotes = winners[0].voteCount

  return (
    <div className="mb-8 rounded-lg border border-amber-500/40 bg-amber-500/5 p-6">
      <p className="text-xs font-bold tracking-[0.3em] uppercase text-amber-500 mb-3">
        {isTie ? 'Co-Winners' : 'Winner'}
      </p>
      <div className="flex flex-wrap gap-4">
        {winners.map((winner) => {
          const displayName = winner.username ?? winner.name ?? 'DJ'
          const initial = displayName.charAt(0).toUpperCase()
          return (
            <div key={winner.id} className="flex items-center gap-3">
              {winner.image ? (
                <img
                  src={winner.image}
                  alt={displayName}
                  className="w-12 h-12 rounded-full object-cover border-2 border-amber-400"
                />
              ) : (
                <span className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-500 text-lg font-bold flex items-center justify-center border-2 border-amber-400">
                  {initial}
                </span>
              )}
              <div>
                <p className="text-base font-black text-foreground">{displayName}</p>
                <p className="text-xs text-muted-foreground">{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
