import { describe, it, expect } from 'vitest'
const { buildRedirects } = require('./redirects.js')

describe('buildRedirects', () => {
  const [rule] = buildRedirects()

  it('permanently sends the bare domain to www, keeping the path and query', () => {
    expect(rule.source).toBe('/:path*')
    expect(rule.has).toEqual([{ type: 'host', value: 'battleskratch.com' }])
    expect(rule.destination).toBe('https://www.battleskratch.com/:path*')
    expect(rule.permanent).toBe(true)
  })

  it('does not match www, localhost or preview hosts (no redirect loops)', () => {
    const hosts = rule.has.map((h: { value: string }) => h.value)
    expect(hosts).toEqual(['battleskratch.com'])
  })
})
