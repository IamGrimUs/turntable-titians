import { LIMITS, badInput, cleanSingleLine } from './validation'

export interface SuspensionFields {
  suspendedAt: Date | null
  suspendedUntil: Date | null
  suspensionReason: string | null
}

/**
 * "Suspended right now": suspendedAt is set and the end date is either absent or still
 * in the future. Nothing runs at the end date; an expired suspension simply stops
 * counting, the same idea as computeBattleStatus().
 */
export function isSuspended(
  f: Pick<SuspensionFields, 'suspendedAt' | 'suspendedUntil'>,
  now: Date = new Date()
): boolean {
  if (f.suspendedAt === null) return false
  if (f.suspendedUntil === null) return true
  return f.suspendedUntil.getTime() > now.getTime()
}

export function cleanSuspension(
  input: { reason: unknown; until?: unknown },
  now: Date = new Date()
): { reason: string; until: Date | null } {
  const reason = cleanSingleLine(input.reason, 'Reason', { max: LIMITS.suspensionReason, required: true }) as string

  const rawUntil = input.until
  if (rawUntil === undefined || rawUntil === null || rawUntil === '') return { reason, until: null }

  const until = typeof rawUntil === 'string' ? new Date(rawUntil) : new Date(NaN)
  if (Number.isNaN(until.getTime())) throw badInput('The end date must be a valid date.')
  if (until.getTime() <= now.getTime()) throw badInput('The end date must be in the future.')
  return { reason, until }
}
