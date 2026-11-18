import { describe, expect, it } from 'vitest'
import { battlesListState, duelCardView, splitDuels, type DuelBattle } from './duel-view'

const user = (id: string, username: string | null = id, name: string | null = null) => ({ id, username, name, image: null })

const duelOf = (over: Partial<NonNullable<DuelBattle['duel']>> = {}) => ({
  challenger: user('c', 'kay'),
  opponent: user('o', 'nova'),
  outcome: null as string | null,
  challengerVotes: null as number | null,
  opponentVotes: null as number | null,
  winner: null as { id: string } | null,
  ...over,
})

const duel = (over: Partial<DuelBattle> & { id: string }): DuelBattle => ({
  title: `Duel ${over.id}`,
  status: 'ACTIVE',
  duel: duelOf(),
  ...over,
})

describe('splitDuels', () => {
  it('separates duels from regular battles and keeps the order inside each group', () => {
    const list = [
      { id: 'r1', duel: null },
      { id: 'd1', duel: { x: 1 } },
      { id: 'r2', duel: null },
      { id: 'd2', duel: { x: 2 } },
      { id: 'r3', duel: null },
    ]
    const { regular, duels } = splitDuels(list)
    expect(regular.map((b) => b.id)).toEqual(['r1', 'r2', 'r3'])
    expect(duels.map((b) => b.id)).toEqual(['d1', 'd2'])
  })

  it('treats a missing duel (an older response or cache entry) as a regular battle', () => {
    const { regular, duels } = splitDuels([{ id: 'a' }, { id: 'b', duel: undefined }] as { id: string; duel?: unknown }[])
    expect(regular.map((b) => b.id)).toEqual(['a', 'b'])
    expect(duels).toEqual([])
  })

  it('handles an empty list and never modifies the input', () => {
    expect(splitDuels([])).toEqual({ regular: [], duels: [] })
    const list = [
      { id: 'd', duel: {} },
      { id: 'r', duel: null },
    ]
    const copy = [...list]
    splitDuels(list)
    expect(list).toEqual(copy)
  })
})

describe('duelCardView', () => {
  it('an active duel shows the status pill, both DJs and no result and no crown', () => {
    const v = duelCardView(duel({ id: '1', status: 'ACTIVE' }))
    expect(v.statusLabel).toBe('ACTIVE')
    expect(v.statusVariant).toBe('active')
    expect(v.challengerName).toBe('kay')
    expect(v.opponentName).toBe('nova')
    expect(v.resultLine).toBeNull()
    expect(v.crown).toBe(false)
    expect(v.winnerSide).toBeNull()
  })

  it('an upcoming duel uses the upcoming pill and has no result', () => {
    const v = duelCardView(duel({ id: '1', status: 'UPCOMING' }))
    expect(v.statusLabel).toBe('UPCOMING')
    expect(v.statusVariant).toBe('upcoming')
    expect(v.resultLine).toBeNull()
    expect(v.crown).toBe(false)
  })

  it('a decided duel shows the winner first, a crown, and the winning side by id', () => {
    const v = duelCardView(
      duel({
        id: '1',
        status: 'COMPLETED',
        duel: duelOf({ outcome: 'OPPONENT_WON', challengerVotes: 48, opponentVotes: 62, winner: { id: 'o' } }),
      }),
    )
    expect(v.statusLabel).toBe('COMPLETED')
    expect(v.statusVariant).toBe('completed')
    expect(v.resultLine).toBe('nova won, 62 to 48')
    expect(v.crown).toBe(true)
    expect(v.winnerSide).toBe('OPPONENT')
  })

  it('a challenger win marks the challenger side', () => {
    const v = duelCardView(
      duel({
        id: '1',
        status: 'COMPLETED',
        duel: duelOf({ outcome: 'CHALLENGER_WON', challengerVotes: 5, opponentVotes: 2, winner: { id: 'c' } }),
      }),
    )
    expect(v.resultLine).toBe('kay won, 5 to 2')
    expect(v.winnerSide).toBe('CHALLENGER')
    expect(v.crown).toBe(true)
  })

  it('identifies the winner by user id, never by the order of the submissions', () => {
    const v = duelCardView({
      id: '1',
      title: 't',
      status: 'COMPLETED',
      // entries listed opponent first: the card must not care
      submissions: [{ user: user('o') }, { user: user('c') }],
      duel: duelOf({ outcome: 'CHALLENGER_WON', challengerVotes: 3, opponentVotes: 1, winner: { id: 'c' } }),
    } as DuelBattle)
    expect(v.winnerSide).toBe('CHALLENGER')
    expect(v.challengerName).toBe('kay')
  })

  it('a draw says Draw with the score, with no crown and no winning side', () => {
    const v = duelCardView(
      duel({ id: '1', status: 'COMPLETED', duel: duelOf({ outcome: 'DRAW', challengerVotes: 40, opponentVotes: 40 }) }),
    )
    expect(v.resultLine).toBe('Draw, 40 to 40')
    expect(v.crown).toBe(false)
    expect(v.winnerSide).toBeNull()
  })

  it('a completed duel with no counts never prints a null or a zero as a score', () => {
    const v = duelCardView(duel({ id: '1', status: 'COMPLETED', duel: duelOf({ outcome: 'DRAW' }) }))
    expect(v.resultLine).toBe('Draw')
    expect(v.resultLine).not.toMatch(/null|undefined|NaN|0/)
  })

  it('shows no result and no crown until the battle is COMPLETED, whatever else was sent', () => {
    const v = duelCardView(
      duel({
        id: '1',
        status: 'ACTIVE',
        duel: duelOf({ outcome: 'CHALLENGER_WON', challengerVotes: 3, opponentVotes: 1, winner: { id: 'c' } }),
      }),
    )
    expect(v.resultLine).toBeNull()
    expect(v.crown).toBe(false)
    expect(v.winnerSide).toBeNull()
  })

  it('falls back to a neutral name for a DJ with no username or name, and keeps long names whole', () => {
    const long = 'a'.repeat(30)
    const v = duelCardView(duel({ id: '1', duel: duelOf({ challenger: user('c', null, null), opponent: user('o', long) }) }))
    expect(v.challengerName).toBe('A DJ')
    expect(v.opponentName).toBe(long)
  })

  it('an unknown status still renders as an upcoming-style pill with its own text', () => {
    const v = duelCardView(duel({ id: '1', status: 'WEIRD' }))
    expect(v.statusLabel).toBe('WEIRD')
    expect(v.statusVariant).toBe('upcoming')
  })
})

describe('battlesListState', () => {
  it('is "EMPTY" only when there are no battles at all, duels included', () => {
    expect(battlesListState(0, 0)).toBe('EMPTY')
  })

  it('a page with only duels is not "No battles yet" and says there are no regular battles', () => {
    expect(battlesListState(0, 2)).toBe('NO_REGULAR')
  })

  it('regular battles show as before, with or without duels', () => {
    expect(battlesListState(3, 0)).toBe('REGULAR')
    expect(battlesListState(3, 2)).toBe('REGULAR')
  })
})
