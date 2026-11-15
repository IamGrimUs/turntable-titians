import { describe, it, expect } from 'vitest'
import { getEmbedUrl } from './getEmbedUrl'

const ID = 'dQw4w9WgXcQ'
const EMBED = `https://www.youtube.com/embed/${ID}`

describe('getEmbedUrl', () => {
  it('handles the common YouTube link shapes', () => {
    expect(getEmbedUrl(`https://www.youtube.com/watch?v=${ID}`)).toBe(EMBED)
    expect(getEmbedUrl(`https://youtube.com/watch?v=${ID}`)).toBe(EMBED)
    expect(getEmbedUrl(`https://m.youtube.com/watch?v=${ID}`)).toBe(EMBED)
    expect(getEmbedUrl(`https://youtu.be/${ID}`)).toBe(EMBED)
    expect(getEmbedUrl(`https://www.youtube.com/shorts/${ID}`)).toBe(EMBED)
    expect(getEmbedUrl(`https://www.youtube.com/embed/${ID}`)).toBe(EMBED)
  })

  it('ignores extra parameters such as timestamps and playlists', () => {
    expect(getEmbedUrl(`https://www.youtube.com/watch?v=${ID}&t=42s&list=PL123`)).toBe(EMBED)
    expect(getEmbedUrl(`https://youtu.be/${ID}?t=30`)).toBe(EMBED)
  })

  it('does NOT trust look-alike hosts that merely contain "youtube.com"', () => {
    for (const url of [
      `https://youtube.com.evil.net/watch?v=${ID}`,
      `https://evil-youtube.com/watch?v=${ID}`,
      `https://notyoutube.com/watch?v=${ID}`,
      `https://youtube.com@evil.net/watch?v=${ID}`,
      `https://evil.net/youtube.com/watch?v=${ID}`,
      `https://youtu.be.evil.net/${ID}`,
    ]) {
      expect(getEmbedUrl(url)).toBeNull()
    }
  })

  it('rejects ids that are not exactly a YouTube video id, so nothing can be injected into the embed path', () => {
    for (const bad of ['../../something', 'abc', `${ID}?autoplay=1`, `${ID}/extra`, 'a b c d e f g h', '%2e%2e%2f']) {
      expect(getEmbedUrl(`https://www.youtube.com/watch?v=${encodeURIComponent(bad)}`)).toBeNull()
    }
    expect(getEmbedUrl('https://youtu.be/../../x')).toBeNull()
  })

  it('returns null for non-YouTube links, junk, and non-web schemes', () => {
    for (const url of ['https://vimeo.com/12345', 'not a url', '', 'javascript:alert(1)', `data:text/html,${ID}`]) {
      expect(getEmbedUrl(url)).toBeNull()
    }
  })

  it('always returns an https youtube.com embed URL', () => {
    const out = getEmbedUrl(`http://youtu.be/${ID}`)
    expect(out).toBe(EMBED)
  })
})
