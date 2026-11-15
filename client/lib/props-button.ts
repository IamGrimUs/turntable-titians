/**
 * The wording of the vote button. Kept in one place so the card, the video modal and the
 * How It Works page always agree, and so the phrase is a one-line change.
 * (One vote per battle, secret until results.)
 */
export const PROPS_LABELS = {
  give: 'Vote',
  given: 'Voted',
  busy: '…',
} as const

export function propsButtonLabel({ loading, isVotedHere }: { loading: boolean; isVotedHere: boolean }): string {
  if (loading) return PROPS_LABELS.busy
  return isVotedHere ? PROPS_LABELS.given : PROPS_LABELS.give
}
