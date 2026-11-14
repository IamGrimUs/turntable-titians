import { NextResponse } from 'next/server'
import { DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getBucket, getR2Client, missingR2Env } from '@/lib/r2'
import { avatarPrefix, keyFromImageUrl, selectStaleAvatarKeys, type StoredObject } from '@/lib/avatar-cleanup'

const MAX_LIST_PAGES = 5

/**
 * Deletes the signed-in user's old avatars from storage, keeping the one their
 * profile currently uses. Takes no input from the request: which user, and which
 * file is current, both come from the session and the database, so a caller can
 * only ever affect their own `avatars/<their id>/` folder.
 */
export async function POST() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const missing = missingR2Env()
  if (missing.length > 0) {
    console.error(`[avatar cleanup] not configured, missing environment variables: ${missing.join(', ')}`)
    return NextResponse.json({ error: 'Image storage is not configured.' }, { status: 500 })
  }

  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { image: true } })
    const currentKey = keyFromImageUrl(user?.image, userId)
    const prefix = avatarPrefix(userId)

    const r2 = getR2Client()
    const bucket = getBucket()

    const objects: StoredObject[] = []
    let token: string | undefined
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const listed = await r2.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
      )
      for (const item of listed.Contents ?? []) {
        if (item.Key) objects.push({ key: item.Key, lastModified: item.LastModified })
      }
      if (!listed.IsTruncated || !listed.NextContinuationToken) break
      token = listed.NextContinuationToken
    }

    const stale = selectStaleAvatarKeys({ objects, prefix, currentKey, now: new Date() })

    const results = await Promise.allSettled(
      stale.map((key) => r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })))
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed > 0) {
      console.error(`[avatar cleanup] ${failed} of ${stale.length} deletions failed for user ${userId}`)
    }

    return NextResponse.json({ deleted: stale.length - failed })
  } catch (err) {
    console.error('[avatar cleanup] failed', err)
    return NextResponse.json({ error: 'Cleanup failed.' }, { status: 500 })
  }
}
