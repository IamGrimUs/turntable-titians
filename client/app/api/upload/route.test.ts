import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const authMock = vi.fn()
vi.mock('@/auth', () => ({ auth: () => authMock() }))

const findUnique = vi.fn()
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }))

import { POST } from './route'
import { MAX_UPLOAD_BYTES } from '@/lib/upload-rules'

const FAKE_ENV = {
  R2_ACCOUNT_ID: 'acct123',
  R2_ACCESS_KEY_ID: '0123456789abcdef0123456789abcdef',
  R2_SECRET_ACCESS_KEY: 'f'.repeat(64),
  R2_BUCKET_NAME: 'test-bucket',
  NEXT_PUBLIC_R2_PUBLIC_URL: 'https://cdn.example.com',
}

function request(body: unknown, raw?: string) {
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  }) as never
}

beforeEach(() => {
  findUnique.mockReset()
  findUnique.mockResolvedValue({ suspendedAt: null, suspendedUntil: null })
  authMock.mockResolvedValue({ user: { id: 'user-abc' } })
  for (const [k, v] of Object.entries(FAKE_ENV)) vi.stubEnv(k, v)
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/upload', () => {
  it('returns 401 when not signed in', async () => {
    authMock.mockResolvedValue(null)
    const res = await POST(request({ contentType: 'image/png', size: 1000 }))
    expect(res.status).toBe(401)
  })

  it('returns 401 for a suspended user', async () => {
    findUnique.mockResolvedValue({ suspendedAt: new Date('2026-01-01'), suspendedUntil: null })
    const res = await POST(request({ contentType: 'image/png', size: 1000 }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when the user no longer exists', async () => {
    findUnique.mockResolvedValue(null)
    const res = await POST(request({ contentType: 'image/png', size: 1000 }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for a body that is not valid JSON', async () => {
    const res = await POST(request(null, 'not json'))
    expect(res.status).toBe(400)
  })

  it('returns 415 for a disallowed content type (e.g. html)', async () => {
    const res = await POST(request({ contentType: 'text/html', size: 1000 }))
    expect(res.status).toBe(415)
    expect((await res.json()).error).toMatch(/PNG, JPEG, or WebP/)
  })

  it('returns 413 for a file over the size limit', async () => {
    const res = await POST(request({ contentType: 'image/png', size: MAX_UPLOAD_BYTES + 1 }))
    expect(res.status).toBe(413)
  })

  it('returns a generic 500 and logs the NAMES (not values) of missing settings', async () => {
    vi.stubEnv('R2_SECRET_ACCESS_KEY', '')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(request({ contentType: 'image/png', size: 1000 }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Image uploads are not configured.')
    const logged = log.mock.calls.flat().join(' ')
    expect(logged).toContain('R2_SECRET_ACCESS_KEY')
    expect(logged).not.toContain(FAKE_ENV.R2_ACCESS_KEY_ID)
    log.mockRestore()
  })

  it('issues a signed URL for the caller\'s own folder, ignoring any filename they send', async () => {
    const res = await POST(
      request({ contentType: 'image/png', size: 1000, filename: '../../other-user/evil.html' })
    )
    expect(res.status).toBe(200)
    const { url, publicUrl } = await res.json()

    const parsed = new URL(url)
    expect(parsed.hostname).toBe('test-bucket.acct123.r2.cloudflarestorage.com')
    expect(parsed.pathname).toMatch(/^\/avatars\/user-abc\/[0-9a-f-]{36}\.png$/)
    expect(url).not.toContain('evil')
    expect(publicUrl).toMatch(/^https:\/\/cdn\.example\.com\/avatars\/user-abc\/[0-9a-f-]{36}\.png$/)
  })

  it('signs the content type and exact length into the URL so storage enforces them', async () => {
    const res = await POST(request({ contentType: 'image/jpeg', size: 4321 }))
    const { url } = await res.json()
    const signed = new URL(url).searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? []
    expect(signed).toContain('content-type')
    expect(signed).toContain('content-length')
    expect(new URL(url).pathname).toMatch(/\.jpg$/)
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('300')
  })

  it('does not add an empty-body checksum to the presigned URL', async () => {
    const res = await POST(request({ contentType: 'image/webp', size: 500 }))
    const { url } = await res.json()
    expect(url.toLowerCase()).not.toContain('checksum')
  })
})
