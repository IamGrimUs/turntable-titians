// This exact string used to be the fallback secret and is public in the git
// history, so it must never be accepted as a real secret.
const FORMER_DEFAULT_SECRET = 'dev-secret-change-me'

/**
 * Returns the key used to verify the client's API tokens.
 *
 * Throws if INTERNAL_API_SECRET is missing, blank, or the old public default,
 * so the server refuses to start instead of silently accepting tokens that
 * anyone could forge. The error never includes the secret's value.
 */
export function getInternalApiSecret(
  env: Record<string, string | undefined> = process.env
): Uint8Array {
  const value = env.INTERNAL_API_SECRET?.trim()
  if (!value || value === FORMER_DEFAULT_SECRET) {
    throw new Error(
      'INTERNAL_API_SECRET is missing or insecure. Set it to a long random value ' +
        '(e.g. `openssl rand -base64 33`) and use the SAME value on the client and the server.'
    )
  }
  return new TextEncoder().encode(value)
}
