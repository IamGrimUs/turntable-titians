import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendVerificationEmail } from './send-verification-email'
import { RateLimitError } from './signin-limits'

const params = (headers: Record<string, string> = {}) =>
  ({
    identifier: 'person@example.com',
    url: 'https://app.example/api/auth/callback/resend?token=abc',
    provider: { apiKey: 're_test_key', from: 'Battle Skratch <noreply@example.com>' },
    request: new Request('https://app.example/api/auth/signin/resend', { headers }),
  }) as never

const allowed = () => ({ allowed: true as const })
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => logSpy.mockRestore())

describe('sendVerificationEmail', () => {
  it('sends the email through Resend with the key, recipient and link', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'x' }), { status: 200 }))
    await sendVerificationEmail(params(), { check: vi.fn().mockResolvedValue(allowed()), fetchImpl })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer re_test_key')
    const body = JSON.parse(init.body)
    expect(body.to).toBe('person@example.com')
    expect(body.html).toContain('https://app.example/api/auth/callback/resend?token=abc')
  })

  it('checks the limit BEFORE sending, using the caller\'s email and IP, and counts the attempt', async () => {
    const check = vi.fn().mockResolvedValue(allowed())
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await sendVerificationEmail(params({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }), { check, fetchImpl })
    expect(check).toHaveBeenCalledWith({ email: 'person@example.com', ip: '203.0.113.5', mode: 'consume' })
  })

  it('refuses with a RateLimitError, and does NOT call Resend, when over the limit', async () => {
    const check = vi.fn().mockResolvedValue({ allowed: false, reason: 'email', retryAfterSeconds: 900 })
    const fetchImpl = vi.fn()
    const err = await sendVerificationEmail(params(), { check, fetchImpl }).catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect(err.retryAfterSeconds).toBe(900)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('throws a clear error when Resend rejects the email, including its status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'domain not verified' }), { status: 403 }))
    await expect(
      sendVerificationEmail(params(), { check: vi.fn().mockResolvedValue(allowed()), fetchImpl })
    ).rejects.toThrow(/403/)
  })

  it('does not log the Resend response (it contains email metadata)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'secret-message-id' }), { status: 200 }))
    await sendVerificationEmail(params(), { check: vi.fn().mockResolvedValue(allowed()), fetchImpl })
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('does not break on an unreadable Resend error body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }))
    await expect(
      sendVerificationEmail(params(), { check: vi.fn().mockResolvedValue(allowed()), fetchImpl })
    ).rejects.toThrow(/502/)
  })
})
