import { describe, expect, it } from 'vitest'
import { canSubmitComment, isCommentListTruncated } from './comment-form'

describe('canSubmitComment', () => {
  it('accepts text', () => {
    expect(canSubmitComment('Nice idea')).toBe(true)
  })

  it('rejects empty and whitespace-only text', () => {
    expect(canSubmitComment('')).toBe(false)
    expect(canSubmitComment('  \n\t ')).toBe(false)
  })
})

describe('isCommentListTruncated', () => {
  it('is false when every comment is shown', () => {
    expect(isCommentListTruncated(0, 0)).toBe(false)
    expect(isCommentListTruncated(12, 12)).toBe(false)
  })

  it('is true when the server capped the list', () => {
    expect(isCommentListTruncated(250, 200)).toBe(true)
  })
})
