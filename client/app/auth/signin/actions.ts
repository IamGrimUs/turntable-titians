'use server'

import { signIn } from '@/auth'
import { db } from '@/lib/db'
import { checkSignIn, clientIp, findRateLimitError, rateLimitMessage } from '@/lib/signin-limits'
import { AuthError } from 'next-auth'
import { headers } from 'next/headers'

export async function sendMagicLink(
  _prevState: { error: string } | undefined,
  formData: FormData
) {
  const email = String(formData.get('email') ?? '')

  // Only PEEK here, to show a friendly message early. The attempt is counted where
  // the email is actually sent (lib/send-verification-email.ts), so it isn't counted twice.
  const verdict = await checkSignIn(db, {
    email,
    ip: clientIp(await headers()),
    mode: 'peek',
  })
  if (!verdict.allowed) return { error: rateLimitMessage(verdict.retryAfterSeconds) }

  try {
    await signIn('resend', {
      email,
      redirectTo: '/',
    })
  } catch (error) {
    const limited = findRateLimitError(error)
    if (limited) return { error: rateLimitMessage(limited.retryAfterSeconds) }
    if (error instanceof AuthError) {
      return { error: 'Could not send the sign-in email. Please try again in a few minutes.' }
    }
    throw error // re-throw NEXT_REDIRECT so Next.js handles it
  }
}
