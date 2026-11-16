import { describe, it, expect } from 'vitest'
import { hasAccessError } from './graphql-errors'

describe('hasAccessError', () => {
  it('is true for FORBIDDEN and UNAUTHENTICATED', () => {
    expect(hasAccessError({ graphQLErrors: [{ extensions: { code: 'FORBIDDEN' } }] })).toBe(true)
    expect(hasAccessError({ graphQLErrors: [{ extensions: { code: 'UNAUTHENTICATED' } }] })).toBe(true)
  })
  it('is true when any one of several errors qualifies', () => {
    expect(
      hasAccessError({ graphQLErrors: [{ extensions: { code: 'BAD_USER_INPUT' } }, { extensions: { code: 'FORBIDDEN' } }] })
    ).toBe(true)
  })
  it('is false for other codes, no extensions, no errors or a network error', () => {
    expect(hasAccessError({ graphQLErrors: [{ extensions: { code: 'INTERNAL_SERVER_ERROR' } }] })).toBe(false)
    expect(hasAccessError({ graphQLErrors: [{}] })).toBe(false)
    expect(hasAccessError({ graphQLErrors: [] })).toBe(false)
    expect(hasAccessError({})).toBe(false)
  })
})
