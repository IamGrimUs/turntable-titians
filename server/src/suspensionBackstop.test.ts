import { describe, it, expect, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { GraphQLError, parse, Kind, type OperationDefinitionNode } from 'graphql'
import { createSuspensionBackstopPlugin } from './suspensionBackstop'
import { createMutationLimitPlugin } from './rateLimiting'
import { createLimiter } from './rateLimit'
import { requireAuth, type Context } from './context'

const NOW = new Date('2026-11-15T12:00:00.000Z')
const clock = () => NOW
const HOUR = 60 * 60 * 1000

const suspended = (until: Date | null = null, reason: string | null = 'spam'): Context => ({
  userId: 'u1',
  suspension: { reason, until },
})

/** Runs one request through a plugin the way Apollo does: requestDidStart, then didResolveOperation. */
async function resolveOperation(
  plugin: { requestDidStart?: (...args: any[]) => any },
  source: string,
  contextValue: Context
) {
  const document = parse(source)
  const operation = document.definitions.find(
    (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION
  )
  const hooks = await plugin.requestDidStart!({})
  return hooks.didResolveOperation({ operation, document, contextValue })
}

const MUTATION = 'mutation { vote(submissionId: "x") { id } }'
const QUERY = '{ battles { id } }'

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (e) {
    return e as GraphQLError
  }
  throw new Error('expected the request to be refused')
}

describe('createSuspensionBackstopPlugin', () => {
  const plugin = createSuspensionBackstopPlugin(clock)

  it('refuses a mutation from a suspended caller with FORBIDDEN and the reason', async () => {
    const err = await rejection(resolveOperation(plugin, MUTATION, suspended()))
    expect(err).toBeInstanceOf(GraphQLError)
    expect(err.extensions.code).toBe('FORBIDDEN')
    expect(err.message).toBe('Your account is suspended. Reason: spam')
  })

  it('leaves the reason out when there is none', async () => {
    const err = await rejection(resolveOperation(plugin, MUTATION, suspended(null, null)))
    expect(err.message).toBe('Your account is suspended.')
  })

  it('gives exactly the error requireAuth gives a suspended caller', async () => {
    for (const ctx of [suspended(), suspended(null, null), suspended(new Date(NOW.getTime() + HOUR), 'cool off')]) {
      const fromBackstop = await rejection(resolveOperation(plugin, MUTATION, ctx))
      let fromRequireAuth: GraphQLError | undefined
      try {
        requireAuth(ctx)
      } catch (e) {
        fromRequireAuth = e as GraphQLError
      }
      expect(fromBackstop.message).toBe(fromRequireAuth!.message)
      expect(fromBackstop.extensions).toEqual(fromRequireAuth!.extensions)
    }
  })

  it('refuses a suspension that has not reached its end date', async () => {
    const err = await rejection(resolveOperation(plugin, MUTATION, suspended(new Date(NOW.getTime() + HOUR))))
    expect(err.extensions.code).toBe('FORBIDDEN')
  })

  it('lets a mutation through when the suspension has expired', async () => {
    await expect(resolveOperation(plugin, MUTATION, suspended(new Date(NOW.getTime() - HOUR)))).resolves.toBeUndefined()
    // An end date of exactly now counts as over, the same as isSuspended.
    await expect(resolveOperation(plugin, MUTATION, suspended(NOW))).resolves.toBeUndefined()
  })

  it('lets a mutation through for a caller who is not suspended', async () => {
    await expect(resolveOperation(plugin, MUTATION, { userId: 'u1', suspension: null })).resolves.toBeUndefined()
    await expect(resolveOperation(plugin, MUTATION, { userId: 'u1' })).resolves.toBeUndefined()
  })

  it('leaves anonymous callers to the resolvers', async () => {
    await expect(resolveOperation(plugin, MUTATION, { userId: null })).resolves.toBeUndefined()
  })

  it('does not touch queries, so a suspended user can still read', async () => {
    await expect(resolveOperation(plugin, QUERY, suspended())).resolves.toBeUndefined()
  })

  it('does not touch subscriptions', async () => {
    await expect(resolveOperation(plugin, 'subscription { tick }', suspended())).resolves.toBeUndefined()
  })
})

describe('the suspension backstop next to the mutation limiter', () => {
  // Apollo runs every plugin's didResolveOperation at once (Promise.all) and reports the first failure.
  async function runBoth(limiter: ReturnType<typeof createLimiter>, source: string, ctx: Context) {
    const plugins = [createSuspensionBackstopPlugin(clock), createMutationLimitPlugin(limiter)]
    const document = parse(source)
    const operation = document.definitions.find(
      (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION
    )
    const listeners = await Promise.all(plugins.map((p) => (p.requestDidStart as any)({})))
    return Promise.all(listeners.map((l) => l.didResolveOperation({ operation, document, contextValue: ctx })))
  }

  it('still counts a refused mutation against the suspended user (pinned: the hooks run in parallel)', async () => {
    const limiter = createLimiter({ limit: 30, windowMs: 60_000, now: () => 1 })
    const hit = vi.spyOn(limiter, 'hit')
    const err = await rejection(runBoth(limiter, MUTATION, suspended()))
    expect(err.extensions.code).toBe('FORBIDDEN')
    expect(hit).toHaveBeenCalledTimes(1)
    expect(hit).toHaveBeenCalledWith('user:u1')
  })

  it('tells a suspended caller who is also over the limit that they are suspended', async () => {
    const limiter = createLimiter({ limit: 1, windowMs: 60_000, now: () => 1 })
    limiter.hit('user:u1')
    const err = await rejection(runBoth(limiter, MUTATION, suspended()))
    expect(err.extensions.code).toBe('FORBIDDEN')
  })

  it('does not count a query for a suspended user', async () => {
    const limiter = createLimiter({ limit: 30, windowMs: 60_000, now: () => 1 })
    const hit = vi.spyOn(limiter, 'hit')
    await runBoth(limiter, QUERY, suspended())
    expect(hit).not.toHaveBeenCalled()
  })

  it('passes a mutation from a user who is not suspended, and counts it', async () => {
    const limiter = createLimiter({ limit: 30, windowMs: 60_000, now: () => 1 })
    const hit = vi.spyOn(limiter, 'hit')
    await runBoth(limiter, MUTATION, { userId: 'u1', suspension: null })
    expect(hit).toHaveBeenCalledTimes(1)
  })
})

describe('the suspension backstop inside Apollo Server', () => {
  async function run(contextValue: Context, query: string) {
    const resolver = vi.fn(() => 'ok')
    const server = new ApolloServer<Context>({
      typeDefs: 'type Query { read: String } type Mutation { write: String }',
      // Neither resolver calls requireAuth: only the backstop can stop the mutation.
      resolvers: { Query: { read: resolver }, Mutation: { write: resolver } },
      plugins: [createSuspensionBackstopPlugin(clock)],
    })
    const response = await server.executeOperation({ query }, { contextValue })
    if (response.body.kind !== 'single') throw new Error('expected a single result')
    return { result: response.body.singleResult, resolver }
  }

  it('refuses a suspended caller\'s mutation before its resolver runs', async () => {
    const { result, resolver } = await run(suspended(), 'mutation { write }')
    expect(result.errors?.[0].extensions?.code).toBe('FORBIDDEN')
    expect(result.errors?.[0].message).toBe('Your account is suspended. Reason: spam')
    expect(resolver).not.toHaveBeenCalled()
  })

  it('still runs a query for a suspended caller', async () => {
    const { result, resolver } = await run(suspended(), '{ read }')
    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({ read: 'ok' })
    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('runs a mutation for a caller who is not suspended', async () => {
    const { result, resolver } = await run({ userId: 'u1', suspension: null }, 'mutation { write }')
    expect(result.errors).toBeUndefined()
    expect(resolver).toHaveBeenCalledTimes(1)
  })
})
