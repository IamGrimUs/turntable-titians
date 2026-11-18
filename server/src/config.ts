// This exact string used to be the fallback secret and is public in the git
// history, so it must never be accepted as a real secret.
const FORMER_DEFAULT_SECRET = 'dev-secret-change-me'

export interface EmailConfig {
  apiKey: string
  from: string
  siteUrl: string
}

/**
 * The settings for the emails the server sends itself (challenge updates, through Resend).
 * Returns null unless RESEND_API_KEY, EMAIL_FROM and SITE_URL are all set and non-blank and SITE_URL is an https URL, which
 * means "do not send": an unconfigured server simply skips emails. The key is never logged.
 */
export function getEmailConfig(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim()
  const from = env.EMAIL_FROM?.trim()
  const siteUrl = env.SITE_URL?.trim()
  if (!apiKey || !from || !siteUrl) return null
  // Links in emails are built from this, so it must be a real https URL (never log the value).
  try {
    if (new URL(siteUrl).protocol !== 'https:') return null
  } catch {
    return null
  }
  return { apiKey, from, siteUrl }
}

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
