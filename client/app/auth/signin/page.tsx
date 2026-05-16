'use client'

import { signIn } from 'next-auth/react'
import { useActionState } from 'react'
import { sendMagicLink } from './actions'

const fieldClass =
  'w-full rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors'

export default function SignInPage() {
  const [state, action, pending] = useActionState(sendMagicLink, undefined)

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

        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="w-full rounded-md border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-3"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {state?.error && (
            <p className="text-center text-sm text-red-500 py-2">{state.error}</p>
          )}

          <form action={action} className="space-y-3">
            <input
              type="email"
              name="email"
              required
              placeholder="your@email.com"
              className={fieldClass}
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-amber-500 px-6 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-amber-400 disabled:opacity-50 transition-all"
            >
              {pending ? 'Sending…' : 'Send Magic Link'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
