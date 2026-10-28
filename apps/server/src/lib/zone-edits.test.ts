import { describe, expect, test } from 'bun:test'
import {
  cleanZoneName,
  leadZoneId,
  leadZoneMoves,
  newZoneSlug,
  zoneEditProblem,
} from './zone-edits.js'

const ZONES = [
  {
    id: 'anna',
    slug: 'anna-nagar',
    name: 'Anna Nagar',
    lat: 13.085,
    lng: 80.2101,
  },
  { id: 'kilpauk', slug: 'kilpauk', name: 'Kilpauk', lat: 13.085, lng: 80.242 },
]

describe('zoneEditProblem', () => {
  const zone = {
    id: 'anna',
    name: 'Anna Nagar',
    target: 6,
    lat: 13.085,
    lng: 80.2101,
  }

  test('a fine edit, its own name kept', () => {
    expect(zoneEditProblem(zone, ZONES)).toBeNull()
    expect(
      zoneEditProblem({ ...zone, name: '  anna   NAGAR ' }, ZONES)
    ).toBeNull()
  })

  test('names: length, letters, taken by another zone in any case', () => {
    expect(zoneEditProblem({ ...zone, name: 'A' }, ZONES)).toBe('name_length')
    expect(zoneEditProblem({ ...zone, name: 'x'.repeat(61) }, ZONES)).toBe(
      'name_length'
    )
    expect(zoneEditProblem({ ...zone, name: '!!' }, ZONES)).toBe('name_letters')
    expect(zoneEditProblem({ ...zone, name: 'KILPAUK' }, ZONES)).toBe(
      'name_taken'
    )
    expect(
      zoneEditProblem({ ...zone, id: null, name: 'Anna Nagar' }, ZONES)
    ).toBe('name_taken')
  })

  test('the target is a whole number from 1 to 1000', () => {
    expect(zoneEditProblem({ ...zone, target: 0 }, ZONES)).toBe('target')
    expect(zoneEditProblem({ ...zone, target: 2.5 }, ZONES)).toBe('target')
    expect(zoneEditProblem({ ...zone, target: 1001 }, ZONES)).toBe('target')
    expect(zoneEditProblem({ ...zone, target: 1000 }, ZONES)).toBeNull()
  })

  test('the centre stays within 50 km of Chennai', () => {
    expect(
      zoneEditProblem({ ...zone, lat: 12.8, lng: 80.02 }, ZONES)
    ).toBeNull()
    expect(zoneEditProblem({ ...zone, lat: 12.97, lng: 77.59 }, ZONES)).toBe(
      'outside_city'
    ) // Bengaluru
  })
})

test('cleanZoneName folds spaces', () => {
  expect(cleanZoneName('  T   Nagar ')).toBe('T Nagar')
})

test("newZoneSlug: from the name, with a number when it's taken", () => {
  expect(newZoneSlug('Besant Nagar', new Set(['anna-nagar']))).toBe(
    'besant-nagar'
  )
  expect(newZoneSlug('Anna Nagar', new Set(['anna-nagar']))).toBe(
    'anna-nagar-2'
  )
  expect(
    newZoneSlug('Anna Nagar', new Set(['anna-nagar', 'anna-nagar-2']))
  ).toBe('anna-nagar-3')
  expect(newZoneSlug('T. Nagar (West)', new Set())).toBe('t-nagar-west')
})

describe("leads' zones", () => {
  test('a pin decides; no pin keeps the zone it was added in, if that zone exists', () => {
    expect(leadZoneId({ lat: 13.086, lng: 80.211 }, 'kilpauk', ZONES)).toBe(
      'anna'
    )
    expect(leadZoneId({ lat: 12.0, lng: 79.0 }, 'kilpauk', ZONES)).toBeNull()
    expect(leadZoneId({ lat: null, lng: null }, 'kilpauk', ZONES)).toBe(
      'kilpauk'
    )
    expect(leadZoneId({ lat: null, lng: null }, 'gone', ZONES)).toBeNull()
    expect(leadZoneId({ lat: null, lng: null }, null, ZONES)).toBeNull()
  })

  test('after a centre moves, only pinned leads whose zone changed move', () => {
    const leads = [
      { id: 'pinned-near-anna', lat: 13.086, lng: 80.211, zoneId: 'anna' },
      { id: 'pinned-between', lat: 13.085, lng: 80.228, zoneId: 'anna' },
      { id: 'unpinned', lat: null, lng: null, zoneId: 'anna' },
    ]
    expect(leadZoneMoves(leads, ZONES)).toEqual([
      { id: 'pinned-between', zoneId: 'kilpauk' },
    ])
    // Anna Nagar's centre moves west: the in-between lead now belongs to Kilpauk, the near one stays.
    const moved = [{ ...ZONES[0], lng: 80.2 }, ZONES[1]]
    expect(leadZoneMoves(leads, moved)).toEqual([
      { id: 'pinned-between', zoneId: 'kilpauk' },
    ])
    // Anna Nagar removed: its pinned leads go to the nearest zone within 6 km.
    expect(leadZoneMoves(leads, [ZONES[1]])).toEqual([
      { id: 'pinned-near-anna', zoneId: 'kilpauk' },
      { id: 'pinned-between', zoneId: 'kilpauk' },
    ])
  })
})
