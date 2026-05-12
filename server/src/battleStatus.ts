export type BattleStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED'

function toDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function computeBattleStatus(
  startDate: Date,
  endDate: Date,
  today: Date = new Date()
): BattleStatus {
  const start = toDay(startDate)
  const end = toDay(endDate)
  const now = toDay(today)

  if (now < start) return 'UPCOMING'
  if (now > end) return 'COMPLETED'
  return 'ACTIVE'
}
