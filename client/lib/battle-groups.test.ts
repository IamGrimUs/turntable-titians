import { describe, it, expect } from 'vitest'
import { groupBattlesByType, NO_TYPE_LABEL } from './battle-groups'

const b = (id: string, type: string | null | undefined, status = 'ACTIVE') => ({ id, type, status })

describe('groupBattlesByType', () => {
  it('returns nothing for no battles', () => {
    expect(groupBattlesByType([])).toEqual([])
  })

  it('groups battles under their type and leaves out empty types', () => {
    const groups = groupBattlesByType([b('1', 'Mix Battle'), b('2', 'Skratch Battle'), b('3', 'Mix Battle')])
    expect(groups.map((g) => [g.type, g.battles.map((x) => x.id)])).toEqual([
      ['Skratch Battle', ['2']],
      ['Mix Battle', ['1', '3']],
    ])
  })

  it('lists the types in the order the app lists them, not the order they arrive', () => {
    const groups = groupBattlesByType([
      b('1', 'Open Format'),
      b('2', 'Beat Battle'),
      b('3', 'Match a Skratch Battle'),
      b('4', 'Skratch Battle'),
    ])
    expect(groups.map((g) => g.type)).toEqual(['Skratch Battle', 'Beat Battle', 'Match a Skratch Battle', 'Open Format'])
  })

  it('puts Active before Upcoming before Completed inside a type', () => {
    const [group] = groupBattlesByType([
      b('1', 'Mix Battle', 'COMPLETED'),
      b('2', 'Mix Battle', 'UPCOMING'),
      b('3', 'Mix Battle', 'ACTIVE'),
    ])
    expect(group.battles.map((x) => x.id)).toEqual(['3', '2', '1'])
  })

  it('keeps the given order for battles with the same status', () => {
    const [group] = groupBattlesByType([b('new', 'Mix Battle'), b('mid', 'Mix Battle'), b('old', 'Mix Battle')])
    expect(group.battles.map((x) => x.id)).toEqual(['new', 'mid', 'old'])
  })

  it('gives an unknown type its own group after the known ones, in the order first seen', () => {
    const groups = groupBattlesByType([b('1', 'Scratch Duel'), b('2', 'Mix Battle'), b('3', 'Turntable Relay')])
    expect(groups.map((g) => g.type)).toEqual(['Mix Battle', 'Scratch Duel', 'Turntable Relay'])
  })

  it('puts a battle with no type under "Other", last', () => {
    const groups = groupBattlesByType([b('1', null), b('2', undefined), b('3', '  '), b('4', 'Scratch Duel'), b('5', 'Mix Battle')])
    expect(groups.map((g) => g.type)).toEqual(['Mix Battle', 'Scratch Duel', NO_TYPE_LABEL])
    expect(groups[2].battles.map((x) => x.id)).toEqual(['1', '2', '3'])
  })

  it('sorts an unrecognised status after the known ones', () => {
    const [group] = groupBattlesByType([b('1', 'Mix Battle', 'WEIRD'), b('2', 'Mix Battle', 'COMPLETED')])
    expect(group.battles.map((x) => x.id)).toEqual(['2', '1'])
  })

  it('does not modify its input', () => {
    const input = [b('1', 'Mix Battle', 'COMPLETED'), b('2', 'Mix Battle', 'ACTIVE')]
    const copy = JSON.parse(JSON.stringify(input))
    groupBattlesByType(input)
    expect(input).toEqual(copy)
  })
})
