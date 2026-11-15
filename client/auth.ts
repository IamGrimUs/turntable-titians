import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { db } from '@/lib/db'
import { refreshTokenFromProfile } from '@/lib/session-refresh'
import { refreshRoleIntoToken } from '@/lib/session-role'
import type { Role } from '@/lib/admin-access'
import { sendVerificationEmail } from '@/lib/send-verification-email'
import { decideSignIn } from '@/lib/signin-decision'
import { signSuspensionNotice } from '@/lib/suspension'

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Google,
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: 'Battle Skratch <noreply@battleskratch.com>',
      sendVerificationRequest: (params) => sendVerificationEmail(params),
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify-request',
  },
  session: { strategy: 'jwt' },
  events: {
    // Runs after a sign-in succeeded (suspended and blocked users are refused earlier, in
    // callbacks.signIn). Best effort: a failed write must never block the sign-in.
    async signIn({ user }) {
      if (!user.id) return
      try {
        await db.user.update({ where: { id: user.id }, data: { lastSignInAt: new Date() } })
      } catch (err) {
        console.error('[auth] could not record last sign-in', err instanceof Error ? err.name : err)
      }
    },
  },
  callbacks: {
    // Runs for Google sign-in AND when a magic link is requested, before the email is
    // sent (Auth.js calls it ahead of sendVerificationRequest). Returning a path redirects
    // there instead of signing in or sending anything. It fails closed: if the lookup
    // fails, nobody is let through and no email is sent.
    async signIn({ user }) {
      const email = user.email?.trim().toLowerCase()
      if (!email) return false
      try {
        const [row, banned] = await Promise.all([
          db.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true, suspendedAt: true, suspendedUntil: true },
          }),
          db.bannedEmail.findUnique({ where: { email } }),
        ])
        const decision = decideSignIn({ user: row, emailBlocked: banned !== null })
        if (decision.allow) return true
        if (decision.reason === 'BLOCKED') return '/auth/signin?error=EmailBlocked'
        // Only a signed notice goes in the URL, never the suspension reason.
        const notice = await signSuspensionNotice(decision.userId, process.env.AUTH_SECRET!)
        return `/auth/suspended?notice=${notice}`
      } catch (err) {
        console.error('[auth] sign-in check failed; refusing the sign-in', err instanceof Error ? err.name : err)
        return false
      }
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.username = (user as { username?: string | null }).username ?? null
        // Force a fresh role read at sign-in.
        delete token.roleCheckedAt
      }
      if (trigger === 'update') {
        // After a profile save the browser calls update(); re-read the username and avatar
        // from the database (never from what the browser sent) so the navigation stays current.
        await refreshTokenFromProfile(token, (id) =>
          db.user.findUnique({ where: { id }, select: { username: true, image: true } })
        )
      }
      // The role is only a UI/routing hint, refreshed at most every 5 minutes (the same lookup
      // ends the session of a suspended or deleted user); the server re-reads role and
      // suspension from the database on every API request.
      // Middleware runs in the Edge runtime, where Prisma cannot run: there the token's
      // existing role is kept as is (it was set at sign-in and refreshes wherever Node runs).
      if (process.env.NEXT_RUNTIME !== 'edge') {
        // Returns null for a suspended or deleted user: Auth.js then clears the session.
        return refreshRoleIntoToken(token, (id) =>
          db.user.findUnique({
            where: { id },
            select: { role: true, suspendedAt: true, suspendedUntil: true },
          })
        )
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.username = (token.username as string | null) ?? null
      session.user.role = token.role as Role | undefined
      session.user.image = (token.picture as string | null) ?? null
      return session
    },
  },
})
