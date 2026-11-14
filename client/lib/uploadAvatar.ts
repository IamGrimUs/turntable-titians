import { validateUploadRequest } from './upload-rules'

/** An error whose message is safe and helpful to show directly to the user. */
export class UploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadError'
  }
}

const LOG = '[avatar upload]'

async function readErrorMessage(res: Response): Promise<string | null> {
  try {
    const body = await res.json()
    return typeof body?.error === 'string' ? body.error : null
  } catch {
    return null
  }
}

/**
 * Uploads an avatar straight to storage and returns its public URL.
 *
 * Throws UploadError with a user-friendly message for every failure, and logs
 * the technical detail (which step failed, the status, storage's own reason)
 * to the console. The signed URL is never logged, since it contains a signature.
 */
export async function uploadAvatar(file: File, fetchImpl: typeof fetch = fetch): Promise<string> {
  // 1. Check early so people get instant feedback without a round trip.
  const check = validateUploadRequest({ contentType: file.type, size: file.size })
  if (!check.ok) throw new UploadError(check.message)

  // 2. Ask our server for a short-lived, signed upload URL.
  let init: Response
  try {
    init = await fetchImpl('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: check.contentType, size: check.size }),
    })
  } catch (err) {
    console.error(`${LOG} could not reach /api/upload`, err)
    throw new UploadError("Couldn't reach the server. Check your connection and try again.")
  }

  if (!init.ok) {
    const serverMessage = await readErrorMessage(init)
    console.error(`${LOG} /api/upload failed with status ${init.status}`, serverMessage ?? '')
    if (init.status === 401) throw new UploadError('Please sign in again to upload a photo.')
    if (init.status >= 500) {
      throw new UploadError('Image uploads are temporarily unavailable. Please try again later.')
    }
    throw new UploadError(serverMessage ?? 'That image could not be uploaded.')
  }

  const { url, publicUrl } = (await init.json()) as { url: string; publicUrl: string }

  // 3. Send the file directly to storage.
  let put: Response
  try {
    put = await fetchImpl(url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': check.contentType },
    })
  } catch (err) {
    // A browser reports a blocked cross-origin request (CORS) as a plain network error.
    console.error(
      `${LOG} could not reach storage (network error, or the request was blocked by the bucket's CORS policy)`,
      err
    )
    throw new UploadError("Couldn't reach image storage. Please try again in a moment.")
  }

  if (!put.ok) {
    const detail = await put.text().catch(() => '')
    console.error(`${LOG} storage rejected the upload with status ${put.status}`, detail)
    throw new UploadError('Image storage rejected the upload. Please try again. If it keeps happening, let us know.')
  }

  return publicUrl
}

/**
 * Asks the server to delete this user's old avatars from storage (it keeps the
 * one their profile now uses). Call it after the profile has been saved.
 * Best effort: it never throws, because tidying up must never block a save.
 */
export async function cleanupOldAvatars(fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    const res = await fetchImpl('/api/avatar/cleanup', { method: 'POST' })
    if (!res.ok) console.warn(`${LOG} cleanup of old avatars failed with status ${res.status}`)
  } catch (err) {
    console.warn(`${LOG} cleanup of old avatars failed`, err)
  }
}
