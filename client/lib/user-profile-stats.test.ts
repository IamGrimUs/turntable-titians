import { describe, it, expect } from 'vitest'
import { buildProfileStats } from './user-profile-stats'

describe('buildProfileStats', () => {
  it('counts entries as battles entered and passes the server win count through', () => {
    expect(buildProfileStats({ battlesWon: 3, submissions: [{}, {}, {}, {}], externalCrews: [] })).toMatchObject({
      battlesWon: 3,
      battlesEntered: 4,
    })
  })

  it('shows zero for a user with no entries and no wins', () => {
    expect(buildProfileStats({ battlesWon: 0, submissions: [], externalCrews: [] })).toEqual({
      battlesWon: 0,
      battlesEntered: 0,
      crew: null,
    })
  })

  it('treats a missing win count as zero', () => {
    expect(buildProfileStats({ submissions: [] }).battlesWon).toBe(0)
    expect(buildProfileStats({ battlesWon: null, submissions: [] }).battlesWon).toBe(0)
  })

  it('has no crew card without a crew', () => {
    expect(buildProfileStats({ submissions: [], externalCrews: [] }).crew).toBeNull()
    expect(buildProfileStats({ submissions: [], externalCrews: null }).crew).toBeNull()
    expect(buildProfileStats({ submissions: [] }).crew).toBeNull()
  })

  it('ignores blank crew names', () => {
    expect(buildProfileStats({ submissions: [], externalCrews: ['', '   '] }).crew).toBeNull()
  })

  it('labels a single crew "Crew"', () => {
    expect(buildProfileStats({ submissions: [], externalCrews: ['Scratch Syndicate'] }).crew).toEqual({
      label: 'Crew',
      names: 'Scratch Syndicate',
    })
  })

  it('lists several crews under "Crews"', () => {
    expect(buildProfileStats({ submissions: [], externalCrews: ['A', ' B '] }).crew).toEqual({
      label: 'Crews',
      names: 'A, B',
    })
  })
})
