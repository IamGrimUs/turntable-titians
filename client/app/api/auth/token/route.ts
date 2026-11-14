import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { SignJWT } from 'jose'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ token: null })

  // Fail closed: never sign tokens with an empty key if the secret is missing.
  const rawSecret = process.env.INTERNAL_API_SECRET?.trim()
  if (!rawSecret) {
    console.error('INTERNAL_API_SECRET is not set; refusing to issue an API token')
    return NextResponse.json({ token: null }, { status: 500 })
  }

  const apiToken = await new SignJWT({ userId: session.user.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(rawSecret))

  return NextResponse.json({ token: apiToken })
}
