import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { SignJWT } from 'jose'
import { db } from '@/lib/db'
import { isSuspendedNow } from '@/lib/suspension'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ token: null })

  // Fail closed: never sign tokens with an empty key if the secret is missing.
  const rawSecret = process.env.INTERNAL_API_SECRET?.trim()
  if (!rawSecret) {
    console.error('INTERNAL_API_SECRET is not set; refusing to issue an API token')
    return NextResponse.json({ token: null }, { status: 500 })
  }

  // A suspended user gets no API token (the server refuses them too; this stops the browser
  // from even trying). Checked after the secret so a misconfiguration still reports as before.
  const row = await db.user.findUnique({
    where: { id: session.user.id },
    select: { suspendedAt: true, suspendedUntil: true },
  })
  if (row && isSuspendedNow(row)) return NextResponse.json({ token: null })

  const apiToken = await new SignJWT({ userId: session.user.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(rawSecret))

  return NextResponse.json({ token: apiToken })
}
