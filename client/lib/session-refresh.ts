/**
 * Keeps the login token (JWT) in step with the user's profile.
 *
 * Auth.js copies the username and avatar into the token at sign-in, and the navigation
 * reads them from the session built from that token. After a profile save they would stay
 * stale, so on a session update we re-read them from the database. The values come from
 * the database and never from the browser, so a client can't choose what lands in its own
 * session.
 */

export interface ProfileRow {
  username: string | null
  image: string | null
}

type TokenLike = { id?: unknown; username?: unknown; picture?: unknown; [key: string]: unknown }

export async function refreshTokenFromProfile<T extends TokenLike>(
  token: T,
  load: (userId: string) => Promise<ProfileRow | null>
): Promise<T> {
  if (typeof token.id !== 'string') return token
  try {
    const row = await load(token.id)
    if (!row) return token
    token.username = row.username
    token.picture = row.image
  } catch (err) {
    console.error('[session] could not refresh the profile into the token', err)
  }
  return token
}
