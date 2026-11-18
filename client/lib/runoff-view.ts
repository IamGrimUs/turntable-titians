/**
 * Display rules for the runoff (the tie-break vote on a battle that ended level for first). Pure,
 * so they are unit-tested. "Who won" is never decided here: the server sends the status and, once
 * the runoff is over, the vote counts. While it is OPEN the counts are null and no winner is named.
 */
import { formatShortDate, joinNames } from './display-format'

export type RunoffStatus = 'OPEN' | 'DECIDED' | 'TIED'

export interface RunoffCandidateView {
  name: string
  votes: number | null
}

export function runoffStatusLabel(status: RunoffStatus): string {
  return status === 'OPEN' ? 'Runoff' : 'Completed'
}

/** The candidates at the top vote count, or all of them when any count is unknown. */
function topCandidates(candidates: readonly RunoffCandidateView[]): RunoffCandidateView[] {
  if (candidates.some((c) => c.votes === null)) return [...candidates]
  const best = Math.max(...candidates.map((c) => c.votes as number))
  return candidates.filter((c) => c.votes === best)
}

/**
 * The one-line runoff summary on a battle card. Candidates keep the order given (never sorted by
 * votes). A winner is named only for DECIDED, with known votes and a single top candidate.
 */
export function runoffCardLine(
  status: RunoffStatus,
  candidates: readonly RunoffCandidateView[],
  endsAt: string,
): string {
  if (status === 'OPEN') {
    return `Runoff in progress: ${candidates.map((c) => c.name).join(' vs ')}, ends ${formatShortDate(endsAt)}`
  }

  const neutral = 'Runoff completed'

  if (status === 'TIED') {
    if (candidates.length === 0) return neutral
    return `Tied: ${joinNames(topCandidates(candidates).map((c) => c.name))} (runoff level)`
  }

  if (candidates.length < 2 || candidates.some((c) => c.votes === null)) return neutral
  const winners = topCandidates(candidates)
  if (winners.length !== 1) return neutral
  const winner = winners[0]
  const others = candidates.filter((c) => c !== winner).map((c) => c.votes as number)
  return `Won by ${winner.name} (runoff, ${winner.votes} to ${Math.max(...others)})`
}

export type VoteControl = 'VOTE' | 'VOTED' | 'LOCKED'

export function runoffVoteControl(i: {
  viewerCanVote: boolean
  viewerVoteSubmissionId: string | null
  submissionId: string
}): VoteControl {
  if (!i.viewerCanVote) return 'LOCKED'
  return i.viewerVoteSubmissionId === i.submissionId ? 'VOTED' : 'VOTE'
}

export function runoffLockedReason(i: { signedIn: boolean; isCandidateOwner: boolean }): string {
  if (!i.signedIn) return 'Sign in to vote'
  if (i.isCandidateOwner) return 'You are in this runoff, so you cannot vote'
  return 'Voting is closed'
}

/** The four rule bullets. `endsAt` is the start of the last day voting is open. */
export function runoffRules(endsAt: string): string[] {
  return [
    'Anyone signed in can vote, including people who voted in round one.',
    'The tied DJs cannot vote.',
    `One vote each. You can change it until ${formatShortDate(endsAt)}.`,
    'If it is level again, they share the win.',
  ]
}
