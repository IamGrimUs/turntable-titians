import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { activeSessionUserId } from '@/lib/active-session-user'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { buildAvatarKey, validateUploadRequest } from '@/lib/upload-rules'
import { getBucket, getR2Client, missingR2Env } from '@/lib/r2'

export async function POST(req: NextRequest) {
  const userId = await activeSessionUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 })
  }

  const check = validateUploadRequest(body)
  if (!check.ok) {
    return NextResponse.json({ error: check.message }, { status: check.status })
  }

  // Name the missing settings in the server log (never their values) so a
  // misconfigured deploy is obvious, and keep the response generic.
  const missing = missingR2Env()
  if (missing.length > 0) {
    console.error(`[upload] not configured, missing environment variables: ${missing.join(', ')}`)
    return NextResponse.json({ error: 'Image uploads are not configured.' }, { status: 500 })
  }

  const r2 = getR2Client()

  // The key never contains the user's filename: only their id and a random id.
  const key = buildAvatarKey(userId, check.extension, randomUUID())

  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: check.contentType,
    ContentLength: check.size,
  })

  // Sign the content type and exact length into the URL so storage itself
  // rejects any upload that differs from what we validated above.
  const url = await getSignedUrl(r2, command, {
    expiresIn: 300,
    signableHeaders: new Set(['content-type', 'content-length']),
  })
  const publicUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL!.trim()}/${key}`

  return NextResponse.json({ url, publicUrl })
}
