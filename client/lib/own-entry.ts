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

/**
 * In a head to head battle the two DJs cannot vote at all, on either entry (the server enforces it
 * too). This is the reason shown in place of the vote button.
 */
export const DUELIST_NOTE = "You're in this head-to-head battle, so you can't vote in it"

type DuelPair = { challenger: { id: string }; opponent: { id: string } }

export function isDuelist(currentUserId: string | null, duel: DuelPair | null | undefined): boolean {
  return currentUserId !== null && !!duel && (currentUserId === duel.challenger.id || currentUserId === duel.opponent.id)
}

/**
 * Why the vote button is replaced by a note, or null when the viewer can vote. A duelist is blocked
 * on both entries and gets only the head to head reason, never "this is your entry". The take-back
 * exception for a vote cast before the own-entry rule existed does not apply to duels, which never
 * allowed such a vote. Everyone else follows the own-entry rule. Whether the battle is ACTIVE, and
 * whether the viewer is signed in, are decided by the callers.
 */
export function voteBlockNote({
  currentUserId,
  entryOwnerId,
  isVotedHere,
  duel,
}: {
  currentUserId: string | null
  entryOwnerId: string
  isVotedHere: boolean
  duel?: DuelPair | null
}): string | null {
  if (isDuelist(currentUserId, duel)) return DUELIST_NOTE
  return ownEntryBlocksVote({ currentUserId, entryOwnerId, isVotedHere }) ? OWN_ENTRY_NOTE : null
}
