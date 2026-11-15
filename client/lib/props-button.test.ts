import { describe, it, expect } from 'vitest'
import { propsButtonLabel, PROPS_LABELS } from './props-button'

describe('propsButtonLabel', () => {
  it('invites people to give props when they have not yet', () => {
    expect(propsButtonLabel({ loading: false, isVotedHere: false })).toBe(PROPS_LABELS.give)
  })

  it('confirms once they have', () => {
    expect(propsButtonLabel({ loading: false, isVotedHere: true })).toBe(PROPS_LABELS.given)
  })

  it('shows a busy marker while saving, whichever state it is in', () => {
    expect(propsButtonLabel({ loading: true, isVotedHere: false })).toBe(PROPS_LABELS.busy)
    expect(propsButtonLabel({ loading: true, isVotedHere: true })).toBe(PROPS_LABELS.busy)
  })

  it('no longer says "Vote"', () => {
    for (const label of Object.values(PROPS_LABELS)) expect(label).not.toMatch(/vote/i)
  })
})
