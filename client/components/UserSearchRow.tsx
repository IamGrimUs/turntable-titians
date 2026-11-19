import { cn } from '@/lib/utils'
import { PersonAvatar } from '@/components/hall-of-fame/PersonAvatar'
import type { UserSearchResult } from '@/lib/user-search'

/**
 * One DJ in a search result: avatar, username and crew, in the Hall of Fame row look. Presentational
 * only; the caller wraps it in an option or a link. `active` is the highlighted row.
 */
export function UserSearchRow({ user, active = false }: { user: UserSearchResult; active?: boolean }) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors',
        active ? 'border-amber-500' : 'border-border',
      )}
    >
      <PersonAvatar user={{ ...user, name: null }} size={44} highlighted={active} />
      <div className="min-w-0">
        <span className="block truncate text-lg font-bold leading-tight" dir="auto">
          {user.username}
        </span>
        {user.crew && (
          <span className="block truncate text-base text-muted-foreground" dir="auto">
            {user.crew}
          </span>
        )}
      </div>
    </div>
  )
}
