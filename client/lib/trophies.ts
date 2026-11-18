/**
 * What the profile's trophy shelf shows. Pure, so the rules are unit-tested.
 *
 * The numbers come from the server's `User.record` (completed battles only, since votes are
 * secret until a battle ends); nothing here decides who won or placed. The shelf adds only
 * display rules: which stats appear and which milestone badges are earned. "Battles won" and
 * "Battles entered" already sit in the profile's stat row, so the shelf does not repeat them.
 */
import { winRate } from './hall-of-fame-view'

export interface RecordInput {
  wins: number
  podiums: number
  bestFinish: number | null
  currentStreak: number
  bestStreak: number
  battlesEntered: number
}

export interface TrophyStat {
  label: string
  value: string
}

export type MilestoneId = 'first-win' | 'three-wins' | 'ten-wins' | 'first-podium'

export interface Milestone {
  id: MilestoneId
  label: string
  /** How to earn it. Shown on locked badges, so there is always something to chase. */
  hint: string
  earned: boolean
}

export interface TrophyShelf {
  stats: TrophyStat[]
  milestones: Milestone[]
  earnedCount: number
}

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10 as 1 | 2 | 3] ?? 'th'
  return `${n}${suffix}`
}

const EMPTY: RecordInput = { wins: 0, podiums: 0, bestFinish: null, currentStreak: 0, bestStreak: 0, battlesEntered: 0 }

export function buildTrophyShelf(input: RecordInput | null | undefined): TrophyShelf {
  const r = input ?? EMPTY
  const milestones: Milestone[] = [
    { id: 'first-win', label: 'First win', hint: 'Win a battle', earned: r.wins >= 1 },
    { id: 'three-wins', label: '3 wins', hint: 'Win 3 battles', earned: r.wins >= 3 },
    { id: 'ten-wins', label: '10 wins', hint: 'Win 10 battles', earned: r.wins >= 10 },
    { id: 'first-podium', label: 'First podium', hint: 'Finish in the top 3', earned: r.podiums >= 1 },
  ]
  return {
    stats: [
      { label: 'Podium finishes', value: String(r.podiums) },
      { label: 'Best finish', value: r.bestFinish === null ? '–' : ordinal(r.bestFinish) },
      { label: 'Win streak', value: String(r.currentStreak) },
      { label: 'Best streak', value: String(r.bestStreak) },
      { label: 'Win rate', value: winRate(r.wins, r.battlesEntered) },
    ],
    milestones,
    earnedCount: milestones.filter((m) => m.earned).length,
  }
}
