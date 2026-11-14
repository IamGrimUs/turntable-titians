/**
 * Avatar upload rules, shared by the /api/upload route (which enforces them)
 * and the browser helper (which checks them early for friendlier errors).
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5 MB

// Exact content types we accept, mapped to the file extension we store them under.
// Deliberately excludes SVG and HTML, which can carry scripts.
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export const TYPE_ERROR_MESSAGE = 'Please choose a PNG, JPEG, or WebP image.'
export const SIZE_ERROR_MESSAGE = `Image is too large. The maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`

export type UploadValidation =
  | { ok: true; contentType: string; size: number; extension: string }
  | { ok: false; status: 400 | 413 | 415; message: string }

export function validateUploadRequest(input: unknown): UploadValidation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, status: 400, message: 'Invalid upload request.' }
  }
  const { contentType, size } = input as { contentType?: unknown; size?: unknown }

  if (typeof contentType !== 'string') {
    return { ok: false, status: 400, message: 'A file type is required.' }
  }
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
    return { ok: false, status: 400, message: 'A valid file size is required.' }
  }

  // Exact match only: no parameters ("; charset=..."), no lists, no case games.
  const extension = Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_TYPES, contentType)
    ? ALLOWED_IMAGE_TYPES[contentType]
    : undefined
  if (!extension) {
    return { ok: false, status: 415, message: TYPE_ERROR_MESSAGE }
  }
  if (size > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, message: SIZE_ERROR_MESSAGE }
  }
  return { ok: true, contentType, size, extension }
}

/**
 * The storage key is built only from the authenticated user's id and a random
 * id. The user's own filename is never used, so it can't smuggle in path
 * segments or odd characters.
 */
export function buildAvatarKey(userId: string, extension: string, id: string): string {
  return `avatars/${userId}/${id}.${extension}`
}
