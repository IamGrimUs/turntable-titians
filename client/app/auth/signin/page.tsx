'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { SignInForm } from '@/components/SignInForm'

// Auth.js redirects back here with ?error=<code> when a sign-in fails.
const ERROR_MESSAGES: Record<string, string> = {
  EmailSignin:
    "We couldn't send the sign-in email. If you've asked for several, wait a while and try again.",
  OAuthAccountNotLinked:
    'That email is already registered with a different sign-in method. Use the method you signed up with.',
  EmailBlocked: "That email address can't be used to sign in.",
  Verification: 'That sign-in link has expired or was already used. Request a new one.',
}

function UrlError() {
  const code = useSearchParams().get('error')
  if (!code) return null
  const message = ERROR_MESSAGES[code] ?? 'Something went wrong signing you in. Please try again.'
  return <p className="text-center text-base text-red-500 py-2">{message}</p>
}

export default function SignInPage() {
  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xl font-graffiti text-amber-500 mb-2">
            Battle Skratch
          </p>
          <h1 className="text-3xl font-graffiti text-foreground">
            Sign In
          </h1>
          <div className="mt-3 h-px bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <SignInForm
            errorSlot={
              <Suspense fallback={null}>
                <UrlError />
              </Suspense>
            }
          />
        </div>
      </div>
    </div>
  )
}
