import { describe, it, expect } from 'vitest'
import { avatarPrefix, keyFromImageUrl, selectStaleAvatarKeys, MIN_AGE_MS } from './avatar-cleanup'

const USER = 'user-abc'
const NOW = new Date('2026-11-14T12:00:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

describe('avatarPrefix', () => {
  it('is the user\'s own folder with a trailing slash', () => {
    expect(avatarPrefix(USER)).toBe('avatars/user-abc/')
  })
})

describe('keyFromImageUrl', () => {
  it('extracts the key from a storage URL for this user', () => {
    expect(keyFromImageUrl('https://cdn.example.com/avatars/user-abc/1.png', USER)).toBe('avatars/user-abc/1.png')
  })

  it('does not depend on the host, so a bucket/domain change cannot make the live avatar look stale', () => {
    expect(keyFromImageUrl('https://pub-xyz.r2.dev/avatars/user-abc/1.png', USER)).toBe('avatars/user-abc/1.png')
    expect(keyFromImageUrl('https://images.battleskratch.com/avatars/user-abc/1.png', USER)).toBe('avatars/user-abc/1.png')
  })

  it('ignores query strings and fragments', () => {
    expect(keyFromImageUrl('https://cdn.example.com/avatars/user-abc/1.png?v=2#x', USER)).toBe('avatars/user-abc/1.png')
  })

  it('returns null for external images such as a Google profile photo', () => {
    expect(keyFromImageUrl('https://lh3.googleusercontent.com/a/abc123=s96-c', USER)).toBeNull()
  })

  it('returns null for another user\'s avatar, a lookalike folder, or junk', () => {
    expect(keyFromImageUrl('https://cdn.example.com/avatars/other-user/1.png', USER)).toBeNull()
    expect(keyFromImageUrl('https://cdn.example.com/avatars/user-abcd/1.png', USER)).toBeNull()
    expect(keyFromImageUrl('https://cdn.example.com/xavatars/user-abc/1.png', USER)).toBeNull()
    expect(keyFromImageUrl('not a url', USER)).toBeNull()
    expect(keyFromImageUrl('', USER)).toBeNull()
    expect(keyFromImageUrl(null, USER)).toBeNull()
    expect(keyFromImageUrl(undefined, USER)).toBeNull()
  })
})

describe('selectStaleAvatarKeys', () => {
  const base = { prefix: avatarPrefix(USER), now: NOW }

  it('selects old avatars but keeps the current one', () => {
    const objects = [
      { key: 'avatars/user-abc/old1.png', lastModified: minutesAgo(600) },
      { key: 'avatars/user-abc/current.png', lastModified: minutesAgo(30) },
      { key: 'avatars/user-abc/old2.jpg', lastModified: minutesAgo(60) },
    ]
    expect(selectStaleAvatarKeys({ ...base, objects, currentKey: 'avatars/user-abc/current.png' })).toEqual([
      'avatars/user-abc/old1.png',
      'avatars/user-abc/old2.jpg',
    ])
  })

  it('keeps recent uploads, which may be a pending change in another tab', () => {
    const objects = [
      { key: 'avatars/user-abc/just-uploaded.png', lastModified: minutesAgo(2) },
      { key: 'avatars/user-abc/old.png', lastModified: minutesAgo(MIN_AGE_MS / 60_000 + 1) },
    ]
    expect(selectStaleAvatarKeys({ ...base, objects, currentKey: null })).toEqual(['avatars/user-abc/old.png'])
  })

  it('selects everything old when the user has no storage-hosted avatar', () => {
    const objects = [{ key: 'avatars/user-abc/a.png', lastModified: minutesAgo(999) }]
    expect(selectStaleAvatarKeys({ ...base, objects, currentKey: null })).toEqual(['avatars/user-abc/a.png'])
  })

  it('NEVER selects keys outside the user\'s own folder, even if listed', () => {
    const objects = [
      { key: 'avatars/someone-else/x.png', lastModified: minutesAgo(999) },
      { key: 'avatars/user-abcd/x.png', lastModified: minutesAgo(999) },
      { key: 'other/user-abc/x.png', lastModified: minutesAgo(999) },
      { key: 'avatars/user-abc/ok.png', lastModified: minutesAgo(999) },
    ]
    expect(selectStaleAvatarKeys({ ...base, objects, currentKey: null })).toEqual(['avatars/user-abc/ok.png'])
  })

  it('skips objects with an unknown age rather than risk deleting a fresh upload', () => {
    const objects = [{ key: 'avatars/user-abc/mystery.png', lastModified: undefined }]
    expect(selectStaleAvatarKeys({ ...base, objects, currentKey: null })).toEqual([])
  })

  it('caps how many are removed in one call', () => {
    const objects = Array.from({ length: 80 }, (_, i) => ({
      key: `avatars/user-abc/${i}.png`,
      lastModified: minutesAgo(999),
    }))
    expect(selectStaleAvatarKeys({ ...base, objects, currentKey: null, maxDeletes: 25 })).toHaveLength(25)
    expect(selectStaleAvatarKeys({ ...base, objects, currentKey: null })).toHaveLength(50)
  })
})
