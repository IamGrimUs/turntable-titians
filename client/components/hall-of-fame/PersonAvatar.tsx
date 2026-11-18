'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { initialsOf, type Person } from '@/lib/hall-of-fame-view'

/**
 * A round avatar. The name is always shown beside it, so the picture is decorative; when the image
 * is missing or fails to load, the person's initials are shown instead.
 */
export function PersonAvatar({
  user,
  size = 44,
  highlighted = false,
}: {
  user: Person
  size?: number
  highlighted?: boolean
}) {
  const [failed, setFailed] = useState(false)
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-muted text-base font-bold text-foreground',
        highlighted ? 'border-amber-500' : 'border-border',
      )}
      style={{ width: size, height: size }}
    >
      {user.image && !failed ? (
        <img src={user.image} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initialsOf(user)}</span>
      )}
    </div>
  )
}
