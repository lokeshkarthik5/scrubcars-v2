import { describe, expect, test } from 'bun:test'
import type { ReadinessItem } from '@repo/core/api/admin'
import {
  binDeleteLine,
  bookingParts,
  bookingsLine,
  editHref,
  isInBin,
  isLive,
  listHref,
  matchesShow,
  parseShow,
  readinessGroups,
  readinessSummary,
  showCounts,
  showHints,
  stateWord,
  SHOW_FILTERS,
} from './vendor-list'
import { safeBackHref } from './garage-edit'

type Row = Parameters<typeof showCounts>[0][number]

const garage = (overrides: Partial<Row> = {}): Row => ({
  live: true,
  status: 'active',
  isVerified: true,
  bookingsPausedAt: null,
  ...overrides,
})

const item = (
  severity: ReadinessItem['severity'],
  short: string,
  key = short.replace(/\s+/g, '_')
): ReadinessItem => ({ key, severity, label: short, short, tab: 'details' })

describe('the chips', () => {
  test('?show= is an allow-list, and the list opens on Live', () => {
    expect(parseShow('pending')).toBe('pending')
    expect(parseShow('archived')).toBe('archived')
    expect(parseShow('bin')).toBe('bin')
    expect(parseShow(null)).toBe('live')
    expect(parseShow('trash')).toBe('live')
    expect(parseShow('ALL')).toBe('live')
  })

  test('the list address carries the chip, and Live is the bare list', () => {
    expect(listHref('live')).toBe('/vendors')
    expect(listHref('pending')).toBe('/vendors?show=pending')
    // The edit page's back arrow accepts every one of them.
    for (const show of SHOW_FILTERS) expect(safeBackHref(listHref(show))).toBe(listHref(show))
  })

  test('Live is the server’s flag; Active is the stage, paused or unverified included', () => {
    const pausedActive = garage({ live: false, bookingsPausedAt: '2026-10-10T04:30:00Z' })
    const unverified = garage({ live: false, isVerified: false })
    expect(matchesShow(pausedActive, 'live')).toBe(false)
    expect(matchesShow(pausedActive, 'active')).toBe(true)
    expect(matchesShow(unverified, 'active')).toBe(true)
    expect(matchesShow(garage(), 'live')).toBe(true)
    expect(matchesShow(garage({ live: false, status: 'pending', isVerified: false }), 'pending')).toBe(true)
  })

  test('the server’s flag wins; the stand-in is only for a server without it', () => {
    // A server that says not live is believed, whatever the columns look like.
    expect(isLive(garage({ live: false }))).toBe(false)
    expect(isLive(garage({ live: undefined }))).toBe(true)
    expect(isLive(garage({ live: undefined, isVerified: false }))).toBe(false)
    expect(isLive(garage({ live: undefined, bookingsPausedAt: '2026-10-10T04:30:00Z' }))).toBe(false)
  })

  test('counts: All is every garage, and the stages add up to it', () => {
    const list = [
      garage(),
      garage(),
      garage({ live: false, bookingsPausedAt: '2026-10-10T04:30:00Z' }),
      garage({ live: false, status: 'pending', isVerified: false }),
      garage({ live: false, status: 'archived' }),
    ]
    const counts = showCounts(list)
    expect(counts).toEqual({ all: 5, live: 2, active: 3, pending: 1, suspended: 0, archived: 1, bin: 0 })
    expect(counts.active + counts.pending + counts.suspended + counts.archived).toBe(counts.all)
  })

  test('a garage in the Bin is under Bin alone, whatever its stage, and in no other count', () => {
    const binned = garage({ live: false, deletedAt: '2026-10-14T12:42:00Z' })
    const binnedArchived = garage({ live: false, status: 'archived', deletedAt: '2026-10-14T12:42:00Z' })
    expect(isInBin(binned)).toBe(true)
    expect(SHOW_FILTERS.filter((show) => matchesShow(binned, show))).toEqual(['bin'])
    expect(SHOW_FILTERS.filter((show) => matchesShow(binnedArchived, show))).toEqual(['bin'])
    // An older server sends no `live`: the stand-in leaves the Bin out too.
    expect(isLive(garage({ live: undefined, deletedAt: '2026-10-14T12:42:00Z' }))).toBe(false)
    const counts = showCounts([garage(), binned, binnedArchived])
    expect(counts).toEqual({ all: 1, live: 1, active: 1, pending: 0, suspended: 0, archived: 0, bin: 2 })
  })

  test('the hint says what the chosen chip means, Live and Active apart', () => {
    expect(showHints('live')).toEqual([
      { term: 'Live', meaning: 'customers can find it' },
      { term: 'Active', meaning: 'approved by Detlio, even if paused' },
    ])
    expect(showHints('all')).toEqual(showHints('live'))
    expect(showHints('active')).toEqual(showHints('live'))
    expect(showHints('pending')).toEqual([
      { term: 'Pending', meaning: 'added, not shown to customers yet' },
    ])
    expect(showHints('bin')).toEqual([
      { term: 'Bin', meaning: 'off the app. Restore it, or delete it forever.' },
    ])
  })
})

describe('the card', () => {
  test('a garage customers can’t find says why; a live one says nothing here', () => {
    expect(stateWord(garage())).toBeNull()
    expect(stateWord(garage({ live: false, status: 'pending' }))).toBe('Pending')
    expect(stateWord(garage({ live: false, status: 'archived' }))).toBe('Archived')
    expect(stateWord(garage({ live: false, isVerified: false }))).toBe('Not verified')
    expect(stateWord(garage({ live: false, bookingsPausedAt: '2026-10-10T04:30:00Z' }))).toBe('Paused')
    expect(
      stateWord(garage({ live: false, isVerified: false, bookingsPausedAt: '2026-10-10T04:30:00Z' }))
    ).toBe('Paused · not verified')
  })

  test('a Bin card says how many bookings go with it, in amber', () => {
    expect(binDeleteLine(12)).toBe('12 bookings will be deleted with it')
    expect(binDeleteLine(1)).toBe('1 booking will be deleted with it')
    expect(binDeleteLine(0)).toBeNull()
  })

  test('bookings, quietly', () => {
    expect(bookingsLine(0)).toBe('No bookings yet')
    expect(bookingsLine(1)).toBe('Has 1 booking')
    expect(bookingsLine(4)).toBe('Has 4 bookings')
  })

  test('how it books, as in the mockup', () => {
    const modes = { dropinEnabled: true, doorstepEnabled: true, doorstepRadiusKm: 8, hasDoorstepArea: false }
    expect(bookingParts(modes)).toEqual([{ text: 'At the garage' }, { text: 'Doorstep 8 km' }])
    expect(bookingParts({ ...modes, doorstepRadiusKm: null })).toEqual([
      { text: 'At the garage' },
      { text: 'Doorstep', quiet: '10 km default' },
    ])
    expect(bookingParts({ ...modes, dropinEnabled: false, doorstepRadiusKm: 7.5 })).toEqual([
      { text: 'Doorstep only' },
      { text: '7.5 km' },
    ])
    expect(bookingParts({ ...modes, dropinEnabled: false, doorstepRadiusKm: null })).toEqual([
      { text: 'Doorstep only' },
      { quiet: '10 km default' },
    ])
    expect(bookingParts({ ...modes, hasDoorstepArea: true })).toEqual([
      { text: 'At the garage' },
      { text: 'Doorstep', quiet: 'drawn area' },
    ])
    expect(bookingParts({ ...modes, doorstepEnabled: false })).toEqual([{ text: 'At the garage' }])
    expect(bookingParts({ ...modes, dropinEnabled: false, doorstepEnabled: false })).toEqual([])
  })
})

describe('the readiness line', () => {
  test('nothing at all: Ready', () => {
    expect(readinessSummary([])).toEqual({ needsFixing: false, main: 'Ready', optional: null })
  })

  test('only optional items: still Ready, with them named in grey', () => {
    expect(readinessSummary([item('optional', 'logo'), item('optional', 'photos')])).toEqual({
      needsFixing: false,
      main: 'Ready',
      optional: '2 optional: logo, photos',
    })
  })

  test('only items to fix: amber, and named', () => {
    expect(readinessSummary([item('fix', 'map pin')])).toEqual({
      needsFixing: true,
      main: '1 to fix: map pin',
      optional: null,
    })
  })

  test('anything blocking: the counts, with the optional ones trailing', () => {
    expect(
      readinessSummary([
        item('blocking', 'services'),
        item('fix', 'map pin'),
        item('fix', 'bays'),
        item('optional', 'logo'),
      ])
    ).toEqual({ needsFixing: true, main: '1 blocking · 2 to fix', optional: '1 optional' })
    expect(readinessSummary([item('blocking', 'services')]).main).toBe('1 blocking')
  })

  test('the checklist is grouped Blocking, Fix, Optional, leaving out empty groups', () => {
    const groups = readinessGroups([item('optional', 'logo'), item('blocking', 'services')])
    expect(groups.map((g) => g.title)).toEqual(['Blocking', 'Optional'])
    expect(groups[0].items.map((i) => i.short)).toEqual(['services'])
  })

  test('a row opens its tab, and brings the list back with its chip', () => {
    const href = editHref('v1', '/vendors?show=pending', 'services')
    expect(href).toBe('/vendors/v1/edit?tab=services&back=%2Fvendors%3Fshow%3Dpending')
    const back = new URLSearchParams(href.split('?')[1]).get('back')
    expect(safeBackHref(back)).toBe('/vendors?show=pending')
    expect(editHref('v1', '/vendors')).toBe('/vendors/v1/edit?back=%2Fvendors')
  })
})
