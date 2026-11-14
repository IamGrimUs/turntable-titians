import { checkSignIn, clientIp, RateLimitError, type SignInVerdict } from './signin-limits'

/** The parts of Auth.js's sendVerificationRequest parameters that we use. */
export interface VerificationParams {
  identifier: string
  url: string
  provider: { apiKey?: string; from?: string }
  request: Request
}

interface Deps {
  check?: (input: { email: string; ip: string | null; mode: 'consume' }) => Promise<SignInVerdict>
  fetchImpl?: typeof fetch
}

/**
 * Sends the magic-link email through Resend.
 *
 * Every sign-in email in the app passes through here, whether it came from our
 * form or from someone calling the Auth.js endpoint directly, which makes this
 * the one place a rate limit cannot be bypassed.
 */
export async function sendVerificationEmail(
  { identifier, url, provider, request }: VerificationParams,
  deps: Deps = {}
): Promise<void> {
  const check =
    deps.check ??
    (async (input) => {
      const { db } = await import('./db') // loaded lazily: only needed when we really check
      return checkSignIn(db, input)
    })
  const fetchImpl = deps.fetchImpl ?? fetch

  const verdict = await check({ email: identifier, ip: clientIp(request.headers), mode: 'consume' })
  if (!verdict.allowed) throw new RateLimitError(verdict.retryAfterSeconds)

  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: provider.from,
      to: identifier,
      subject: 'Sign in to Battle Skratch',
      html: `<p>Click <a href="${url}">here</a> to sign in.</p>`,
    }),
  })

  if (!res.ok) {
    let detail = ''
    try {
      detail = JSON.stringify(await res.json())
    } catch {
      // the body wasn't JSON; the status code alone is enough
    }
    throw new Error(`Resend error ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  // Deliberately no logging of the success response: it contains email metadata.
}
