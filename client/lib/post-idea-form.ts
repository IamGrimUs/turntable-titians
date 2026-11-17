/**
 * Pure helpers for the "Post an idea" form. UI convenience only: the server re-checks every
 * rule (lengths, links, duplicates, the daily cap) and its message is what the user sees.
 */

export interface IdeaDraft {
  title: string
  body: string
  category: string | null
}

/** Characters left before `max`; negative never shows because inputs carry `maxLength`. */
export function remainingChars(value: string, max: number): number {
  return Math.max(0, max - value.length)
}

/** Title, body and category are required; whitespace alone does not count. */
export function canSubmitIdea(draft: IdeaDraft): boolean {
  return draft.title.trim().length > 0 && draft.body.trim().length > 0 && !!draft.category
}
