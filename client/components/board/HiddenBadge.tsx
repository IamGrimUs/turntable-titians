import { Badge } from '@/components/ui/badge'

/**
 * The "Hidden" marker on an idea or comment. Admin-only: the server sends hidden items only to
 * admins, and the callers draw this only for them (it is an admin text size, 16px).
 */
export function HiddenBadge() {
  return (
    <Badge variant="outline" className="border-dashed text-base text-muted-foreground">
      Hidden
    </Badge>
  )
}
