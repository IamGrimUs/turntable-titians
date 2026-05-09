import Link from 'next/link'

export default function VerifyRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8">
          <p className="text-xs font-bold tracking-[0.3em] uppercase text-amber-500 mb-2">
            Turntable Titans
          </p>
          <h1 className="text-3xl font-black tracking-tight uppercase text-foreground">
            Check Your Email
          </h1>
          <div className="mt-3 h-px bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
        </div>

        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            A sign-in link has been sent to your email address. Click the link to sign in.
          </p>
          <Link
            href="/auth/signin"
            className="block text-xs text-amber-500 hover:text-amber-400 transition-colors"
          >
            Use a different email
          </Link>
        </div>
      </div>
    </div>
  )
}
