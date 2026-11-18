import { describe, it, expect } from 'vitest'
import { DUELIST_NOTE, OWN_ENTRY_NOTE, isDuelist, isOwnEntry, ownEntryBlocksVote, voteBlockNote } from './own-entry'

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

const duel = { challenger: { id: 'c' }, opponent: { id: 'o' } }

describe('isDuelist', () => {
  it('is true for either DJ of the duel', () => {
    expect(isDuelist('c', duel)).toBe(true)
    expect(isDuelist('o', duel)).toBe(true)
  })

  it('is false for a third party, a signed-out visitor and a regular battle', () => {
    expect(isDuelist('x', duel)).toBe(false)
    expect(isDuelist(null, duel)).toBe(false)
    expect(isDuelist('c', null)).toBe(false)
    expect(isDuelist('c', undefined)).toBe(false)
  })
})

describe('voteBlockNote', () => {
  it('uses the exact head to head wording', () => {
    expect(DUELIST_NOTE).toBe("You're in this head-to-head battle, so you can't vote in it")
  })

  it('a duelist is blocked on BOTH entries, with the head to head reason', () => {
    for (const currentUserId of ['c', 'o']) {
      for (const entryOwnerId of ['c', 'o']) {
        expect(voteBlockNote({ currentUserId, entryOwnerId, isVotedHere: false, duel })).toBe(DUELIST_NOTE)
      }
    }
  })

  it("a duelist's own entry never says the own-entry message (no contradiction)", () => {
    expect(voteBlockNote({ currentUserId: 'c', entryOwnerId: 'c', isVotedHere: false, duel })).not.toBe(OWN_ENTRY_NOTE)
  })

  it('a duelist stays blocked even if a vote were recorded (the own-entry take-back exception does not apply)', () => {
    expect(voteBlockNote({ currentUserId: 'c', entryOwnerId: 'o', isVotedHere: true, duel })).toBe(DUELIST_NOTE)
  })

  it('a third party votes normally on either entry', () => {
    expect(voteBlockNote({ currentUserId: 'x', entryOwnerId: 'c', isVotedHere: false, duel })).toBeNull()
    expect(voteBlockNote({ currentUserId: 'x', entryOwnerId: 'o', isVotedHere: false, duel })).toBeNull()
  })

  it('a signed-out visitor gets no reason (the page shows its sign-in prompt)', () => {
    expect(voteBlockNote({ currentUserId: null, entryOwnerId: 'c', isVotedHere: false, duel })).toBeNull()
  })

  it('a regular battle keeps the own-entry rule exactly', () => {
    expect(voteBlockNote({ currentUserId: 'u1', entryOwnerId: 'u1', isVotedHere: false, duel: null })).toBe(OWN_ENTRY_NOTE)
    expect(voteBlockNote({ currentUserId: 'u1', entryOwnerId: 'u1', isVotedHere: true, duel: null })).toBeNull()
    expect(voteBlockNote({ currentUserId: 'u1', entryOwnerId: 'u2', isVotedHere: false })).toBeNull()
  })
})
