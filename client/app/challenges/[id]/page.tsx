import { ChallengeScreen } from '@/components/challenges/ChallengeScreen'

// Signed-out visitors go to sign-in and users without a username to onboarding in `middleware.ts`
// (`/challenges` is protected). Only the two DJs can read a challenge: the server answers anyone
// else with NOT_FOUND and the screen shows "This challenge isn't available".
export const dynamic = 'force-dynamic'

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return <ChallengeScreen id={id} />
}
