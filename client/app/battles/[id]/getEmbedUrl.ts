// Only these exact hosts are treated as YouTube. Checking with `includes('youtube.com')`
// would also accept look-alikes such as youtube.com.evil.net.
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])
const SHORT_HOST = 'youtu.be'

// A YouTube video id is exactly 11 characters from this set. Requiring that means
// nothing else (path pieces, query strings, "..") can be injected into the embed URL.
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

function toEmbed(id: string | null | undefined): string | null {
  return id && VIDEO_ID.test(id) ? `https://www.youtube.com/embed/${id}` : null
}

export function getEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

    // youtu.be/VIDEO_ID
    if (parsed.hostname === SHORT_HOST) {
      return toEmbed(parsed.pathname.slice(1))
    }

    if (!YOUTUBE_HOSTS.has(parsed.hostname)) return null

    // youtube.com/watch?v=VIDEO_ID
    if (parsed.pathname === '/watch') {
      return toEmbed(parsed.searchParams.get('v'))
    }

    // youtube.com/shorts/VIDEO_ID and youtube.com/embed/VIDEO_ID
    const match = parsed.pathname.match(/^\/(?:shorts|embed)\/([^/]+)$/)
    return match ? toEmbed(match[1]) : null
  } catch {
    return null
  }
}
