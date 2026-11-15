/**
 * Security headers for every page. Kept in plain CommonJS so next.config.js can load it.
 *
 * The Content-Security-Policy is sent as REPORT-ONLY by default: the browser logs what
 * it WOULD block (DevTools console) without blocking anything. Once a browse through
 * the site shows no violations, set CSP_ENFORCE=true on Vercel and redeploy to enforce it.
 */

function originOf(url) {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

function buildCsp({ isDev, graphqlUrl }) {
  const api = originOf(graphqlUrl || '')
  const directives = [
    "default-src 'self'",
    // Next.js injects small inline scripts to start up the page, so 'unsafe-inline' is needed
    // until a per-request nonce is set up. Everything else below still applies.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // Avatars may live on any https host (Google, R2, or a user-supplied one).
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // The browser calls our API and uploads avatars straight to R2 with presigned URLs.
    ['connect-src', "'self'", api, 'https://*.r2.cloudflarestorage.com', isDev ? 'ws:' : null]
      .filter(Boolean)
      .join(' '),
    // Battle entries are embedded YouTube videos.
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
  ]
  if (!isDev) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

function buildHeaders({ isDev, enforce, graphqlUrl }) {
  const headers = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    // YouTube embeds need a referrer, so not "no-referrer".
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
    {
      key: enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
      value: buildCsp({ isDev, graphqlUrl }),
    },
  ]
  if (!isDev) {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000' })
  }
  return headers
}

module.exports = { buildCsp, buildHeaders }
