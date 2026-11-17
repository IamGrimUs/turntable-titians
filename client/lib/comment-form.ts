/**
 * Pure helpers for the comment form and list. UI convenience only: the server re-checks
 * every rule (length, links, duplicates, the daily cap) and its message is what the user sees.
 */

/** A comment needs some text; whitespace alone does not count. */
export function canSubmitComment(body: string): boolean {
  return body.trim().length > 0
}

/**
 * True when the server sent fewer comments than the idea has (it caps the list), so the page
 * can say that only the first ones are shown.
 */
export function isCommentListTruncated(commentCount: number, shown: number): boolean {
  return commentCount > shown
}
