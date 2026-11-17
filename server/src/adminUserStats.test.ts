import { describe, it, expect } from 'vitest'
import { buildAdminUserRows, type StatsInput } from './adminUserStats'

const now = new Date('2026-11-15T12:00:00.000Z')
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

const completed = { id: 'b-done', startDate: day('2026-10-01'), endDate: day('2026-10-10') }
const completed2 = { id: 'b-done2', startDate: day('2026-09-01'), endDate: day('2026-09-10') }
const active = { id: 'b-active', startDate: day('2026-11-01'), endDate: day('2026-11-30') }
const upcoming = { id: 'b-up', startDate: day('2026-12-01'), endDate: day('2026-12-10') }

function user(id: string, extra: Partial<StatsInput['users'][number]> = {}): StatsInput['users'][number] {
  return {
    id,
    username: id,
    name: null,
    image: null,
    email: `${id}@example.com`,
    role: 'USER',
    externalCrews: [],
    internalCrewNames: [],
    createdAt: day('2026-01-01'),
    lastSignInAt: day('2026-11-01'),
    suspendedAt: null,
    suspendedUntil: null,
    suspensionReason: null,
    ...extra,
  }
}

function input(extra: Partial<StatsInput> = {}): StatsInput {
  return {
    users: [],
    submissions: [],
    voteCountsBySubmission: new Map(),
    votesCastByUser: new Map(),
    ideasPostedByUser: new Map(),
    battles: [],
    ...extra,
  }
}

function byId(rows: ReturnType<typeof buildAdminUserRows>, id: string) {
  const row = rows.find((r) => r.id === id)
  if (!row) throw new Error(`no row ${id}`)
  return row
}

describe('buildAdminUserRows', () => {
  it('counts entries per user and gives 0 to users without any', () => {
    const rows = buildAdminUserRows(
      input({
        users: [user('a'), user('b')],
        battles: [completed, active],
        submissions: [
          { id: 's1', userId: 'a', battleId: completed.id },
          { id: 's2', userId: 'a', battleId: active.id },
        ],
      }),
      now
    )
    expect(byId(rows, 'a').entries).toBe(2)
    expect(byId(rows, 'b').entries).toBe(0)
    expect(byId(rows, 'b').battlesWon).toBe(0)
    expect(byId(rows, 'b').votesReceived).toBe(0)
  })

  it('takes votesCast and votesReceived from the maps, 0 when absent', () => {
    const rows = buildAdminUserRows(
      input({
        users: [user('a'), user('b')],
        battles: [completed, active],
        submissions: [
          { id: 's1', userId: 'a', battleId: completed.id },
          { id: 's2', userId: 'a', battleId: active.id },
        ],
        voteCountsBySubmission: new Map([['s1', 3], ['s2', 2]]),
        votesCastByUser: new Map([['b', 7]]),
      }),
      now
    )
    expect(byId(rows, 'a').votesReceived).toBe(5)
    expect(byId(rows, 'a').votesCast).toBe(0)
    expect(byId(rows, 'b').votesCast).toBe(7)
    expect(byId(rows, 'b').votesReceived).toBe(0)
  })

  it('gives a win to a single entry with votes in a COMPLETED battle', () => {
    const rows = buildAdminUserRows(
      input({
        users: [user('a')],
        battles: [completed],
        submissions: [{ id: 's1', userId: 'a', battleId: completed.id }],
        voteCountsBySubmission: new Map([['s1', 1]]),
      }),
      now
    )
    expect(byId(rows, 'a').battlesWon).toBe(1)
  })

  it('gives the win to the entry with the most votes only', () => {
    const rows = buildAdminUserRows(
      input({
        users: [user('a'), user('b')],
        battles: [completed],
        submissions: [
          { id: 's1', userId: 'a', battleId: completed.id },
          { id: 's2', userId: 'b', battleId: completed.id },
        ],
        voteCountsBySubmission: new Map([['s1', 2], ['s2', 5]]),
      }),
      now
    )
    expect(byId(rows, 'a').battlesWon).toBe(0)
    expect(byId(rows, 'b').battlesWon).toBe(1)
  })

  it('gives every tied user a win in a COMPLETED battle', () => {
    const rows = buildAdminUserRows(
      input({
        users: [user('a'), user('b'), user('c')],
        battles: [completed],
        submissions: [
          { id: 's1', userId: 'a', battleId: completed.id },
          { id: 's2', userId: 'b', battleId: completed.id },
          { id: 's3', userId: 'c', battleId: completed.id },
        ],
        voteCountsBySubmission: new Map([['s1', 4], ['s2', 4], ['s3', 1]]),
      }),
      now
    )
    expect(byId(rows, 'a').battlesWon).toBe(1)
    expect(byId(rows, 'b').battlesWon).toBe(1)
    expect(byId(rows, 'c').battlesWon).toBe(0)
  })

  it('gives nobody a win when a COMPLETED battle has zero votes for everyone', () => {
    const rows = buildAdminUserRows(
      input({
        users: [user('a'), user('b')],
        battles: [completed],
        submissions: [
          { id: 's1', userId: 'a', battleId: completed.id },
          { id: 's2', userId: 'b', battleId: completed.id },
        ],
        voteCountsBySubmission: new Map([['s1', 0]]),
      }),
      now
    )
    expect(byId(rows, 'a').battlesWon).toBe(0)
    expect(byId(rows, 'b').battlesWon).toBe(0)
  })

  it('never counts ACTIVE or UPCOMING battles', () => {
    const rows = buildAdminUserRows(
      input({
        users: [user('a'), user('b')],
        battles: [active, upcoming],
        submissions: [
          { id: 's1', userId: 'a', battleId: active.id },
          { id: 's2', userId: 'b', battleId: upcoming.id },
        ],
        voteCountsBySubmission: new Map([['s1', 9], ['s2', 9]]),
      }),
      now
    )
    expect(byId(rows, 'a').battlesWon).toBe(0)
    expect(byId(rows, 'b').battlesWon).toBe(0)
    expect(byId(rows, 'a').votesReceived).toBe(9)
  })

  it('sums wins across several COMPLETED battles', () => {
    const rows = buildAdminUserRows(
      input({
        users: [user('a'), user('b')],
        battles: [completed, completed2],
        submissions: [
          { id: 's1', userId: 'a', battleId: completed.id },
          { id: 's2', userId: 'b', battleId: completed.id },
          { id: 's3', userId: 'a', battleId: completed2.id },
          { id: 's4', userId: 'b', battleId: completed2.id },
        ],
        voteCountsBySubmission: new Map([['s1', 3], ['s2', 1], ['s3', 1], ['s4', 2]]),
      }),
      now
    )
    expect(byId(rows, 'a').battlesWon).toBe(1)
    expect(byId(rows, 'b').battlesWon).toBe(1)
  })

  it('ignores submissions whose battle is unknown', () => {
    const rows = buildAdminUserRows(
      input({
        users: [user('a')],
        submissions: [{ id: 's1', userId: 'a', battleId: 'missing' }],
        voteCountsBySubmission: new Map([['s1', 3]]),
      }),
      now
    )
    expect(byId(rows, 'a').battlesWon).toBe(0)
    expect(byId(rows, 'a').entries).toBe(1)
  })

  it('is SUSPENDED while suspended and ACTIVE once suspendedUntil has passed', () => {
    const rows = buildAdminUserRows(
      input({
        users: [
          user('open'),
          user('forever', { suspendedAt: day('2026-11-01'), suspensionReason: 'spam' }),
          user('future', { suspendedAt: day('2026-11-01'), suspendedUntil: day('2026-11-20') }),
          user('expired', { suspendedAt: day('2026-11-01'), suspendedUntil: day('2026-11-10') }),
        ],
      }),
      now
    )
    expect(byId(rows, 'open').status).toBe('ACTIVE')
    expect(byId(rows, 'forever').status).toBe('SUSPENDED')
    expect(byId(rows, 'forever').suspensionReason).toBe('spam')
    expect(byId(rows, 'future').status).toBe('SUSPENDED')
    expect(byId(rows, 'future').suspendedUntil).toEqual(day('2026-11-20'))
    expect(byId(rows, 'expired').status).toBe('ACTIVE')
  })

  it('hides the reason and end date once a suspension has expired', () => {
    const rows = buildAdminUserRows(
      input({
        users: [
          user('expired', {
            suspendedAt: day('2026-11-01'),
            suspendedUntil: day('2026-11-10'),
            suspensionReason: 'spam',
          }),
        ],
      }),
      now
    )
    const row = byId(rows, 'expired')
    expect(row.status).toBe('ACTIVE')
    expect(row.suspensionReason).toBeNull()
    expect(row.suspendedUntil).toBeNull()
  })

  it('keeps the reason and end date while suspended, with or without an end date', () => {
    const rows = buildAdminUserRows(
      input({
        users: [
          user('timed', {
            suspendedAt: day('2026-11-01'),
            suspendedUntil: day('2026-11-20'),
            suspensionReason: 'spam',
          }),
          user('open-ended', { suspendedAt: day('2026-11-01'), suspensionReason: 'abuse' }),
        ],
      }),
      now
    )
    expect(byId(rows, 'timed').suspensionReason).toBe('spam')
    expect(byId(rows, 'timed').suspendedUntil).toEqual(day('2026-11-20'))
    expect(byId(rows, 'open-ended').suspensionReason).toBe('abuse')
    expect(byId(rows, 'open-ended').suspendedUntil).toBeNull()
  })

  it('has null suspension details for a never-suspended user', () => {
    const row = byId(buildAdminUserRows(input({ users: [user('clean')] }), now), 'clean')
    expect(row.status).toBe('ACTIVE')
    expect(row.suspensionReason).toBeNull()
    expect(row.suspendedUntil).toBeNull()
  })

  it('merges internal and external crews without case-insensitive duplicates', () => {
    const rows = buildAdminUserRows(
      input({
        users: [
          user('a', { internalCrewNames: ['Scratch Perverts', 'Invisibl'], externalCrews: ['scratch perverts', 'Beat Junkies', 'BEAT JUNKIES'] }),
          user('b'),
        ],
      }),
      now
    )
    expect(byId(rows, 'a').crews).toEqual(['Scratch Perverts', 'Invisibl', 'Beat Junkies'])
    expect(byId(rows, 'b').crews).toEqual([])
  })

  it('copies the identity fields and keeps input order', () => {
    const u = user('a', { name: 'A', image: 'https://x/y.png', role: 'ADMIN' })
    const rows = buildAdminUserRows(input({ users: [user('z'), u] }), now)
    expect(rows.map((r) => r.id)).toEqual(['z', 'a'])
    expect(rows[1]).toMatchObject({
      id: 'a',
      username: 'a',
      name: 'A',
      image: 'https://x/y.png',
      email: 'a@example.com',
      role: 'ADMIN',
      createdAt: u.createdAt,
      lastSignInAt: u.lastSignInAt,
    })
  })

  it('takes ideasPosted from the map, 0 when absent', () => {
    const rows = buildAdminUserRows(
      input({ users: [user('a'), user('b')], ideasPostedByUser: new Map([['a', 4]]) }),
      now
    )
    expect(byId(rows, 'a').ideasPosted).toBe(4)
    expect(byId(rows, 'b').ideasPosted).toBe(0)
  })

  it('never lets board activity change the battle numbers', () => {
    const base = {
      users: [user('a'), user('b'), user('c')],
      battles: [completed, active],
      submissions: [
        { id: 's1', userId: 'a', battleId: completed.id },
        { id: 's2', userId: 'b', battleId: completed.id },
        { id: 's3', userId: 'a', battleId: active.id },
      ],
      voteCountsBySubmission: new Map([['s1', 3], ['s2', 1], ['s3', 2]]),
      votesCastByUser: new Map([['c', 6]]),
    }
    const without = buildAdminUserRows(input({ ...base, ideasPostedByUser: new Map() }), now)
    const withIdeas = buildAdminUserRows(
      input({ ...base, ideasPostedByUser: new Map([['a', 9], ['b', 5], ['c', 12]]) }),
      now
    )
    const battleNumbers = (rows: typeof without) =>
      rows.map((r) => ({
        id: r.id,
        votesCast: r.votesCast,
        votesReceived: r.votesReceived,
        entries: r.entries,
        battlesWon: r.battlesWon,
      }))
    expect(battleNumbers(withIdeas)).toEqual(battleNumbers(without))
    expect(byId(withIdeas, 'c').ideasPosted).toBe(12)
    expect(byId(without, 'c').ideasPosted).toBe(0)
  })

  it('does not mutate its input', () => {
    const data = input({
      users: [user('a', { internalCrewNames: ['X'], externalCrews: ['x', 'Y'] })],
      battles: [completed],
      submissions: [{ id: 's1', userId: 'a', battleId: completed.id }],
      voteCountsBySubmission: new Map([['s1', 2]]),
      votesCastByUser: new Map([['a', 1]]),
      ideasPostedByUser: new Map([['a', 2]]),
    })
    const before = structuredClone(data)
    buildAdminUserRows(data, now)
    expect(data).toEqual(before)
  })
})
