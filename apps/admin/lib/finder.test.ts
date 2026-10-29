import { describe, expect, test } from 'bun:test'
import type { FoundPlace } from '@repo/core/api/admin-coverage'
import {
  addLine,
  canTick,
  finderSummary,
  knownDetail,
  knownLabel,
  sortPlaces,
} from './finder'

const place = (
  key: string,
  rating: number | null,
  reviewCount: number | null,
  distanceKm: number,
  known: FoundPlace['known'] = null
): FoundPlace => ({
  key,
  name: key,
  address: null,
  lat: 13,
  lng: 80,
  phone: null,
  rating,
  reviewCount,
  kinds: [],
  google: null,
  ola: null,
  distanceKm,
  known,
})

const PLACES = [
  place('a', 4.7, 318, 0.6),
  place('b', 4.4, 205, 0.9),
  place('c', null, null, 1.4),
  place('d', 4.9, 37, 1.1),
  place('e', 4.9, 88, 0.2),
]

describe('sortPlaces', () => {
  test('Most reviews, then rating; none last', () => {
    expect(sortPlaces(PLACES, 'reviews').map((p) => p.key)).toEqual([
      'a',
      'b',
      'e',
      'd',
      'c',
    ])
  })
  test('Rating, then reviews; none last', () => {
    expect(sortPlaces(PLACES, 'rating').map((p) => p.key)).toEqual([
      'e',
      'd',
      'a',
      'b',
      'c',
    ])
  })
  test('Nearest', () => {
    expect(sortPlaces(PLACES, 'nearest').map((p) => p.key)).toEqual([
      'e',
      'a',
      'b',
      'd',
      'c',
    ])
  })
  test('does not change the list it was given', () => {
    sortPlaces(PLACES, 'nearest')
    expect(PLACES.map((p) => p.key)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

test('only new places can be ticked', () => {
  expect(canTick(place('x', null, null, 0))).toBe(true)
  expect(
    canTick(
      place('x', null, null, 0, {
        kind: 'lead',
        id: 'l',
        name: 'L',
        status: 'to_target',
        assignedName: null,
        notInterestedReason: null,
        reason: 'phone',
      })
    )
  ).toBe(false)
})

test('the summary and the add line', () => {
  expect(
    finderSummary({
      found: 31,
      google: 24,
      ola: 12,
      both: 5,
      known: 9,
      new: 22,
    })
  ).toBe('31 found (Google 24 · Ola 12 · 5 in both) · 22 new · 9 known')
  expect(addLine(3, 'Anna Nagar')).toBe(
    '3 ticked · become leads in Anna Nagar, status To target'
  )
})

test('what a known place says', () => {
  const base = {
    id: 'x',
    name: 'SJA Car Care',
    assignedName: null,
    notInterestedReason: null,
    reason: 'phone' as const,
  }
  expect(knownLabel({ ...base, kind: 'garage', status: 'live' })).toBe(
    'Onboarded'
  )
  expect(knownLabel({ ...base, kind: 'garage', status: 'not_live' })).toBe(
    'Garage, not live yet'
  )
  expect(knownLabel({ ...base, kind: 'lead', status: 'to_target' })).toBe(
    'Lead'
  )
  expect(knownLabel({ ...base, kind: 'lead', status: 'not_interested' })).toBe(
    'Not interested'
  )
  expect(knownDetail({ ...base, kind: 'garage', status: 'live' })).toBe(
    'Matches your garage SJA Car Care'
  )
  expect(
    knownDetail({
      ...base,
      kind: 'lead',
      status: 'to_target',
      assignedName: 'Priya',
    })
  ).toBe('Already a lead · Priya')
  expect(
    knownDetail({
      ...base,
      kind: 'lead',
      status: 'not_interested',
      notInterestedReason: 'Has their own app',
    })
  ).toBe('“Has their own app”')
})
