import { describe, it, expect } from 'vitest'
import { getEmailConfig, getInternalApiSecret } from './config'

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

describe('getEmailConfig', () => {
  const full = { RESEND_API_KEY: 're_fake_key', EMAIL_FROM: 'Battle Skratch <hi@example.com>', SITE_URL: 'https://example.com' }

  it('returns the three settings when all are set', () => {
    expect(getEmailConfig(full)).toEqual({
      apiKey: 're_fake_key',
      from: 'Battle Skratch <hi@example.com>',
      siteUrl: 'https://example.com',
    })
  })

  it('is null when any of the three is missing, empty or only whitespace', () => {
    for (const name of Object.keys(full)) {
      expect(getEmailConfig({ ...full, [name]: undefined })).toBeNull()
      expect(getEmailConfig({ ...full, [name]: '' })).toBeNull()
      expect(getEmailConfig({ ...full, [name]: '   ' })).toBeNull()
    }
    expect(getEmailConfig({})).toBeNull()
  })

  it('accepts an https SITE_URL with or without a trailing slash', () => {
    expect(getEmailConfig({ ...full, SITE_URL: 'https://www.battleskratch.com' })?.siteUrl).toBe(
      'https://www.battleskratch.com'
    )
    expect(getEmailConfig({ ...full, SITE_URL: 'https://www.battleskratch.com/' })?.siteUrl).toBe(
      'https://www.battleskratch.com/'
    )
  })

  it.each(['battleskratch.com', 'www.battleskratch.com/path', 'http://www.battleskratch.com', 'javascript:alert(1)', 'ftp://x.io', 'https://'])(
    'is null when SITE_URL is not an https URL (%s)',
    (siteUrl) => {
      expect(getEmailConfig({ ...full, SITE_URL: siteUrl })).toBeNull()
    }
  )

  it('trims the values', () => {
    expect(getEmailConfig({ RESEND_API_KEY: ' k ', EMAIL_FROM: ' a@b.c ', SITE_URL: ' https://x.io ' })).toEqual({
      apiKey: 'k',
      from: 'a@b.c',
      siteUrl: 'https://x.io',
    })
  })
})
