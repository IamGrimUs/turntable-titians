import { NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { activeSessionUserId } from '@/lib/active-session-user'

export async function GET() {
  // No token when signed out, suspended, or deleted (the server refuses them too; this stops
  // the browser from even trying).
  const userId = await activeSessionUserId()
  if (!userId) return NextResponse.json({ token: null })

  // Fail closed: never sign tokens with an empty key if the secret is missing.
  const rawSecret = process.env.INTERNAL_API_SECRET?.trim()
  if (!rawSecret) {
    console.error('INTERNAL_API_SECRET is not set; refusing to issue an API token')
    return NextResponse.json({ token: null }, { status: 500 })
  }

  const apiToken = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(rawSecret))

  return NextResponse.json({ token: apiToken })
}
