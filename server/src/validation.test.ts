import { describe, it, expect } from 'vitest'
import { GraphQLError } from 'graphql'
import {
  LIMITS,
  cleanSingleLine,
  cleanMultiLine,
  cleanHttpsUrl,
  cleanUsername,
  cleanCrews,
  parseBattleDates,
  getAllowedImageHosts,
} from './validation'

function thrown(fn: () => unknown): GraphQLError {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(GraphQLError)
    return e as GraphQLError
  }
  throw new Error('expected function to throw')
}

describe('cleanSingleLine', () => {
  it('trims and returns the value', () => {
    expect(cleanSingleLine('  Summer Showdown  ', 'Title', { max: 100, required: true })).toBe('Summer Showdown')
  })

  it('rejects a missing or blank required value, naming the field', () => {
    for (const v of [undefined, null, '', '   ']) {
      const e = thrown(() => cleanSingleLine(v as never, 'Title', { max: 100, required: true }))
      expect(e.message).toMatch(/Title/)
      expect(e.extensions.code).toBe('BAD_USER_INPUT')
    }
  })

  it('returns undefined for a blank optional value', () => {
    expect(cleanSingleLine('   ', 'Title', { max: 100 })).toBeUndefined()
    expect(cleanSingleLine(undefined, 'Title', { max: 100 })).toBeUndefined()
    expect(cleanSingleLine(null, 'Title', { max: 100 })).toBeUndefined()
  })

  it('accepts exactly the maximum length and rejects one more, saying the limit', () => {
    expect(cleanSingleLine('a'.repeat(100), 'Title', { max: 100 })).toHaveLength(100)
    expect(thrown(() => cleanSingleLine('a'.repeat(101), 'Title', { max: 100 })).message).toMatch(/100/)
  })

  it('rejects control characters, including NUL (which would crash Postgres) and newlines', () => {
    for (const v of ['a\u0000b', 'a\u0007b', 'line1\nline2', 'a\tb', 'a\u007Fb']) {
      expect(thrown(() => cleanSingleLine(v, 'Title', { max: 100 })).message).toMatch(/Title/)
    }
  })

  it('rejects non-string values', () => {
    expect(thrown(() => cleanSingleLine(42 as never, 'Title', { max: 100 })).extensions.code).toBe('BAD_USER_INPUT')
  })

  it('keeps ordinary unicode such as accents and emoji', () => {
    expect(cleanSingleLine('DJ Ñandú 🔥', 'Title', { max: 100 })).toBe('DJ Ñandú 🔥')
  })
})

describe('cleanMultiLine', () => {
  it('allows newlines and normalises Windows line endings', () => {
    expect(cleanMultiLine('one\r\ntwo\nthree', 'Description', { max: 1000 })).toBe('one\ntwo\nthree')
  })

  it('still rejects NUL and other control characters', () => {
    expect(() => cleanMultiLine('a\u0000b', 'Description', { max: 1000 })).toThrow(/Description/)
    expect(() => cleanMultiLine('a\u0007b', 'Description', { max: 1000 })).toThrow(/Description/)
  })

  it('enforces the length limit and returns undefined when blank', () => {
    expect(() => cleanMultiLine('x'.repeat(1001), 'Description', { max: 1000 })).toThrow(/1000/)
    expect(cleanMultiLine('  \n ', 'Description', { max: 1000 })).toBeUndefined()
  })
})

describe('cleanHttpsUrl', () => {
  it('accepts an https URL and returns it trimmed', () => {
    expect(cleanHttpsUrl('  https://youtube.com/watch?v=abc  ', 'Video link', { max: 500 })).toBe(
      'https://youtube.com/watch?v=abc'
    )
  })

  it('rejects dangerous or unsupported schemes', () => {
    for (const v of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>1</script>',
      'file:///etc/passwd',
      'ftp://example.com/x',
      'vbscript:x',
      'http://example.com/x',
    ]) {
      expect(thrown(() => cleanHttpsUrl(v, 'Video link', { max: 500 })).message).toMatch(/https/)
    }
  })

  it('rejects things that are not URLs and URLs with embedded credentials', () => {
    expect(() => cleanHttpsUrl('not a url', 'Video link', { max: 500 })).toThrow(/Video link/)
    expect(() => cleanHttpsUrl('https://user:pass@example.com/x', 'Video link', { max: 500 })).toThrow(/Video link/)
    expect(() => cleanHttpsUrl('https:///nohost', 'Video link', { max: 500 })).toThrow(/Video link/)
  })

  it('enforces the length limit', () => {
    expect(() => cleanHttpsUrl('https://example.com/' + 'a'.repeat(500), 'Video link', { max: 500 })).toThrow(/500/)
  })

  it('enforces a host allowlist when one is given (exact hosts and *.suffix wildcards)', () => {
    const allowedHosts = ['cdn.example.com', '*.googleusercontent.com']
    const opts = { max: 500, allowedHosts }
    expect(cleanHttpsUrl('https://cdn.example.com/a.png', 'Image', opts)).toBeTruthy()
    expect(cleanHttpsUrl('https://lh3.googleusercontent.com/a/x', 'Image', opts)).toBeTruthy()
    expect(() => cleanHttpsUrl('https://evil.com/a.png', 'Image', opts)).toThrow(/Image/)
    expect(() => cleanHttpsUrl('https://cdn.example.com.evil.com/a.png', 'Image', opts)).toThrow(/Image/)
    expect(() => cleanHttpsUrl('https://googleusercontent.com.evil.com/a.png', 'Image', opts)).toThrow(/Image/)
    expect(() => cleanHttpsUrl('https://notgoogleusercontent.com/a.png', 'Image', opts)).toThrow(/Image/)
  })

  it('accepts any https host when no allowlist is given', () => {
    expect(cleanHttpsUrl('https://anywhere.example/x', 'Video link', { max: 500 })).toBeTruthy()
  })
})

describe('getAllowedImageHosts', () => {
  it('is undefined (no restriction) when the setting is missing or blank', () => {
    expect(getAllowedImageHosts({})).toBeUndefined()
    expect(getAllowedImageHosts({ ALLOWED_IMAGE_HOSTS: '  ' })).toBeUndefined()
  })

  it('parses a comma-separated list, trimming and lower-casing', () => {
    expect(getAllowedImageHosts({ ALLOWED_IMAGE_HOSTS: ' CDN.example.com , *.googleusercontent.com ,' })).toEqual([
      'cdn.example.com',
      '*.googleusercontent.com',
    ])
  })
})

describe('cleanUsername', () => {
  it('accepts normal handles', () => {
    for (const u of ['dj_scratch', 'DJ.Cool-99', 'abc', 'a'.repeat(30)]) {
      expect(cleanUsername(u)).toBe(u)
    }
  })

  it('trims surrounding whitespace', () => {
    expect(cleanUsername('  dj_scratch ')).toBe('dj_scratch')
  })

  it('rejects too short, too long, spaces and symbols with a helpful message', () => {
    for (const u of ['ab', 'a'.repeat(31), 'dj scratch', 'dj$cratch', 'dj@home', '<script>', 'dj/../x', 'émile']) {
      const e = thrown(() => cleanUsername(u))
      expect(e.message).toMatch(/3.?30/)
      expect(e.extensions.code).toBe('BAD_USER_INPUT')
    }
  })

  it('rejects reserved names in any casing', () => {
    for (const u of ['admin', 'Admin', 'SUPPORT', 'moderator', 'BattleSkratch', 'turntabletitans']) {
      expect(thrown(() => cleanUsername(u)).message).toMatch(/not available|reserved/i)
    }
  })
})

describe('cleanCrews', () => {
  it('trims, drops blanks and removes case-insensitive duplicates', () => {
    expect(cleanCrews(['  Rock Steady Crew ', '', 'rock steady crew', 'Invisibl Skratch Piklz'])).toEqual([
      'Rock Steady Crew',
      'Invisibl Skratch Piklz',
    ])
  })

  it('rejects too many crews', () => {
    const many = Array.from({ length: LIMITS.maxCrews + 1 }, (_, i) => `Crew ${i}`)
    expect(thrown(() => cleanCrews(many)).message).toMatch(new RegExp(String(LIMITS.maxCrews)))
  })

  it('rejects an over-long crew name and control characters', () => {
    expect(() => cleanCrews(['x'.repeat(LIMITS.crewName + 1)])).toThrow(/Crew/)
    expect(() => cleanCrews(['bad\u0000name'])).toThrow(/Crew/)
  })

  it('rejects a non-array', () => {
    expect(() => cleanCrews('Crew' as never)).toThrow()
  })
})

describe('parseBattleDates', () => {
  it('parses ISO dates', () => {
    const { start, end } = parseBattleDates('2026-11-14T00:00:00.000Z', '2026-11-24T00:00:00.000Z')
    expect(start.toISOString()).toBe('2026-11-14T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-11-24T00:00:00.000Z')
  })

  it('accepts a one-day battle (end equals start)', () => {
    expect(() => parseBattleDates('2026-11-14T00:00:00.000Z', '2026-11-14T00:00:00.000Z')).not.toThrow()
  })

  it('rejects unparseable dates (which would otherwise crash the database call)', () => {
    expect(thrown(() => parseBattleDates('banana', '2026-11-24T00:00:00.000Z')).message).toMatch(/date/i)
    expect(thrown(() => parseBattleDates('2026-11-14T00:00:00.000Z', '')).message).toMatch(/date/i)
  })

  it('rejects an end date before the start date', () => {
    expect(thrown(() => parseBattleDates('2026-11-24T00:00:00.000Z', '2026-11-14T00:00:00.000Z')).message).toMatch(/after|before/i)
  })

  it('rejects absurdly long battles', () => {
    expect(() => parseBattleDates('2026-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z')).toThrow(/366|long/i)
  })
})
