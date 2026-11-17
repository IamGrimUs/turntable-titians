import { describe, expect, it } from 'vitest'
import { boardListState } from './board-list-state'

const base = { hasError: false, hasData: false, hasPrevious: false, loading: false, rowCount: 0 }

describe('boardListState', () => {
  it('is loading before any result', () => {
    expect(boardListState({ ...base, loading: true })).toBe('loading')
  })

  it('shows rows or the empty state when there is data', () => {
    expect(boardListState({ ...base, hasData: true, rowCount: 3 })).toBe('rows')
    expect(boardListState({ ...base, hasData: true, rowCount: 0 })).toBe('empty')
  })

  it('keeps the previous result on screen while a new one loads', () => {
    expect(boardListState({ ...base, loading: true, hasPrevious: true, rowCount: 2 })).toBe('rows')
    expect(boardListState({ ...base, loading: true, hasPrevious: true, rowCount: 0 })).toBe('empty')
  })

  it('shows the error when a refetch fails, even though a previous result exists', () => {
    expect(boardListState({ ...base, hasError: true, hasPrevious: true, rowCount: 5 })).toBe('error')
  })

  it('shows the error when the first load fails', () => {
    expect(boardListState({ ...base, hasError: true })).toBe('error')
  })

  it('prefers fresh data over a stale error flag', () => {
    expect(boardListState({ ...base, hasError: true, hasData: true, rowCount: 1 })).toBe('rows')
  })
})
