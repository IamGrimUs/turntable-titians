import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { db } from '@/lib/db'
import { refreshTokenFromProfile } from '@/lib/session-refresh'
import { refreshRoleIntoToken } from '@/lib/session-role'
import type { Role } from '@/lib/admin-access'
import { sendVerificationEmail } from '@/lib/send-verification-email'

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
  callbacks: {
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
      // The role is only a UI/routing hint, refreshed at most every 5 minutes; the server
      // re-reads role and suspension from the database on every API request.
      // Middleware runs in the Edge runtime, where Prisma cannot run: there the token's
      // existing role is kept as is (it was set at sign-in and refreshes wherever Node runs).
      if (process.env.NEXT_RUNTIME !== 'edge') {
        await refreshRoleIntoToken(token, (id) =>
          db.user.findUnique({ where: { id }, select: { role: true } })
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
