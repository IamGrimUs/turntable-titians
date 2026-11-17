import { describe, expect, it } from 'vitest'
import {
  BOARD_LIMITS,
  CATEGORY_TABS,
  IDEA_CATEGORIES,
  IDEA_STATUSES,
  IDEA_TOPICS,
  boardAccess,
  categoryLabel,
  statusLabel,
  statusTone,
  topicLabel,
} from './board-view'

describe('labels', () => {
  it('labels topics', () => {
    expect(topicLabel('LOGIN_ACCOUNT')).toBe('Login & account')
    expect(topicLabel('SITE_WIDE')).toBe('Site-wide')
  })

  it('labels statuses', () => {
    expect(statusLabel('IN_PROGRESS')).toBe('In progress')
    expect(statusLabel('OPEN')).toBe('Open')
  })

  it('labels categories', () => {
    expect(categoryLabel('BUG')).toBe('Bug')
    expect(categoryLabel('SUGGESTION')).toBe('Suggestion')
    expect(categoryLabel('OTHER')).toBe('Other')
  })

  it('returns unknown values as sent', () => {
    expect(categoryLabel('X')).toBe('X')
    expect(topicLabel('X')).toBe('X')
    expect(statusLabel('X')).toBe('X')
  })

  it('never leaks a raw enum value for a known one', () => {
    for (const t of IDEA_TOPICS) expect(topicLabel(t)).not.toContain('_')
    for (const s of IDEA_STATUSES) expect(statusLabel(s)).not.toContain('_')
    for (const c of IDEA_CATEGORIES) expect(categoryLabel(c)).not.toBe(c)
  })
})

describe('enum lists', () => {
  it('match the server values exactly', () => {
    expect([...IDEA_CATEGORIES]).toEqual(['BUG', 'SUGGESTION', 'OTHER'])
    expect([...IDEA_TOPICS]).toEqual(['BATTLES', 'VOTING', 'PROFILES', 'LOGIN_ACCOUNT', 'SITE_WIDE'])
    expect([...IDEA_STATUSES]).toEqual(['OPEN', 'PLANNED', 'IN_PROGRESS', 'DONE', 'DECLINED'])
    expect((IDEA_TOPICS as readonly string[]).includes('DESIGN')).toBe(false)
  })
})

describe('statusTone', () => {
  it('maps each status', () => {
    expect(statusTone('DONE')).toBe('good')
    expect(statusTone('PLANNED')).toBe('warn')
    expect(statusTone('IN_PROGRESS')).toBe('warn')
    expect(statusTone('DECLINED')).toBe('danger')
    expect(statusTone('OPEN')).toBe('neutral')
  })
})

describe('CATEGORY_TABS', () => {
  it('starts with All (null) and covers every category once', () => {
    expect(CATEGORY_TABS[0]).toEqual({ value: null, label: 'All' })
    const rest = CATEGORY_TABS.slice(1).map((t) => t.value)
    expect([...rest].sort()).toEqual([...IDEA_CATEGORIES].sort())
    expect(CATEGORY_TABS.map((t) => t.label)).toEqual(['All', 'Suggestions', 'Bugs', 'Other'])
  })
})

describe('boardAccess', () => {
  it('is ANONYMOUS without a user', () => {
    expect(boardAccess(null)).toBe('ANONYMOUS')
    expect(boardAccess(undefined)).toBe('ANONYMOUS')
    expect(boardAccess({})).toBe('ANONYMOUS')
  })

  it('needs a username after sign-in', () => {
    expect(boardAccess({ id: 'u' })).toBe('NEEDS_USERNAME')
    expect(boardAccess({ id: 'u', username: null })).toBe('NEEDS_USERNAME')
    expect(boardAccess({ id: 'u', username: '' })).toBe('NEEDS_USERNAME')
  })

  it('is READY with id and username', () => {
    expect(boardAccess({ id: 'u', username: 'dj' })).toBe('READY')
  })
})

describe('BOARD_LIMITS', () => {
  it('mirrors the server values', () => {
    expect(BOARD_LIMITS).toEqual({ ideaTitle: 100, ideaBody: 1000, commentBody: 500 })
  })
})
