'use client'

import { useQuery } from '@apollo/client'
import { useParams } from 'next/navigation'
import { gql } from '@apollo/client'

const GET_USER = gql`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      username
      name
      image
      externalCrews
      submissions {
        id
        title
        battleId
        voteCount
        createdAt
      }
    }
  }
`

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { data, loading, error } = useQuery(GET_USER, { variables: { id } })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-full p-8">
        <p className="text-muted-foreground">Loading profile…</p>
      </div>
    )
  }

  if (error || !data?.user) {
    return (
      <div className="flex items-center justify-center min-h-full p-8">
        <p className="text-destructive">User not found.</p>
      </div>
    )
  }

  const user = data.user

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-6 mb-8">
        {user.image ? (
          <img
            src={user.image}
            alt={user.username ?? user.name ?? 'User'}
            className="h-20 w-20 rounded-full object-cover border border-border"
          />
        ) : (
          <div className="h-20 w-20 rounded-full bg-accent border border-border flex items-center justify-center text-2xl font-bold text-muted-foreground">
            {(user.username ?? user.name ?? '?')[0].toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-graffiti text-foreground">
            {user.username ?? user.name ?? 'Anonymous'}
          </h1>
          {user.externalCrews.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {user.externalCrews.map((crew: string) => (
                <span
                  key={crew}
                  className="rounded-full bg-amber-500/10 px-3 py-0.5 text-xs font-semibold text-amber-500"
                >
                  {crew}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-4">
          Submissions
        </h2>
        {user.submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions yet.</p>
        ) : (
          <div className="space-y-2">
            {user.submissions.map((sub: { id: string; title?: string; voteCount: number; createdAt: string }) => (
              <div
                key={sub.id}
                className="flex justify-between items-center rounded-md border border-border px-4 py-3 text-sm"
              >
                <span className="text-foreground">{sub.title ?? 'Untitled'}</span>
                <span className="text-muted-foreground">{sub.voteCount} votes</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
