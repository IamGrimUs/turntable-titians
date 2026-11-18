import { describe, expect, it } from 'vitest'
import { entryStyle } from './battle-entry-style'
import {
  battlesListState,
  duelCardView,
  duelPageView,
  duelSignInText,
  entryFormOpen,
  isDuel,
  orderDuels,
  splitDuels,
  type DuelBattle,
} from './duel-view'

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

describe('orderDuels', () => {
  it('puts ACTIVE first, then UPCOMING, then COMPLETED, keeping the incoming order inside each status', () => {
    const list = [
      { id: 'c1', status: 'COMPLETED' },
      { id: 'a1', status: 'ACTIVE' },
      { id: 'u1', status: 'UPCOMING' },
      { id: 'c2', status: 'COMPLETED' },
      { id: 'a2', status: 'ACTIVE' },
      { id: 'u2', status: 'UPCOMING' },
    ]
    expect(orderDuels(list).map((d) => d.id)).toEqual(['a1', 'a2', 'u1', 'u2', 'c1', 'c2'])
  })

  it('does not change the list it is given, and puts an unknown status last', () => {
    const list = [{ id: 'x', status: 'WEIRD' }, { id: 'c', status: 'COMPLETED' }, { id: 'a', status: 'ACTIVE' }]
    const copy = [...list]
    expect(orderDuels(list).map((d) => d.id)).toEqual(['a', 'c', 'x'])
    expect(list).toEqual(copy)
  })

  it('handles an empty list', () => {
    expect(orderDuels([])).toEqual([])
  })
})

describe('isDuel', () => {
  it('is true only for a battle with a duel', () => {
    expect(isDuel({ duel: { outcome: null } })).toBe(true)
    expect(isDuel({ duel: null })).toBe(false)
    expect(isDuel({})).toBe(false)
  })
})

describe('duelPageView', () => {
  it('is null for a regular battle', () => {
    expect(duelPageView({ title: 'Round 1', status: 'ACTIVE', duel: null })).toBeNull()
  })

  it('reads "A vs B" with the challenge title kept as the subtitle and a Head to head badge', () => {
    const v = duelPageView(duel({ id: '1' }))!
    expect(v.headline).toBe('kay vs nova')
    expect(v.subtitle).toBe('Duel 1')
    expect(v.badgeLabel).toBe('Head to head')
  })

  it('has no result line before the duel is COMPLETED, whatever was sent', () => {
    const v = duelPageView(
      duel({ id: '1', status: 'ACTIVE', duel: duelOf({ outcome: 'CHALLENGER_WON', challengerVotes: 3, opponentVotes: 1 }) }),
    )!
    expect(v.resultLine).toBeNull()
  })

  it('shows the server result line when COMPLETED, and never prints a null count as a number', () => {
    const won = duelPageView(
      duel({ id: '1', status: 'COMPLETED', duel: duelOf({ outcome: 'OPPONENT_WON', challengerVotes: 1, opponentVotes: 4, winner: { id: 'o' } }) }),
    )!
    expect(won.resultLine).toBe('nova won, 4 to 1')
    const draw = duelPageView(duel({ id: '1', status: 'COMPLETED', duel: duelOf({ outcome: 'DRAW', challengerVotes: 2, opponentVotes: 2 }) }))!
    expect(draw.resultLine).toBe('Draw, 2 to 2')
    const noCounts = duelPageView(duel({ id: '1', status: 'COMPLETED', duel: duelOf({ outcome: 'DRAW' }) }))!
    expect(noCounts.resultLine).toBe('Draw')
    expect(noCounts.resultLine).not.toMatch(/null|undefined|NaN/)
  })

  it('falls back to a neutral name and keeps long names whole', () => {
    const long = 'b'.repeat(30)
    const v = duelPageView(duel({ id: '1', duel: duelOf({ challenger: user('c', null, null), opponent: user('o', long) }) }))!
    expect(v.headline).toBe(`A DJ vs ${long}`)
  })

  it('explains the page accurately: a 1v1 between the two DJs, everyone else can vote while it is open', () => {
    const active = duelPageView(duel({ id: '1', status: 'ACTIVE' }))!
    expect(active.intro).toBe('A 1v1 between kay and nova. Everyone else can vote.')
    const done = duelPageView(duel({ id: '1', status: 'COMPLETED', duel: duelOf({ outcome: 'DRAW' }) }))!
    expect(done.intro).toBe('A 1v1 between kay and nova.')
  })

  it('never offers a way to add an entry', () => {
    expect(duelPageView(duel({ id: '1' }))!.canAddEntry).toBe(false)
  })
})

describe('duelSignInText', () => {
  it('asks a signed-out visitor to vote in a duel, and to submit an entry in a regular battle', () => {
    expect(duelSignInText(true)).toBe('to vote.')
    expect(duelSignInText(false)).toBe('to submit your entry.')
  })

  it('names the crowned DJ by user id, the same rule as the card (winnerUserId)', () => {
    const won = (outcome: string, winner: { id: string } | null, status = 'COMPLETED') =>
      duelPageView(duel({ id: '1', status, duel: duelOf({ outcome, challengerVotes: 3, opponentVotes: 1, winner }) }))!
    expect(won('CHALLENGER_WON', { id: 'c' }).winnerUserId).toBe('c')
    expect(won('OPPONENT_WON', { id: 'o' }).winnerUserId).toBe('o')
    // The winner id decides the side, not the order of the entries.
    expect(won('CHALLENGER_WON', { id: 'o' }).winnerUserId).toBe('o')
    // A winner id that matches neither DJ falls back to the outcome, like the card.
    expect(won('OPPONENT_WON', { id: 'zzz' }).winnerUserId).toBe('o')
  })

  it('crowns nobody unless the outcome is decided and the duel is COMPLETED, even with a stray winner', () => {
    const v = (status: string, outcome: string | null) =>
      duelPageView(duel({ id: '1', status, duel: duelOf({ outcome, winner: { id: 'c' } }) }))!
    expect(v('COMPLETED', 'DRAW').winnerUserId).toBeNull()
    expect(v('COMPLETED', null).winnerUserId).toBeNull()
    expect(v('ACTIVE', 'CHALLENGER_WON').winnerUserId).toBeNull()
  })

  it('feeds the battle page crown: a DRAW with a stray winner crowns nobody, a decided duel crowns the right entry', () => {
    const crowned = (outcome: string, winnerId: string) => {
      const view = duelPageView(duel({ id: '1', status: 'COMPLETED', duel: duelOf({ outcome, winner: { id: winnerId } }) }))!
      return ['c', 'o'].filter(
        (userId) =>
          entryStyle({ battleStatus: 'COMPLETED', hasRunoff: false, winnerUserIds: [], userId, rank: 1, voteCount: 3, duel: { winnerId: view.winnerUserId } }).isWinner,
      )
    }
    expect(crowned('DRAW', 'c')).toEqual([])
    expect(crowned('OPPONENT_WON', 'o')).toEqual(['o'])
    expect(crowned('CHALLENGER_WON', 'c')).toEqual(['c'])
  })

  it('agrees with duelCardView on who is crowned', () => {
    const cases = [
      duel({ id: '1', status: 'COMPLETED', duel: duelOf({ outcome: 'CHALLENGER_WON', winner: { id: 'c' } }) }),
      duel({ id: '2', status: 'COMPLETED', duel: duelOf({ outcome: 'DRAW', winner: { id: 'o' } }) }),
      duel({ id: '3', status: 'COMPLETED', duel: duelOf({ outcome: 'OPPONENT_WON', winner: { id: 'x' } }) }),
      duel({ id: '4', status: 'ACTIVE', duel: duelOf({ outcome: 'OPPONENT_WON', winner: { id: 'o' } }) }),
    ]
    for (const c of cases) {
      const card = duelCardView(c)
      const page = duelPageView(c)!
      const side = card.winnerSide
      expect(page.winnerUserId).toBe(side === 'CHALLENGER' ? 'c' : side === 'OPPONENT' ? 'o' : null)
    }
  })
})

describe('entryFormOpen', () => {
  const open = { status: 'ACTIVE', signedIn: true, hasSubmitted: false }

  it('opens the entry form on an active regular battle for a signed-in DJ who has not entered', () => {
    expect(entryFormOpen({ ...open, duelView: null })).toBe(true)
  })

  it('stays closed for a regular battle unless ACTIVE, signed in and not yet entered', () => {
    expect(entryFormOpen({ ...open, status: 'UPCOMING', duelView: null })).toBe(false)
    expect(entryFormOpen({ ...open, status: 'COMPLETED', duelView: null })).toBe(false)
    expect(entryFormOpen({ ...open, signedIn: false, duelView: null })).toBe(false)
    expect(entryFormOpen({ ...open, hasSubmitted: true, duelView: null })).toBe(false)
  })

  it('never opens for a duel, because the page view says nobody can add an entry', () => {
    const view = duelPageView(duel({ id: '1' }))!
    expect(entryFormOpen({ ...open, duelView: view })).toBe(false)
  })

  it('reads canAddEntry from the page view', () => {
    expect(entryFormOpen({ ...open, duelView: { canAddEntry: true } as never })).toBe(true)
  })
})
