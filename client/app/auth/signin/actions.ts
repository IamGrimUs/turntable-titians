'use server'

import { signIn } from '@/auth'
import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'

export async function sendMagicLink(
  _prevState: { error: string } | undefined,
  formData: FormData
) {
  const email = formData.get('email') as string
  try {
    await signIn('resend', {
      email,
      redirectTo: '/',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: `Failed to send magic link: ${error.message}` }
    }
    throw error // re-throw NEXT_REDIRECT so Next.js handles it
  }
}
