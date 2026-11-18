import { ChallengeForm } from '@/components/challenges/ChallengeForm'
import { prefillUsername } from '@/lib/challenge-form'
import { CHALLENGE_LIMITS } from '@/lib/challenge-view'

// Signed-out visitors go to sign-in and users without a username to onboarding in `middleware.ts`,
// the same way as `/battles/create`. The server re-checks who may challenge whom.
export const dynamic = 'force-dynamic'

export default async function NewChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string | string[] }>
}) {
  const { to } = await searchParams

  return (
    <div className="min-h-full p-4 sm:p-8 flex items-start justify-center">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <p className="text-xl font-graffiti text-amber-500 mb-2">Battle Skratch</p>
          <h1 className="text-3xl font-graffiti text-foreground">Challenge a DJ</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Call out one DJ to a head to head battle. They have {CHALLENGE_LIMITS.answerDays} days to answer.
          </p>
          <div className="mt-3 h-px bg-gradient-to-r from-amber-500 to-transparent" />
        </div>

        <ChallengeForm initialUsername={prefillUsername(to)} />
      </div>
    </div>
  )
}
