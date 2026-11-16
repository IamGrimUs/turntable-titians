import { describe, it, expect } from 'vitest'
import { ApolloServer, HeaderMap } from '@apollo/server'
import { buildPlugins } from './plugins'
import { createLimiter } from './rateLimit'
import type { Context } from './context'

const typeDefs = `#graphql
  type Query { ok: Boolean }
  type Mutation { ping: Boolean }
`
const resolvers = { Query: { ok: () => true }, Mutation: { ping: () => true } }

async function post(plugins: ReturnType<typeof buildPlugins>, contextValue: Context, query: string) {
  const server = new ApolloServer<Context>({ typeDefs, resolvers, plugins })
  await server.start()
  try {
    const response = await server.executeHTTPGraphQLRequest({
      httpGraphQLRequest: {
        method: 'POST',
        headers: new HeaderMap([['content-type', 'application/json']]),
        search: '',
        body: { query },
      },
      context: async () => contextValue,
    })
    if (response.body.kind !== 'complete') throw new Error('expected a complete response')
    return JSON.parse(response.body.string) as { data?: unknown; errors?: Array<{ message: string; extensions: { code?: string } }> }
  } finally {
    await server.stop()
  }
}

/** A limiter whose counter for this caller is already used up, so the next hit is refused. */
function exhausted() {
  const limiter = createLimiter({ limit: 1, windowMs: 60_000 })
  limiter.hit('user:u1')
  return limiter
}

const MUTATION = 'mutation { ping }'
const suspended: Context = { userId: 'u1', suspension: { reason: 'spam', until: null } }
const signedIn: Context = { userId: 'u1' }

describe('buildPlugins', () => {
  it('lists the suspension backstop first: a suspended caller who is also over the limit is told they are suspended', async () => {
    const result = await post(buildPlugins(false, exhausted()), suspended, MUTATION)
    expect(result.errors?.[0].message).toBe('Your account is suspended. Reason: spam')
    expect(result.errors?.[0].extensions.code).toBe('FORBIDDEN')
  })

  it('still limits a caller who is not suspended', async () => {
    const result = await post(buildPlugins(false, exhausted()), signedIn, MUTATION)
    expect(result.errors?.[0].extensions.code).toBe('RATE_LIMITED')
  })

  it('keeps the suspension backstop when the rate-limit emergency switch is on', async () => {
    const plugins = buildPlugins(true, exhausted())
    expect(plugins).toHaveLength(1)
    const result = await post(plugins, suspended, MUTATION)
    expect(result.errors?.[0].extensions.code).toBe('FORBIDDEN')
  })

  it('drops the mutation limiter when the emergency switch is on', async () => {
    const result = await post(buildPlugins(true, exhausted()), signedIn, MUTATION)
    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({ ping: true })
  })

  it('has both plugins by default', () => {
    expect(buildPlugins(false)).toHaveLength(2)
  })
})
