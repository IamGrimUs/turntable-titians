'use client'

import { useQuery } from '@apollo/client'
import { useSession } from 'next-auth/react'
import { GET_CHALLENGES_WAITING } from '@/lib/graphql/challenges'
import { waitingCount, waitingQueryOptions } from '@/lib/profile-challenges'

/**
 * How many challenges wait for the signed-in user's answer (the number on the Profile nav item).
 * No request is made when signed out (the result is 0). The server's count already leaves out
 * expired challenges. Sidebar and BottomNav both call this; Apollo shares the one cached result.
 */
export function useChallengesWaiting(): number {
  const { data: session } = useSession()
  const signedIn = Boolean(session?.user)
  const { data } = useQuery(GET_CHALLENGES_WAITING, waitingQueryOptions(signedIn))
  return waitingCount(data, signedIn)
}
