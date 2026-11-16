import type { ApolloServerPlugin } from '@apollo/server'
import { GraphQLError } from 'graphql'
import { suspendedError, type Context } from './context'
import { isSuspended } from './suspension'

/**
 * Defence in depth: refuses every MUTATION from a suspended caller before any resolver runs, so a
 * future mutation that forgets `requireAuth` still cannot be used while suspended. The per-resolver
 * `requireAuth` stays the primary check; this is only the backstop.
 *
 * - Queries are left alone: a suspended user can still read.
 * - Anonymous callers are not this plugin's concern; each resolver refuses them (UNAUTHENTICATED).
 * - "Suspended now" follows the same rule as everywhere else (`isSuspended`), so a suspension whose
 *   end date has passed does not block.
 * - It is a separate plugin from the mutation limiter and is always installed: the
 *   RATE_LIMIT_DISABLED emergency switch turns the limits off, and must not turn this off too.
 *
 * Rate limiting: a refused request still costs the limiter its hits. Apollo runs every plugin's
 * `didResolveOperation` at the same time (`Promise.all`), so the limiter has already counted by the
 * time this throws, and stopping that would mean coupling the two plugins. The counter is the
 * suspended user's own, so it is harmless, and it bounds how often they can hammer mutations.
 * Install this plugin BEFORE the limiter: when both throw, the first one listed wins, and a
 * suspended caller should hear "suspended", not "too often".
 */
export function createSuspensionBackstopPlugin(now: () => Date = () => new Date()): ApolloServerPlugin<Context> {
  return {
    async requestDidStart() {
      return {
        async didResolveOperation({ operation, contextValue }) {
          if (operation?.operation !== 'mutation') return
          const suspension = contextValue.suspension
          if (!suspension) return
          // The context already holds only a current suspension (see loadViewer); checking the end
          // date again covers a request that outlives the suspension and a context built elsewhere.
          const at = now()
          if (isSuspended({ suspendedAt: at, suspendedUntil: suspension.until }, at)) {
            const err = suspendedError(suspension)
            // Same message and code as requireAuth, but answered with HTTP 200: an error thrown this
            // early would otherwise get HTTP 500 and no data, which Apollo Client turns into a
            // network error, so the suspension message would never reach the user. Apollo strips
            // `http` before the error is sent to the client.
            throw new GraphQLError(err.message, { extensions: { ...err.extensions, http: { status: 200 } } })
          }
        },
      }
    },
  }
}
