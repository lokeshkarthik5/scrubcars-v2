import { describe, expect, test } from 'bun:test'
import type {
  CoverageGarage,
  CoverageRecommendation,
  CoverageZone,
  Lead,
  ZoneDemand,
} from '@repo/core/api/admin-coverage'
import {
  barParts,
  coverageDots,
  demandByZone,
  demandLine,
  hotRuleText,
  newRecommendations,
  recommendationsByLead,
  recommendedLine,
  sortByDemand,
  coverageTotals,
  filterCounts,
  filterRows,
  listedZones,
  outsideRows,
  rowsByZone,
  zoneArea,
  zoneColour,
  zoneStats,
  zoneSummaryLine,
} from './coverage'

const zone = (
  id: string,
  name: string,
  priority: boolean,
  target: number,
  lat = 13.085,
  lng = 80.21
): CoverageZone => ({
  id,
  slug: id,
  name,
  lat,
  lng,
  priority,
  target,
  liveAt: null,
  updatedAt: '2026-10-28T00:00:00Z',
})

const garage = (
  id: string,
  zoneId: string | null,
  live: boolean,
  extra: Partial<CoverageGarage> = {}
): CoverageGarage => ({
  id,
  name: `Garage ${id}`,
  phone: '9000000000',
  lat: 13.08,
  lng: 80.21,
  zoneId,
  live,
  stage: live ? 'live' : 'pending',
  ...extra,
})

const lead = (
  id: string,
  zoneId: string | null,
  status: Lead['status'],
  extra: Partial<Lead> = {}
): Lead => ({
  id,
  name: `Lead ${id}`,
  ownName: `Lead ${id}`,
  phone: null,
  ownPhone: null,
  address: null,
  mapsUrl: null,
  lat: 13.081,
  lng: 80.211,
  pinSource: 'map',
  zoneId,
  source: 'manual',
  status,
  notInterestedReason: status === 'not_interested' ? 'No' : null,
  notInterestedOn: null,
  retryAfter: null,
  assignedLoginId: null,
  assignedName: null,
  lastNote: null,
  lastNoteBy: null,
  lastNoteAt: null,
  vendorId: null,
  onboardedAt: null,
  googlePlaceId: null,
  olaPlaceId: null,
  google: null,
  createdByName: 'Raga',
  createdAt: '2026-10-28T00:00:00Z',
  updatedAt: '2026-10-28T00:00:00Z',
  ...extra,
})

const ANNA = zone('anna', 'Anna Nagar', true, 3)
const ADYAR = zone('adyar', 'Adyar', true, 2, 13.0012, 80.2565)
const KILPAUK = zone('kilpauk', 'Kilpauk', false, 5, 13.085, 80.242)
const PORUR = zone('porur', 'Porur', false, 5, 13.0382, 80.1565)

const OVERVIEW = {
  zones: [ADYAR, ANNA, KILPAUK, PORUR],
  garages: [
    garage('g1', 'anna', true),
    garage('g2', 'anna', false),
    garage('g3', 'adyar', true),
    garage('g4', 'adyar', true),
    garage('g5', null, false, { lat: null, lng: null }),
  ],
  leads: [
    lead('l1', 'anna', 'to_target', { name: 'Zed Wash' }),
    lead('l2', 'anna', 'not_interested'),
    // Onboarded into g2: shown as g2's row, never twice.
    lead('l3', 'anna', 'onboarded', {
      vendorId: 'g2',
      lastNote: 'waiting for photos',
    }),
    lead('l4', 'kilpauk', 'to_target'),
    // Onboarded, but its garage is not listed (in the Bin): its own row.
    lead('l5', 'kilpauk', 'onboarded', { vendorId: 'binned' }),
    lead('l6', null, 'to_target', { lat: null, lng: null }),
  ],
}

describe('zone colours', () => {
  test('green when the target is met; red for a priority zone with nothing live; grey for nothing at all; else amber', () => {
    expect(zoneColour({ priority: true, target: 2 }, 2, 2)).toBe('green')
    expect(zoneColour({ priority: false, target: 2 }, 3, 3)).toBe('green')
    expect(zoneColour({ priority: true, target: 2 }, 0, 4)).toBe('red')
    expect(zoneColour({ priority: true, target: 2 }, 0, 0)).toBe('red')
    expect(zoneColour({ priority: false, target: 2 }, 0, 0)).toBe('grey')
    expect(zoneColour({ priority: false, target: 2 }, 0, 1)).toBe('amber')
    expect(zoneColour({ priority: true, target: 2 }, 1, 1)).toBe('amber')
  })
})

describe('zoneStats', () => {
  const stats = zoneStats(OVERVIEW)
  const byName = Object.fromEntries(stats.map((s) => [s.zone.name, s]))

  test('counts per zone: live garages, to target (leads and garages not live), not interested, known', () => {
    expect(
      ['Adyar', 'Anna Nagar', 'Kilpauk', 'Porur'].map((name) => {
        const s = byName[name]
        return [
          name,
          s.live,
          s.toTarget,
          s.notInterested,
          s.rows.length,
          s.colour,
        ]
      })
    ).toEqual([
      ['Adyar', 2, 0, 0, 2, 'green'],
      ['Anna Nagar', 1, 2, 1, 4, 'amber'],
      ['Kilpauk', 0, 1, 0, 2, 'amber'],
      ['Porur', 0, 0, 0, 0, 'grey'],
    ])
  })

  test('a lead that became a listed garage is that garage’s row, with its note', () => {
    const rows = byName['Anna Nagar'].rows
    const g2 = rows.find(
      (row) => row.kind === 'garage' && row.garage.id === 'g2'
    )
    expect(g2 && g2.kind === 'garage' && g2.lead?.id).toBe('l3')
    expect(
      rows.some((row) => row.kind === 'lead' && row.lead.id === 'l3')
    ).toBe(false)
  })

  test('rows: to target first, then onboarded, then not interested, each A–Z', () => {
    expect(byName['Anna Nagar'].rows.map((row) => row.id)).toEqual([
      'garage:g2',
      'lead:l1',
      'garage:g1',
      'lead:l2',
    ])
  })

  test('the drawer’s filters and their counts', () => {
    const rows = byName['Anna Nagar'].rows
    expect(filterCounts(rows)).toEqual({
      all: 4,
      to_target: 2,
      onboarded: 1,
      not_interested: 1,
    })
    expect(filterRows(rows, 'not_interested').map((row) => row.id)).toEqual([
      'lead:l2',
    ])
    expect(filterRows(rows, 'all')).toHaveLength(4)
    expect(zoneSummaryLine(rows)).toBe(
      '1 onboarded · 2 to target · 1 not interested'
    )
  })

  test('the bar’s parts in percent; an empty zone is all zero', () => {
    expect(barParts(byName['Anna Nagar'])).toEqual({
      onboarded: 25,
      toTarget: 50,
      notInterested: 25,
    })
    expect(barParts(byName.Porur)).toEqual({
      onboarded: 0,
      toTarget: 0,
      notInterested: 0,
    })
  })

  test('Priority shows only priority zones; All keeps the API order', () => {
    expect(listedZones(stats, 'priority').map((s) => s.zone.name)).toEqual([
      'Adyar',
      'Anna Nagar',
    ])
    expect(listedZones(stats, 'all')).toHaveLength(4)
    // A Hot zone shows under Priority too.
    const hot = new Map([
      [
        stats.find((s) => !s.zone.priority)!.zone.id,
        { hot: true } as ZoneDemand,
      ],
    ])
    expect(listedZones(stats, 'priority', hot)).toHaveLength(
      listedZones(stats, 'priority').length + 1
    )
  })
})

test('places in no zone; totals over everything', () => {
  expect(outsideRows(OVERVIEW).map((row) => row.id)).toEqual([
    'garage:g5',
    'lead:l6',
  ])
  expect(coverageTotals(OVERVIEW)).toEqual({
    priorityZones: 2,
    onboarded: 3,
    toTarget: 5,
    notInterested: 1,
  })
  expect(
    rowsByZone(OVERVIEW)
      .get('kilpauk')
      ?.map((row) => row.id)
  ).toEqual(['lead:l4', 'lead:l5'])
})

test('dots: pinned rows only, coloured by status', () => {
  const dots = coverageDots(OVERVIEW)
  expect(dots.find((dot) => dot.id === 'garage:g1')?.tone).toBe('green')
  expect(dots.find((dot) => dot.id === 'garage:g2')?.tone).toBe('orange')
  expect(dots.find((dot) => dot.id === 'lead:l2')?.tone).toBe('red')
  expect(
    dots.some((dot) => dot.id === 'garage:g5' || dot.id === 'lead:l6')
  ).toBe(false)
})

describe('zoneArea', () => {
  const km = (a: [number, number], b: { lat: number; lng: number }) => {
    const dLat = (a[1] - b.lat) * 111.32
    const dLng = (a[0] - b.lng) * 111.32 * Math.cos((b.lat * Math.PI) / 180)
    return Math.hypot(dLat, dLng)
  }

  test('a zone alone is a closed 6 km circle', () => {
    const ring = zoneArea(PORUR, [PORUR], 32)
    expect(ring).toHaveLength(33)
    expect(ring[0]).toEqual(ring[32])
    for (const point of ring) expect(km(point, PORUR)).toBeCloseTo(6, 5)
  })

  test('next to another zone it stops halfway: every point is nearer its own centre', () => {
    const ring = zoneArea(ANNA, [ANNA, KILPAUK])
    for (const point of ring) {
      expect(km(point, ANNA)).toBeLessThanOrEqual(km(point, KILPAUK) + 1e-6)
      expect(km(point, ANNA)).toBeLessThanOrEqual(6 + 1e-6)
    }
    // The cut is halfway between the two centres.
    const eastmost = Math.max(...ring.map((point) => point[0]))
    expect(eastmost).toBeCloseTo((ANNA.lng + KILPAUK.lng) / 2, 4)
  })
})

describe('demand (part 3): the API’s figures, ordered and worded', () => {
  const d = (zoneId: string, patch: Partial<ZoneDemand> = {}): ZoneDemand => ({
    zoneId,
    waiting: 0,
    signups: 0,
    unusedFreeWashes: 0,
    requests: 0,
    openRequests: 0,
    failedRequests: 0,
    recommendations: 0,
    newRecommendations: 0,
    score: 0,
    hot: false,
    ...patch,
  })
  const ZONES = [
    zone('a', 'Adyar', true, 5),
    zone('b', 'Anna Nagar', true, 5),
    zone('c', 'Perambur', false, 5),
  ]
  const stats = zoneStats({ zones: ZONES, garages: [], leads: [] })

  test('most demand first; equal scores keep the API’s order; none from an older API', () => {
    const demand = demandByZone({
      demand: [d('a'), d('b', { score: 3 }), d('c', { score: 14, hot: true })],
    })
    expect(sortByDemand(stats, demand).map((s) => s.zone.id)).toEqual([
      'c',
      'b',
      'a',
    ])
    expect(sortByDemand(stats, demandByZone({})).map((s) => s.zone.id)).toEqual(
      ['a', 'b', 'c']
    )
  })

  test('the zone’s line, and nothing for no demand', () => {
    expect(
      demandLine(
        d('c', {
          waiting: 12,
          failedRequests: 2,
          openRequests: 1,
          newRecommendations: 4,
        })
      )
    ).toBe('12 waiting · 2 failed requests · 1 open request · 4 recommended')
    expect(demandLine(d('c', { failedRequests: 1 }))).toBe('1 failed request')
    expect(demandLine(d('a'))).toBeNull()
    expect(demandLine(undefined)).toBeNull()
  })

  test('Hot in the API’s own numbers', () => {
    expect(hotRuleText({ top: 3, minScore: 10, requestDays: 30 })).toBe(
      'Hot: the top 3 zones by people waiting plus requests nobody accepted in the last 30 days, each with at least 10.'
    )
  })

  const rec = (
    id: string,
    patch: Partial<CoverageRecommendation> = {}
  ): CoverageRecommendation => ({
    id,
    zoneId: 'c',
    name: `Garage ${id}`,
    phone: null,
    mapsLink: null,
    why: null,
    status: 'new',
    leadId: null,
    vendorId: null,
    handledBy: null,
    handledAt: null,
    createdAt: '2026-10-28T00:00:00Z',
    ...patch,
  })

  test('a zone’s new recommendations, and the ones in no zone', () => {
    const recs = [
      rec('1'),
      rec('2', { status: 'contacted', leadId: 'l1' }),
      rec('3', { zoneId: null }),
      rec('4', { zoneId: 'a' }),
    ]
    expect(newRecommendations(recs, 'c').map((r) => r.id)).toEqual(['1'])
    expect(newRecommendations(recs, null).map((r) => r.id)).toEqual(['3'])
  })

  test('the recommendations made into each lead, and its line', () => {
    const byLead = recommendationsByLead([
      rec('1', { status: 'contacted', leadId: 'l1', why: 'Careful' }),
      rec('2', { status: 'joined', leadId: 'l1' }),
      rec('3', { status: 'new', leadId: null }),
      rec('4', { status: 'declined', leadId: 'l2' }),
    ])
    expect([...byLead.keys()]).toEqual(['l1'])
    expect(recommendedLine(byLead.get('l1')!)).toBe(
      'Recommended by 2 customers · “Careful”'
    )
    expect(recommendedLine([{ why: null }])).toBe('Recommended by a customer')
    expect(recommendedLine([])).toBeNull()
  })
})
