import { describe, it, expect } from 'vitest'
import { GraphQLError } from 'graphql'
import { BOARD_LIMITS, containsLink, cleanIdeaInput, cleanCommentBody, excerpt, dayAgo } from './boardRules'

function thrown(fn: () => unknown): GraphQLError {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(GraphQLError)
    return e as GraphQLError
  }
  throw new Error('expected function to throw')
}

function expectBadInput(fn: () => unknown) {
  expect(thrown(fn).extensions.code).toBe('BAD_USER_INPUT')
}

const valid = { title: 'Add dark mode', body: 'It would be easier on the eyes.', category: 'SUGGESTION' }

describe('BOARD_LIMITS', () => {
  it('holds the agreed limits', () => {
    expect(BOARD_LIMITS).toEqual({ ideaTitle: 100, ideaBody: 1000, commentBody: 500, ideasPerDay: 5, commentsPerDay: 50 })
  })
})

describe('containsLink', () => {
  it('detects http, https and www links in any case', () => {
    expect(containsLink('http://a.b')).toBe(true)
    expect(containsLink('HTTPS://A.B')).toBe(true)
    expect(containsLink('see WWW.x.com')).toBe(true)
  })

  it('leaves ordinary text alone', () => {
    expect(containsLink('a twwwist')).toBe(false)
    expect(containsLink('no links here')).toBe(false)
  })
})

describe('cleanIdeaInput', () => {
  it('trims and returns the cleaned idea, with a null topic when absent', () => {
    expect(cleanIdeaInput({ ...valid, title: '  Add dark mode  ', body: '  Body text  ' })).toEqual({
      title: 'Add dark mode',
      body: 'Body text',
      category: 'SUGGESTION',
      topic: null,
    })
  })

  it('accepts a valid topic and treats undefined or null as no topic', () => {
    expect(cleanIdeaInput({ ...valid, topic: 'BATTLES' }).topic).toBe('BATTLES')
    expect(cleanIdeaInput({ ...valid, topic: undefined }).topic).toBeNull()
    expect(cleanIdeaInput({ ...valid, topic: null }).topic).toBeNull()
  })

  it('accepts every category and topic', () => {
    for (const category of ['BUG', 'SUGGESTION', 'OTHER']) {
      expect(cleanIdeaInput({ ...valid, category }).category).toBe(category)
    }
    for (const topic of ['BATTLES', 'VOTING', 'PROFILES', 'LOGIN_ACCOUNT', 'SITE_WIDE']) {
      expect(cleanIdeaInput({ ...valid, topic }).topic).toBe(topic)
    }
  })

  it('requires a title and a body', () => {
    expectBadInput(() => cleanIdeaInput({ ...valid, title: '  ' }))
    expectBadInput(() => cleanIdeaInput({ ...valid, title: undefined }))
    expectBadInput(() => cleanIdeaInput({ ...valid, body: undefined }))
    expectBadInput(() => cleanIdeaInput({ ...valid, body: '   ' }))
    expect(thrown(() => cleanIdeaInput({ ...valid, body: '' })).message).toMatch(/Description/)
  })

  it('enforces the length limits', () => {
    expect(cleanIdeaInput({ ...valid, title: 'a'.repeat(100) }).title).toHaveLength(100)
    expect(cleanIdeaInput({ ...valid, body: 'a'.repeat(1000) }).body).toHaveLength(1000)
    expectBadInput(() => cleanIdeaInput({ ...valid, title: 'a'.repeat(101) }))
    expectBadInput(() => cleanIdeaInput({ ...valid, body: 'a'.repeat(1001) }))
  })

  it('rejects control characters', () => {
    expectBadInput(() => cleanIdeaInput({ ...valid, title: 'bad\u0000title' }))
    expectBadInput(() => cleanIdeaInput({ ...valid, body: 'bad\u0007body' }))
  })

  it('rejects links in the title or body', () => {
    expectBadInput(() => cleanIdeaInput({ ...valid, title: 'see https://a.b' }))
    expectBadInput(() => cleanIdeaInput({ ...valid, body: 'go to www.example.com now' }))
  })

  it('rejects unknown categories and topics', () => {
    expectBadInput(() => cleanIdeaInput({ ...valid, category: 'DESIGN' }))
    expectBadInput(() => cleanIdeaInput({ ...valid, category: undefined }))
    expectBadInput(() => cleanIdeaInput({ ...valid, topic: 'DESIGN' }))
    expectBadInput(() => cleanIdeaInput({ ...valid, topic: 5 }))
  })
})

describe('cleanCommentBody', () => {
  it('returns the trimmed text and normalises line endings', () => {
    expect(cleanCommentBody('  hello\r\nthere  ')).toBe('hello\nthere')
  })

  it('rejects empty or missing text', () => {
    expectBadInput(() => cleanCommentBody(''))
    expectBadInput(() => cleanCommentBody('   '))
    expectBadInput(() => cleanCommentBody(undefined))
  })

  it('enforces the length limit', () => {
    expect(cleanCommentBody('a'.repeat(500))).toHaveLength(500)
    expectBadInput(() => cleanCommentBody('a'.repeat(501)))
  })

  it('rejects links and control characters', () => {
    expectBadInput(() => cleanCommentBody('check http://a.b'))
    expectBadInput(() => cleanCommentBody('bad\u0000text'))
  })
})

describe('excerpt', () => {
  it('collapses whitespace', () => {
    expect(excerpt('a  b\nc', 80)).toBe('a b c')
  })

  it('cuts long text to the limit and ends with an ellipsis', () => {
    const out = excerpt('a'.repeat(100), 80)
    expect(out).toHaveLength(80)
    expect(out.endsWith('…')).toBe(true)
  })

  it('leaves text at the limit uncut and defaults to 80', () => {
    expect(excerpt('a'.repeat(80))).toBe('a'.repeat(80))
    expect(excerpt('a'.repeat(81))).toHaveLength(80)
  })
})

describe('dayAgo', () => {
  it('is exactly 24 hours before now', () => {
    expect(dayAgo(new Date('2026-11-16T12:00:00Z')).toISOString()).toBe('2026-11-15T12:00:00.000Z')
  })

  it('defaults to the current time', () => {
    const diff = Date.now() - dayAgo().getTime()
    expect(diff).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000)
    expect(diff).toBeLessThan(24 * 60 * 60 * 1000 + 5000)
  })
})
