import { describe, it, expect } from 'vitest'
import { isOwnEntry, ownEntryBlocksVote } from './own-entry'

describe('isOwnEntry', () => {
  it('is true only when the signed-in user owns the entry', () => {
    expect(isOwnEntry('u1', 'u1')).toBe(true)
    expect(isOwnEntry('u1', 'u2')).toBe(false)
  })

  it('is false when signed out', () => {
    expect(isOwnEntry(null, 'u1')).toBe(false)
  })
})

describe('ownEntryBlocksVote', () => {
  const base = { currentUserId: 'u1', entryOwnerId: 'u1', isVotedHere: false }

  it('blocks voting on your own entry', () => {
    expect(ownEntryBlocksVote(base)).toBe(true)
  })

  it('does not block voting on someone else\'s entry', () => {
    expect(ownEntryBlocksVote({ ...base, entryOwnerId: 'u2' })).toBe(false)
  })

  it('keeps the button when you already voted for yourself, so the vote can be taken back', () => {
    expect(ownEntryBlocksVote({ ...base, isVotedHere: true })).toBe(false)
  })
})
