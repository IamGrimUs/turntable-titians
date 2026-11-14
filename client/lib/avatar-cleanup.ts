/**
 * Logic for deciding which stored avatars are safe to delete. Pure functions,
 * so the rules that protect users' files are easy to test.
 */

// Uploads younger than this are kept: they may be a pending change the user
// hasn't saved yet (e.g. in another tab). Signed upload URLs expire in 5 minutes.
export const MIN_AGE_MS = 10 * 60 * 1000

const DEFAULT_MAX_DELETES = 50

export function avatarPrefix(userId: string): string {
  return `avatars/${userId}/`
}

/**
 * Finds the storage key of the user's current avatar from the image URL saved
 * on their profile, or null if the image isn't one of their stored avatars
 * (for example a Google profile photo).
 *
 * It looks for the user's own `avatars/<userId>/` folder in the URL path and
 * ignores the host on purpose. If the public URL or domain ever changes, the
 * avatar in use must still be recognised as current and not deleted.
 */
export function keyFromImageUrl(imageUrl: string | null | undefined, userId: string): string | null {
  if (!imageUrl) return null
  let pathname: string
  try {
    pathname = new URL(imageUrl).pathname
  } catch {
    return null
  }
  const path = '/' + pathname.replace(/^\/+/, '')
  const marker = '/' + avatarPrefix(userId)
  const index = path.indexOf(marker)
  return index === -1 ? null : path.slice(index + 1)
}

export interface StoredObject {
  key: string
  lastModified: Date | undefined
}

/**
 * Chooses which of the user's stored avatars to delete: everything except the
 * current one and anything recent. Keys outside the user's own folder are never
 * selected, even if they were somehow listed.
 */
export function selectStaleAvatarKeys(args: {
  objects: StoredObject[]
  prefix: string
  currentKey: string | null
  now: Date
  minAgeMs?: number
  maxDeletes?: number
}): string[] {
  const { objects, prefix, currentKey, now, minAgeMs = MIN_AGE_MS, maxDeletes = DEFAULT_MAX_DELETES } = args
  return objects
    .filter((o) => o.key.startsWith(prefix))
    .filter((o) => o.key !== currentKey)
    // Unknown age: skip rather than risk deleting a fresh upload.
    .filter((o) => o.lastModified !== undefined && now.getTime() - o.lastModified.getTime() >= minAgeMs)
    .map((o) => o.key)
    .slice(0, maxDeletes)
}
