import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { SignJWT } from 'jose'

const secret = new TextEncoder().encode(process.env.INTERNAL_API_SECRET)

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET })
  if (!token?.id) return NextResponse.json({ token: null })

  const apiToken = await new SignJWT({ userId: token.id as string })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret)

  return NextResponse.json({ token: apiToken })
}
