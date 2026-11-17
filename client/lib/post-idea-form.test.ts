import { describe, expect, it } from 'vitest'
import { canSubmitIdea, remainingChars } from './post-idea-form'

describe('remainingChars', () => {
  it('counts down from the limit', () => {
    expect(remainingChars('', 100)).toBe(100)
    expect(remainingChars('abc', 100)).toBe(97)
    expect(remainingChars('a'.repeat(100), 100)).toBe(0)
  })

  it('never goes below zero', () => {
    expect(remainingChars('a'.repeat(120), 100)).toBe(0)
  })
})

describe('canSubmitIdea', () => {
  const ok = { title: 'Dark mode', body: 'Please add it', category: 'SUGGESTION' }

  it('accepts a complete draft', () => {
    expect(canSubmitIdea(ok)).toBe(true)
  })

  it('needs a title, a body and a category', () => {
    expect(canSubmitIdea({ ...ok, title: '' })).toBe(false)
    expect(canSubmitIdea({ ...ok, body: '' })).toBe(false)
    expect(canSubmitIdea({ ...ok, category: null })).toBe(false)
  })

  it('treats whitespace-only text as empty', () => {
    expect(canSubmitIdea({ ...ok, title: '   ' })).toBe(false)
    expect(canSubmitIdea({ ...ok, body: '\n \t' })).toBe(false)
  })
})
