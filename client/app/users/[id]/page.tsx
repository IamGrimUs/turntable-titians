'use client'

import { useQuery } from '@apollo/client'
import { VoteCount } from '@/components/VoteCount'
import { buildProfileStats } from '@/lib/user-profile-stats'
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
      battlesWon
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

function StatCard({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border px-4 py-3">
      <p className={accent ? 'text-xl font-bold text-amber-500' : 'text-2xl font-bold text-foreground'}>{value}</p>
      <p className="text-base text-muted-foreground">{label}</p>
    </div>
  )
}

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
  const stats = buildProfileStats(user)

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
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        <StatCard label="Battles won" value={stats.battlesWon} />
        <StatCard label="Battles entered" value={stats.battlesEntered} />
        {stats.crew && <StatCard label={stats.crew.label} value={stats.crew.names} accent />}
      </div>

      <div>
        <h2 className="text-base font-bold tracking-widest uppercase text-muted-foreground mb-4">
          Submissions
        </h2>
        {user.submissions.length === 0 ? (
          <p className="text-base text-muted-foreground">No submissions yet.</p>
        ) : (
          <div className="space-y-2">
            {user.submissions.map((sub: { id: string; title?: string; voteCount: number | null; createdAt: string }) => (
              <div
                key={sub.id}
                className="flex justify-between items-center rounded-md border border-border px-4 py-3 text-base"
              >
                <span className="text-foreground">{sub.title ?? 'Untitled'}</span>
                <VoteCount voteCount={sub.voteCount} suffix=" votes" className="text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
