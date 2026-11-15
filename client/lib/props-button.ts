/**
 * The wording of the button people press to back an entry. Kept in one place so the
 * card and the video modal always agree, and so the phrase is a one-line change.
 * (Behind the scenes this is still a vote: one per battle, secret until results.)
 */
export const PROPS_LABELS = {
  give: 'Give Flowers',
  given: 'Flowers Given',
  busy: '…',
} as const

export function propsButtonLabel({ loading, isVotedHere }: { loading: boolean; isVotedHere: boolean }): string {
  if (loading) return PROPS_LABELS.busy
  return isVotedHere ? PROPS_LABELS.given : PROPS_LABELS.give
}
