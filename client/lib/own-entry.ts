/**
 * Nobody votes for their own entry (the server enforces it; this keeps the button from
 * offering something that can only fail). One exception: a vote someone already cast for
 * themselves before the rule existed still shows its button, so they can take it back.
 */
export const OWN_ENTRY_NOTE = 'This is your entry, so you can’t vote for it.'

export function isOwnEntry(currentUserId: string | null, entryOwnerId: string): boolean {
  return currentUserId !== null && currentUserId === entryOwnerId
}

export function ownEntryBlocksVote({
  currentUserId,
  entryOwnerId,
  isVotedHere,
}: {
  currentUserId: string | null
  entryOwnerId: string
  isVotedHere: boolean
}): boolean {
  return isOwnEntry(currentUserId, entryOwnerId) && !isVotedHere
}
