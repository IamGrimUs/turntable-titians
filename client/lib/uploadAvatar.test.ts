import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { uploadAvatar, UploadError, cleanupOldAvatars } from './uploadAvatar'
import { MAX_UPLOAD_BYTES } from './upload-rules'

const SIGNED_URL = 'https://bucket.example.r2.cloudflarestorage.com/avatars/u/x.png?X-Amz-Signature=SECRETSIG'
const PUBLIC_URL = 'https://cdn.example.com/avatars/u/x.png'

function png(size = 1000) {
  return new File([new Uint8Array(size)], 'me.png', { type: 'image/png' })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorSpy.mockRestore())

async function messageOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (e) {
    expect(e).toBeInstanceOf(UploadError)
    return (e as Error).message
  }
  throw new Error('expected uploadAvatar to throw')
}

describe('uploadAvatar', () => {
  it('returns the public URL after a successful upload', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ url: SIGNED_URL, publicUrl: PUBLIC_URL }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    await expect(uploadAvatar(png(), fetchImpl)).resolves.toBe(PUBLIC_URL)

    // init request sends the type and size, never the filename
    const [initUrl, initOpts] = fetchImpl.mock.calls[0]
    expect(initUrl).toBe('/api/upload')
    expect(JSON.parse(initOpts.body)).toEqual({ contentType: 'image/png', size: 1000 })
    // PUT goes to the signed URL with the exact content type
    const [putUrl, putOpts] = fetchImpl.mock.calls[1]
    expect(putUrl).toBe(SIGNED_URL)
    expect(putOpts.method).toBe('PUT')
    expect(putOpts.headers['Content-Type']).toBe('image/png')
  })

  it('rejects the wrong file type before any network call', async () => {
    const fetchImpl = vi.fn()
    const file = new File(['<html>'], 'x.html', { type: 'text/html' })
    expect(await messageOf(uploadAvatar(file, fetchImpl))).toMatch(/PNG, JPEG, or WebP/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects an oversized file before any network call', async () => {
    const fetchImpl = vi.fn()
    expect(await messageOf(uploadAvatar(png(MAX_UPLOAD_BYTES + 1), fetchImpl))).toMatch(/too large/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('tells the user to sign in again on a 401 from the init step', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ error: 'Unauthorized' }, 401))
    expect(await messageOf(uploadAvatar(png(), fetchImpl))).toMatch(/sign in/i)
  })

  it('shows the server\'s validation message on a 4xx from the init step', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ error: 'Image is too large. The maximum size is 5 MB.' }, 413))
    expect(await messageOf(uploadAvatar(png(), fetchImpl))).toMatch(/too large/i)
  })

  it('says uploads are unavailable on a 5xx from the init step, and logs the status', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ error: 'Image uploads are not configured.' }, 500))
    expect(await messageOf(uploadAvatar(png(), fetchImpl))).toMatch(/unavailable/i)
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(/500/)
  })

  it('reports a network failure reaching our own server', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await messageOf(uploadAvatar(png(), fetchImpl))).toMatch(/connection/i)
  })

  it('reports when storage rejects the upload, and logs R2\'s reason without the signed URL', async () => {
    const r2Error = '<Error><Code>InvalidArgument</Code><Message>Credential access key has length 31, should be 32</Message></Error>'
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ url: SIGNED_URL, publicUrl: PUBLIC_URL }))
      .mockResolvedValueOnce(new Response(r2Error, { status: 400 }))
    expect(await messageOf(uploadAvatar(png(), fetchImpl))).toMatch(/storage rejected/i)

    const logged = errorSpy.mock.calls.flat().join(' ')
    expect(logged).toMatch(/400/)
    expect(logged).toMatch(/InvalidArgument/)
    expect(logged).not.toContain('SECRETSIG')
    expect(logged).not.toContain('X-Amz-Signature')
  })

  it('reports when storage cannot be reached at all (network error or CORS block)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ url: SIGNED_URL, publicUrl: PUBLIC_URL }))
      .mockRejectedValueOnce(new TypeError('NetworkError when attempting to fetch resource.'))
    expect(await messageOf(uploadAvatar(png(), fetchImpl))).toMatch(/reach image storage/i)
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(/CORS/i)
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('SECRETSIG')
  })
})

describe('cleanupOldAvatars', () => {
  it('POSTs to the cleanup endpoint with no body (the server decides what is stale)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ deleted: 2 }))
    await cleanupOldAvatars(fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/avatar/cleanup')
    expect(opts.method).toBe('POST')
    expect(opts.body).toBeUndefined()
  })

  it('never throws, so a cleanup problem cannot block saving a profile', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(cleanupOldAvatars(vi.fn().mockRejectedValue(new TypeError('offline')))).resolves.toBeUndefined()
    await expect(cleanupOldAvatars(vi.fn().mockResolvedValue(json({ error: 'x' }, 500)))).resolves.toBeUndefined()
    warn.mockRestore()
  })
})
