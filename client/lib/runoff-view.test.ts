import { describe, expect, it } from 'vitest'
import {
  runoffCardLine,
  runoffLockedReason,
  runoffRules,
  runoffStatusLabel,
  runoffVoteControl,
} from './runoff-view'

// Local midnight of Nov 20 (what the server sends: the start of the last voting day), so
// formatShortDate, which formats in local time, gives "Nov 20" in every timezone.
const ENDS = new Date(2026, 10, 20).toISOString()

const c = (name: string, votes: number | null) => ({ name, votes })

describe('runoffStatusLabel', () => {
  it('says Runoff while open and Completed once finished either way', () => {
    expect(runoffStatusLabel('OPEN')).toBe('Runoff')
    expect(runoffStatusLabel('DECIDED')).toBe('Completed')
    expect(runoffStatusLabel('TIED')).toBe('Completed')
  })
})

describe('runoffCardLine', () => {
  it('OPEN lists the candidates in the order given with the closing date', () => {
    expect(runoffCardLine('OPEN', [c('a', null), c('b', null)], ENDS)).toBe('Runoff in progress: a vs b, ends Nov 20')
    expect(runoffCardLine('OPEN', [c('zed', null), c('amy', null), c('kay', null)], ENDS)).toBe(
      'Runoff in progress: zed vs amy vs kay, ends Nov 20',
    )
  })

  it('OPEN never sorts by votes and never names a winner, even if votes are present', () => {
    expect(runoffCardLine('OPEN', [c('a', 1), c('b', 9)], ENDS)).toBe('Runoff in progress: a vs b, ends Nov 20')
  })

  it('DECIDED names the winner with the winner votes first', () => {
    expect(runoffCardLine('DECIDED', [c('nova', 24), c('kay', 31)], ENDS)).toBe('Won by kay (runoff, 31 to 24)')
  })

  it('DECIDED with three candidates uses the best other candidate', () => {
    expect(runoffCardLine('DECIDED', [c('a', 10), c('kay', 31), c('b', 24)], ENDS)).toBe(
      'Won by kay (runoff, 31 to 24)',
    )
  })

  it('DECIDED falls back to a neutral line when votes are missing', () => {
    expect(runoffCardLine('DECIDED', [c('kay', null), c('nova', null)], ENDS)).toBe('Runoff completed')
    expect(runoffCardLine('DECIDED', [c('kay', 3), c('nova', null)], ENDS)).toBe('Runoff completed')
    expect(runoffCardLine('DECIDED', [], ENDS)).toBe('Runoff completed')
  })

  it('DECIDED never invents a winner when the top count is shared', () => {
    expect(runoffCardLine('DECIDED', [c('kay', 5), c('nova', 5)], ENDS)).toBe('Runoff completed')
  })

  it('TIED names the two candidates level at the top', () => {
    expect(runoffCardLine('TIED', [c('kay', 20), c('nova', 20)], ENDS)).toBe('Tied: kay and nova (runoff level)')
  })

  it('TIED three-way joins every name', () => {
    expect(runoffCardLine('TIED', [c('kay', 7), c('nova', 7), c('cy', 7)], ENDS)).toBe(
      'Tied: kay, nova and cy (runoff level)',
    )
  })

  it('TIED lists only the candidates at the top count', () => {
    expect(runoffCardLine('TIED', [c('kay', 7), c('low', 2), c('nova', 7)], ENDS)).toBe(
      'Tied: kay and nova (runoff level)',
    )
  })

  it('TIED with nobody voting lists every candidate', () => {
    expect(runoffCardLine('TIED', [c('kay', 0), c('nova', 0), c('cy', 0)], ENDS)).toBe(
      'Tied: kay, nova and cy (runoff level)',
    )
  })

  it('TIED with no candidates falls back to the neutral line', () => {
    expect(runoffCardLine('TIED', [], ENDS)).toBe('Runoff completed')
  })

  it('TIED with unknown votes lists every candidate', () => {
    expect(runoffCardLine('TIED', [c('kay', null), c('nova', null)], ENDS)).toBe(
      'Tied: kay and nova (runoff level)',
    )
  })

  it('does not modify its input', () => {
    const input = [c('nova', 24), c('kay', 31)]
    const copy = JSON.parse(JSON.stringify(input))
    runoffCardLine('DECIDED', input, ENDS)
    expect(input).toEqual(copy)
  })
})

describe('runoffVoteControl', () => {
  it('is LOCKED when the viewer cannot vote, even on their own choice', () => {
    expect(runoffVoteControl({ viewerCanVote: false, viewerVoteSubmissionId: null, submissionId: 's1' })).toBe('LOCKED')
    expect(runoffVoteControl({ viewerCanVote: false, viewerVoteSubmissionId: 's1', submissionId: 's1' })).toBe('LOCKED')
  })

  it('is VOTED on the submission the viewer chose', () => {
    expect(runoffVoteControl({ viewerCanVote: true, viewerVoteSubmissionId: 's1', submissionId: 's1' })).toBe('VOTED')
  })

  it('is VOTE otherwise', () => {
    expect(runoffVoteControl({ viewerCanVote: true, viewerVoteSubmissionId: null, submissionId: 's1' })).toBe('VOTE')
    expect(runoffVoteControl({ viewerCanVote: true, viewerVoteSubmissionId: 's2', submissionId: 's1' })).toBe('VOTE')
  })
})

describe('runoffLockedReason', () => {
  it('asks signed-out viewers to sign in', () => {
    expect(runoffLockedReason({ signedIn: false, isCandidateOwner: false })).toBe('Sign in to vote')
  })

  it('tells a tied DJ they cannot vote', () => {
    expect(runoffLockedReason({ signedIn: true, isCandidateOwner: true })).toBe(
      'You are in this runoff, so you cannot vote',
    )
  })

  it('otherwise says voting is closed', () => {
    expect(runoffLockedReason({ signedIn: true, isCandidateOwner: false })).toBe('Voting is closed')
  })
})

describe('runoffRules', () => {
  it('is exactly four bullets with the closing date in the third', () => {
    expect(runoffRules(ENDS)).toEqual([
      'Anyone signed in can vote, including people who voted in round one.',
      'The tied DJs cannot vote.',
      'One vote each. You can change it until Nov 20.',
      'If it is level again, they share the win.',
    ])
  })
})
