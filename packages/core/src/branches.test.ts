import { describe, expect, test } from 'bun:test'
import { alsoAtChips, branchesLine } from './branches'

describe('branchesLine', () => {
  test('one of the live branches, from two up', () => {
    expect(branchesLine({ name: 'Shine Auto Spa', liveCount: 3 })).toBe('1 of 3 Shine Auto Spa branches')
    expect(branchesLine({ name: 'Shine Auto Spa', liveCount: 1 })).toBeNull()
    expect(branchesLine(null)).toBeNull()
    expect(branchesLine(undefined)).toBeNull()
  })
})

describe('alsoAtChips', () => {
  const branches = [
    { id: 'vel', name: 'Velachery', lat: 12.9815, lng: 80.218 },
    { id: 'omr', name: 'OMR', lat: null, lng: null },
  ]

  test('each branch with how far it is, when the place and its pin are known', () => {
    const chips = alsoAtChips(branches, { lat: 13.085, lng: 80.21 })
    expect(chips[0]).toEqual({
      id: 'vel',
      label: 'Velachery · 11.5 km',
      accessibleName: 'Velachery, 11.5 km away. Open this branch',
    })
    expect(chips[1]).toEqual({ id: 'omr', label: 'OMR', accessibleName: 'OMR. Open this branch' })
  })

  test('an area’s centre reads "~"; no place, no distance', () => {
    expect(alsoAtChips(branches, { lat: 13.085, lng: 80.21 }, true)[0]!.label).toBe('Velachery · ~11.5 km')
    expect(alsoAtChips(branches, null).map((chip) => chip.label)).toEqual(['Velachery', 'OMR'])
    expect(alsoAtChips(undefined, null)).toEqual([])
  })
})
