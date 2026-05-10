import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { SignJWT } from 'jose'

const secret = new TextEncoder().encode(process.env.INTERNAL_API_SECRET)

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ token: null })

  const apiToken = await new SignJWT({ userId: session.user.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret)

  return NextResponse.json({ token: apiToken })
}
