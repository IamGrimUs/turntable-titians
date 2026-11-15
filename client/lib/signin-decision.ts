import { isSuspendedNow } from './suspension'

export type SignInDecision =
  | { allow: true }
  | { allow: false; reason: 'SUSPENDED'; userId: string }
  | { allow: false; reason: 'BLOCKED' }

/**
 * Whether an address may sign in. A blocked email always loses, even when there is no
 * user row yet (a new sign-up). No user row and no block means a normal new sign-up.
 * An expired suspension no longer counts.
 */
export function decideSignIn(input: {
  user: { id: string; suspendedAt: Date | null; suspendedUntil: Date | null } | null
  emailBlocked: boolean
  now?: Date
}): SignInDecision {
  if (input.emailBlocked) return { allow: false, reason: 'BLOCKED' }
  const { user } = input
  if (user && isSuspendedNow(user, input.now)) {
    return { allow: false, reason: 'SUSPENDED', userId: user.id }
  }
  return { allow: true }
}
