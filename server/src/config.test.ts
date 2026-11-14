import { describe, it, expect } from 'vitest'
import { getInternalApiSecret } from './config'

describe('getInternalApiSecret', () => {
  it('throws when INTERNAL_API_SECRET is missing', () => {
    expect(() => getInternalApiSecret({})).toThrow(/INTERNAL_API_SECRET/)
  })

  it('throws when INTERNAL_API_SECRET is empty or only whitespace', () => {
    expect(() => getInternalApiSecret({ INTERNAL_API_SECRET: '' })).toThrow(/INTERNAL_API_SECRET/)
    expect(() => getInternalApiSecret({ INTERNAL_API_SECRET: '   ' })).toThrow(/INTERNAL_API_SECRET/)
  })

  it('rejects the old publicly-known default secret', () => {
    expect(() =>
      getInternalApiSecret({ INTERNAL_API_SECRET: 'dev-secret-change-me' })
    ).toThrow(/INTERNAL_API_SECRET/)
  })

  it('returns the secret as bytes when it is set', () => {
    const secret = getInternalApiSecret({ INTERNAL_API_SECRET: 'a-real-random-secret-value' })
    expect(secret).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(secret)).toBe('a-real-random-secret-value')
  })

  it('does not leak the secret value in the error message', () => {
    try {
      getInternalApiSecret({ INTERNAL_API_SECRET: 'dev-secret-change-me' })
      expect.unreachable()
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('dev-secret-change-me')
    }
  })
})
