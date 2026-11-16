import type { ApolloServerPlugin } from '@apollo/server'
import { createLimiter } from './rateLimit'
import { createMutationLimitPlugin } from './rateLimiting'
import { createSuspensionBackstopPlugin } from './suspensionBackstop'
import type { Context } from './context'

type MutationLimiter = ReturnType<typeof createLimiter>

/**
 * The Apollo plugins, in the order that matters.
 *
 * - The suspension backstop is always installed (the RATE_LIMIT_DISABLED emergency switch turns the
 *   limits off and must not turn this off too) and is listed FIRST: Apollo runs every plugin's
 *   `didResolveOperation` together, and when two throw the first listed wins, so a suspended caller
 *   hears "suspended", not "too often". No mutation runs while suspended.
 * - The mutation limiter (at most 30 mutations a minute per user, per IP when not signed in) is
 *   left out when the emergency switch is on.
 *
 * Kept in its own module so a test can pin the order (index.ts starts the server when imported).
 */
export function buildPlugins(
  rateLimitDisabled: boolean,
  mutationLimiter: MutationLimiter = createLimiter({ limit: 30, windowMs: 60_000 }),
): ApolloServerPlugin<Context>[] {
  return [
    createSuspensionBackstopPlugin(),
    ...(rateLimitDisabled ? [] : [createMutationLimitPlugin(mutationLimiter)]),
  ]
}
