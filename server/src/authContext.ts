import type { Request } from 'express'
import { jwtVerify } from 'jose'
import type { Context } from './context'
import { loadViewer } from './viewer'

interface AuthContextOptions {
  secret: Uint8Array
  getClientIp: (req: Request) => string | null
}

/** Builds the per-request GraphQL context from the Bearer token (see index.ts). */
export function createAuthContext({ secret, getClientIp }: AuthContextOptions) {
  return async function getAuthContext(req: Request): Promise<Context> {
    const ip = getClientIp(req)
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      let userId: string | null = null
      try {
        const { payload } = await jwtVerify(token, secret)
        if (typeof payload.userId === 'string') userId = payload.userId
      } catch {
        // The token is expired or invalid: treat the caller as anonymous.
      }
      if (userId) {
        try {
          const viewer = await loadViewer(userId)
          // A valid token for a user who has since been deleted counts as anonymous.
          if (viewer) return { ...viewer, userId, ip }
        } catch (err) {
          // Fail closed (anonymous) rather than throw, which would surface a raw database
          // error as an HTTP 500. Logged so an outage is visible.
          console.error('[context] could not load the viewer; treating the request as anonymous', err)
        }
      }
    }
    return { userId: null, ip }
  }
}
