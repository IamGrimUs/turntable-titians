import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { db } from '@/lib/db'

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Google,
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: 'Battle Skratch <noreply@battleskratch.com>',
      sendVerificationRequest: async ({ identifier, url, provider }) => {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject: 'Sign in to Turntable Titans',
            html: `<p>Click <a href="${url}">here</a> to sign in.</p>`,
          }),
        })
        const data = await res.json()
        console.log('[Resend response]', res.status, JSON.stringify(data))
        if (!res.ok) {
          throw new Error(`Resend error ${res.status}: ${JSON.stringify(data)}`)
        }
      },
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
      if (trigger === 'update' && token.id) {
        const dbUser = await db.user.findUnique({
          where: { id: token.id as string },
          select: { username: true },
        })
        token.username = dbUser?.username ?? null
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.username = (token.username as string | null) ?? null
      return session
    },
  },
})
