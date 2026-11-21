import { describe, expect, test } from 'bun:test'
import {
  FAKE_JOB_READING,
  FAKE_SCAN_READING,
  SHINE_MAX_ATTEMPTS_PER_DAY,
  SHINE_RULES,
  biggestChange,
  cleanFindings,
  fromPrice,
  jobPhotoText,
  lowestArea,
  matchJobPhotos,
  needOf,
  needsReview,
  overallOf,
  parseJobReading,
  parseScanReading,
  pickService,
  scanRefusal,
  scansLeft,
  serviceFit,
  summaryOf,
  type ScanToday,
  type ShineJobPhoto,
  type SuggestableService,
} from './shine-score.js'

const NOW = new Date('2026-11-15T06:00:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

describe('free scans a day', () => {
  test('three a day; scored ones count', () => {
    expect(scansLeft([], NOW)).toBe(3)
    const two: ScanToday[] = [
      { status: 'scored', createdAt: minutesAgo(60) },
      { status: 'scored', createdAt: minutesAgo(30) },
    ]
    expect(scansLeft(two, NOW)).toBe(1)
  })

  test('a failed scan never uses one up', () => {
    const failed: ScanToday[] = [
      { status: 'failed', createdAt: minutesAgo(5) },
      { status: 'failed', createdAt: minutesAgo(4) },
      { status: 'failed', createdAt: minutesAgo(3) },
    ]
    expect(scansLeft(failed, NOW)).toBe(3)
    expect(scanRefusal(failed, NOW)).toBeNull()
  })

  test('one being scored holds a place for a few minutes only', () => {
    expect(scansLeft([{ status: 'scoring', createdAt: minutesAgo(1) }], NOW)).toBe(2)
    expect(scansLeft([{ status: 'scoring', createdAt: minutesAgo(30) }], NOW)).toBe(3)
  })

  test('the fourth is refused, and so are endless failed tries', () => {
    const three: ScanToday[] = Array.from({ length: 3 }, (_, i) => ({ status: 'scored', createdAt: minutesAgo(i + 10) }))
    expect(scanRefusal(three, NOW)).toBe('limit')
    const tries: ScanToday[] = Array.from({ length: SHINE_MAX_ATTEMPTS_PER_DAY }, () => ({
      status: 'failed',
      createdAt: minutesAgo(20),
    }))
    expect(scanRefusal(tries, NOW)).toBe('too_many_tries')
  })
})

describe('scores and words', () => {
  const scores = { front: 70, side: 66, dashboard: 58, seats: 41 }

  test('the overall is the plain average, rounded', () => {
    expect(overallOf(scores)).toBe(59)
    expect(overallOf({ front: 50, dashboard: 81 }, ['front', 'dashboard'])).toBe(66)
    expect(overallOf({})).toBe(0)
  })

  test('summary and suggestion come from the numbers', () => {
    expect(summaryOf({ front: 80, side: 80, dashboard: 40, seats: 40 })).toEqual({
      summary: 'Clean outside, the inside needs work.',
      suggestion: 'A wash with interior cleaning would lift it most.',
    })
    expect(summaryOf({ front: 90, side: 90, dashboard: 90, seats: 90 }).summary).toBe('Clean inside and out.')
    expect(summaryOf({ front: 30, side: 30, dashboard: 30, seats: 30 }).suggestion).toBe(
      'An interior and exterior wash would lift it most.'
    )
    expect(summaryOf({ front: 40, side: 40, dashboard: 90, seats: 90 }).summary).toBe(
      'The outside needs work; the inside is clean.'
    )
  })

  test('what a wash would help most', () => {
    expect(needOf(scores)).toBe('both')
    expect(needOf({ front: 90, side: 90, dashboard: 40, seats: 60 })).toBe('inside')
    expect(needOf({ front: 50, side: 60, dashboard: 90, seats: 90 })).toBe('outside')
    expect(needOf({ front: 90, side: 90, dashboard: 90, seats: 90 })).toBe('none')
  })

  test('biggest change and lowest area', () => {
    const areas = ['front', 'dashboard', 'seats'] as const
    expect(biggestChange({ front: 50, dashboard: 40, seats: 30 }, { front: 90, dashboard: 80, seats: 92 }, areas)).toBe('seats')
    expect(biggestChange({ front: 90 }, { front: 80 }, ['front'])).toBeNull()
    expect(lowestArea({ front: 70, dashboard: 48, seats: 55 }, areas)).toBe('dashboard')
  })

  test('only an after-score under 60 goes to people', () => {
    expect(needsReview(59)).toBe(true)
    expect(needsReview(SHINE_RULES.lowAfterScore)).toBe(false)
  })
})

describe('suggested services', () => {
  const service = (over: Partial<SuggestableService>): SuggestableService => ({
    id: 's',
    name: 'Foam wash',
    category: 'car_wash',
    pricingType: 'flat',
    price: '499.00',
    priceHatchback: null,
    priceSedan: null,
    priceSuv: null,
    durationMins: 60,
    ...over,
  })

  test('both sides: a service named for both wins over a plain wash', () => {
    const plain = service({ id: 'a', name: 'Foam wash', price: '399.00' })
    const full = service({ id: 'b', name: 'Interior + exterior wash', price: '649.00' })
    expect(pickService([plain, full], 'both')?.id).toBe('b')
  })

  test('inside: interior cleaning, else detailing', () => {
    const plain = service({ id: 'a' })
    const detail = service({ id: 'b', name: 'Polish', category: 'detailing' })
    const interior = service({ id: 'c', name: 'Interior vacuum', category: 'car_wash' })
    expect(pickService([plain, detail], 'inside')?.id).toBe('b')
    expect(pickService([plain, detail, interior], 'inside')?.id).toBe('c')
  })

  test('never coating, scratch work, or a price on inspection', () => {
    expect(serviceFit(service({ category: 'coating', name: 'Ceramic full' }), 'both')).toBe(0)
    expect(serviceFit(service({ category: 'scratch_removal' }), 'outside')).toBe(0)
    expect(serviceFit(service({ pricingType: 'on_inspection' }), 'outside')).toBe(0)
    expect(pickService([service({ category: 'coating' })], 'both')).toBeNull()
  })

  test('ties go to the lower price; per-vehicle prices from the cheapest size', () => {
    const dear = service({ id: 'a', price: '799.00' })
    const sized = service({ id: 'b', pricingType: 'per_vehicle', price: '0', priceHatchback: '349.00', priceSuv: '599.00' })
    expect(fromPrice(sized)).toBe(349)
    expect(pickService([dear, sized], 'outside')?.id).toBe('b')
  })
})

describe('job photos: matching areas', () => {
  let n = 0
  const photo = (stage: 'before' | 'after', angle: string | null, minutes = 0): ShineJobPhoto => ({
    id: `p${++n}`,
    stage,
    angle,
    storageKey: `vendors/v/job-photos/b/${n}.jpg`,
    url: `vendors/v/job-photos/b/${n}.jpg`,
    createdAt: minutesAgo(minutes),
  })

  test('front and interior at both stages match three areas, sending each photo once', () => {
    const matched = matchJobPhotos([
      photo('before', 'front'),
      photo('before', 'interior'),
      photo('after', 'front'),
      photo('after', 'interior'),
      photo('after', 'back'),
    ])
    expect(matched?.areas).toEqual(['front', 'dashboard', 'seats'])
    expect(matched?.before).toHaveLength(2)
    expect(matched?.after.map((row) => row.areas)).toEqual([['front'], ['dashboard', 'seats']])
    expect(jobPhotoText(matched!)).toContain('Photo 4: AFTER, shows Dashboard and Seats & floor.')
  })

  test('a side is the left or the right; the newest photo of an angle is used', () => {
    const oldLeft = photo('after', 'left', 30)
    const newLeft = photo('after', 'left', 1)
    const matched = matchJobPhotos([photo('before', 'right'), photo('before', 'front'), photo('after', 'front'), oldLeft, newLeft])
    expect(matched?.areas).toEqual(['front', 'side'])
    expect(matched?.after.some((row) => row.photo.id === newLeft.id)).toBe(true)
    expect(matched?.after.some((row) => row.photo.id === oldLeft.id)).toBe(false)
  })

  test('fewer than two matching areas: no score', () => {
    expect(matchJobPhotos([photo('before', 'front'), photo('after', 'front'), photo('after', 'interior')])).toBeNull()
    expect(matchJobPhotos([photo('before', null), photo('after', null)])).toBeNull()
  })
})

describe('reading the answer', () => {
  test('the fake scan reads, with tidy findings', () => {
    const reading = parseScanReading(JSON.stringify(FAKE_SCAN_READING))
    expect(reading?.scores).toEqual({ front: 70, side: 66, dashboard: 58, seats: 41 })
    expect(reading?.findings.map((f) => f.text)).toEqual(['Floor mats muddy', 'Dust on the dashboard', 'Water spots on bonnet'])
  })

  test('unreadable, a missing score, out of range or not JSON: no reading', () => {
    expect(parseScanReading(JSON.stringify({ ...FAKE_SCAN_READING, readable: false }))).toBeNull()
    expect(parseScanReading(JSON.stringify({ ...FAKE_SCAN_READING, scores: { ...FAKE_SCAN_READING.scores, seats: null } }))).toBeNull()
    expect(parseScanReading(JSON.stringify({ ...FAKE_SCAN_READING, scores: { ...FAKE_SCAN_READING.scores, seats: 140 } }))).toBeNull()
    expect(parseScanReading('not json')).toBeNull()
  })

  test('findings: no plates or numbers, no banned words, no repeats, at most four', () => {
    const findings = cleanFindings([
      { text: 'dust on the dashboard.', area: 'dashboard' },
      { text: 'Dust on the dashboard', area: 'dashboard' },
      { text: 'Plate TN07CD9036 dirty', area: 'front' },
      { text: 'Guaranteed spotless soon', area: 'front' },
      { text: 'Mud on the wheels', area: 'side' },
      { text: 'Crumbs on seats', area: 'seats' },
      { text: 'Smears on the glass', area: 'front' },
      { text: 'Mats muddy', area: 'seats' },
    ])
    expect(findings.map((f) => f.text)).toEqual([
      'Dust on the dashboard',
      'Mud on the wheels',
      'Crumbs on seats',
      'Smears on the glass',
    ])
  })

  test('a job reading keeps only the matched areas, and needs both scores of each', () => {
    const reading = parseJobReading(JSON.stringify(FAKE_JOB_READING), ['front', 'seats'])
    expect(reading).toEqual({ before: { front: 52, seats: 38 }, after: { front: 94, seats: 92 }, findings: [] })
    const missing = { ...FAKE_JOB_READING, after: { ...FAKE_JOB_READING.after, seats: null } }
    expect(parseJobReading(JSON.stringify(missing), ['front', 'seats'])).toBeNull()
    expect(parseJobReading(JSON.stringify(missing), ['front'])).not.toBeNull()
  })
})
