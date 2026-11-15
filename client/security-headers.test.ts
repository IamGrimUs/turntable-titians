import { describe, it, expect } from 'vitest'
const { buildCsp, buildHeaders } = require('./security-headers.js')

const directive = (csp: string, name: string) =>
  csp.split(';').map((d: string) => d.trim()).find((d: string) => d.startsWith(`${name} `)) ?? ''

describe('buildCsp', () => {
  const csp = buildCsp({ isDev: false, graphqlUrl: 'https://api.example.up.railway.app/graphql' })

  it('denies everything by default and forbids plugins, framing and base tag tricks', () => {
    expect(directive(csp, 'default-src')).toBe("default-src 'self'")
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'")
  })

  it('allows only YouTube to be embedded', () => {
    const frames = directive(csp, 'frame-src')
    expect(frames).toContain('https://www.youtube.com')
    expect(frames).not.toContain('*')
  })

  it('lets the browser talk to this site, the API (origin only) and R2 uploads, and nothing else', () => {
    const connect = directive(csp, 'connect-src')
    expect(connect).toContain("'self'")
    expect(connect).toContain('https://api.example.up.railway.app')
    expect(connect).not.toContain('/graphql')
    expect(connect).toContain('https://*.r2.cloudflarestorage.com')
    expect(connect).not.toMatch(/\bhttps:(\s|$)/)
  })

  it('allows images from any https host (avatars can come from anywhere), plus data/blob', () => {
    const img = directive(csp, 'img-src')
    for (const s of ["'self'", 'data:', 'blob:', 'https:']) expect(img).toContain(s)
  })

  it('only allows eval and websockets in development', () => {
    expect(directive(csp, 'script-src')).not.toContain('unsafe-eval')
    expect(csp).not.toContain('ws:')
    const dev = buildCsp({ isDev: true, graphqlUrl: 'http://localhost:3001/graphql' })
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'")
    expect(dev).toContain('ws:')
    expect(dev).not.toContain('upgrade-insecure-requests')
  })

  it('upgrades insecure requests in production', () => {
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('does not break on a missing or malformed API url', () => {
    expect(() => buildCsp({ isDev: false, graphqlUrl: undefined })).not.toThrow()
    expect(() => buildCsp({ isDev: false, graphqlUrl: 'not a url' })).not.toThrow()
  })
})

describe('buildHeaders', () => {
  const get = (headers: { key: string; value: string }[], key: string) => headers.find((h) => h.key === key)

  it('always sends the simple hardening headers', () => {
    const h = buildHeaders({ isDev: false, enforce: false })
    expect(get(h, 'X-Content-Type-Options')?.value).toBe('nosniff')
    expect(get(h, 'X-Frame-Options')?.value).toBe('DENY')
    expect(get(h, 'Referrer-Policy')?.value).toBe('strict-origin-when-cross-origin')
    expect(get(h, 'Permissions-Policy')?.value).toContain('camera=()')
    expect(get(h, 'Strict-Transport-Security')?.value).toMatch(/max-age=\d+/)
  })

  it('sends the CSP as report-only unless enforcement is switched on', () => {
    const report = buildHeaders({ isDev: false, enforce: false })
    expect(get(report, 'Content-Security-Policy-Report-Only')).toBeTruthy()
    expect(get(report, 'Content-Security-Policy')).toBeUndefined()
    const enforced = buildHeaders({ isDev: false, enforce: true })
    expect(get(enforced, 'Content-Security-Policy')).toBeTruthy()
    expect(get(enforced, 'Content-Security-Policy-Report-Only')).toBeUndefined()
  })

  it('does not send HSTS in development (it would stick to localhost)', () => {
    expect(get(buildHeaders({ isDev: true, enforce: false }), 'Strict-Transport-Security')).toBeUndefined()
  })
})
