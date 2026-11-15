import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { db } from '@/lib/db'
import { refreshTokenFromProfile } from '@/lib/session-refresh'
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
      }
      if (trigger === 'update') {
        // After a profile save the browser calls update(); re-read the username and avatar
        // from the database (never from what the browser sent) so the navigation stays current.
        await refreshTokenFromProfile(token, (id) =>
          db.user.findUnique({ where: { id }, select: { username: true, image: true } })
        )
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.username = (token.username as string | null) ?? null
      session.user.image = (token.picture as string | null) ?? null
      return session
    },
  },
})
