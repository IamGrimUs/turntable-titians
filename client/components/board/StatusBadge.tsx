import { Badge } from '@/components/ui/badge'
import { statusLabel, statusTone, type IdeaStatus, type StatusTone } from '@/lib/board-view'

const TONE_VARIANT: Record<StatusTone, 'active' | 'upcoming' | 'destructive' | 'completed'> = {
  good: 'active',
  warn: 'upcoming',
  danger: 'destructive',
  neutral: 'completed',
}

/** Idea status as a coloured badge; shared by the list card and the detail page. */
export function StatusBadge({ status, className }: { status: IdeaStatus; className?: string }) {
  return (
    <Badge variant={TONE_VARIANT[statusTone(status)]} className={className}>
      {statusLabel(status)}
    </Badge>
  )
}
