import { describe, it, expect } from 'vitest'
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, buildAvatarKey, validateUploadRequest } from './upload-rules'

describe('validateUploadRequest', () => {
  it('accepts png, jpeg and webp up to the size limit', () => {
    for (const [type, ext] of [
      ['image/png', 'png'],
      ['image/jpeg', 'jpg'],
      ['image/webp', 'webp'],
    ]) {
      const result = validateUploadRequest({ contentType: type, size: 1234 })
      expect(result).toEqual({ ok: true, contentType: type, size: 1234, extension: ext })
    }
  })

  it('accepts a file of exactly the maximum size', () => {
    expect(validateUploadRequest({ contentType: 'image/png', size: MAX_UPLOAD_BYTES }).ok).toBe(true)
  })

  it('rejects files over the maximum size with 413', () => {
    const result = validateUploadRequest({ contentType: 'image/png', size: MAX_UPLOAD_BYTES + 1 })
    expect(result).toMatchObject({ ok: false, status: 413 })
  })

  it('rejects types that could carry active content (html, svg, js, gif is not allowed either)', () => {
    for (const type of ['text/html', 'image/svg+xml', 'application/javascript', 'application/octet-stream', 'image/gif']) {
      expect(validateUploadRequest({ contentType: type, size: 100 })).toMatchObject({ ok: false, status: 415 })
    }
  })

  it('does not accept content types with extra parameters or different casing tricks', () => {
    expect(validateUploadRequest({ contentType: 'image/png; charset=utf-8', size: 100 }).ok).toBe(false)
    expect(validateUploadRequest({ contentType: 'image/png, text/html', size: 100 }).ok).toBe(false)
  })

  it('rejects missing, non-numeric, fractional, zero and negative sizes with 400', () => {
    for (const size of [undefined, null, '100', 12.5, 0, -1, NaN, Infinity]) {
      expect(validateUploadRequest({ contentType: 'image/png', size })).toMatchObject({ ok: false, status: 400 })
    }
  })

  it('rejects bodies that are not objects, or have a non-string content type', () => {
    for (const body of [null, undefined, 'x', 42, [], { size: 100 }, { contentType: 5, size: 100 }]) {
      expect(validateUploadRequest(body)).toMatchObject({ ok: false })
    }
  })

  it('gives plain-language messages', () => {
    const type = validateUploadRequest({ contentType: 'text/html', size: 1 })
    const big = validateUploadRequest({ contentType: 'image/png', size: MAX_UPLOAD_BYTES + 1 })
    expect(type.ok === false && type.message).toMatch(/PNG, JPEG, or WebP/)
    expect(big.ok === false && big.message).toMatch(/too large/i)
  })

  it('only allows the three agreed image types', () => {
    expect(Object.keys(ALLOWED_IMAGE_TYPES).sort()).toEqual(['image/jpeg', 'image/png', 'image/webp'])
  })
})

describe('buildAvatarKey', () => {
  it('builds avatars/<userId>/<id>.<ext> and ignores any user-supplied filename', () => {
    expect(buildAvatarKey('user123', 'png', 'abc-def')).toBe('avatars/user123/abc-def.png')
  })

  it('only ever produces keys inside the caller\'s own avatars folder', () => {
    const key = buildAvatarKey('user123', 'jpg', 'some-uuid')
    expect(key.startsWith('avatars/user123/')).toBe(true)
    expect(key).not.toContain('..')
    expect(key.split('/')).toHaveLength(3)
  })
})
