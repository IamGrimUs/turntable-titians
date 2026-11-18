import { Badge } from '@/components/ui/badge'
import { waitingCountText } from '@/lib/profile-challenges'

/**
 * The amber count on the Profile nav item. Put it inside a `relative` wrapper around the icon: it is
 * positioned over the icon's top-right corner, so it never changes the nav layout (the bottom nav is
 * five equal items at 375px). The text is capped at "9+"; the link's own aria-label carries the true
 * number, so the pill itself is hidden from screen readers.
 */
export function WaitingPill({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <Badge
      variant="upcoming"
      aria-hidden="true"
      className="pointer-events-none absolute -top-2 -right-3 min-w-5 justify-center border-transparent bg-amber-500 px-1.5 py-0 text-black"
    >
      {waitingCountText(count)}
    </Badge>
  )
}
