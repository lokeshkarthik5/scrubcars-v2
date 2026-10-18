import { describe, expect, test } from 'bun:test'
import {
  buildCertificate,
  CERTIFICATE_NUMBER_PATTERN,
  CERTIFICATE_TOKEN_PATTERN,
  certificateNumber,
  deriveCertificateKey,
  eligibleJobs,
  expiresAtFor,
  isTokenShaped,
  linkStanding,
  linkToken,
  maskRegistration,
  photoPairOf,
  photoPath,
  photoSignatureValid,
  PHOTO_URL_TTL_SECONDS,
  toPublicCertificate,
  tokenHash,
  type CertificateInput,
  type CertificatePhoto,
  type CertificateRow,
} from './service-history-certificate.js'

const NOW = new Date('2026-10-18T06:30:00Z') // 12:00 IST
const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY)

const id = (n: number) => `e2e00000-0000-4000-8000-00000000${String(n).padStart(4, '0')}`

function row(over: Partial<CertificateRow> & { id: string }): CertificateRow {
  return {
    chainId: over.id,
    rescheduleCount: 0,
    createdAt: daysAgo(30),
    status: 'completed',
    scheduledAt: daysAgo(20),
    completedAt: daysAgo(20),
    markedTest: false,
    vendorId: id(3310),
    vendorName: 'Shine Studio',
    vendorInBin: false,
    services: ['Foam Wash'],
    ...over,
  }
}

function photo(over: Partial<CertificatePhoto> & { id: string; bookingId: string; stage: 'before' | 'after' }): CertificatePhoto {
  return {
    angle: null,
    createdAt: daysAgo(20),
    url: `https://photos.example/vendors/x/job-photos/${over.bookingId}/${over.id}.jpg`,
    ...over,
  }
}

describe('maskRegistration', () => {
  test('standard plates keep the state, RTO and last four digits', () => {
    expect(maskRegistration('TN09AB1234')).toBe('TN09 ** ** 1234')
    expect(maskRegistration('tn 09 ab 1234')).toBe('TN09 ** ** 1234')
    expect(maskRegistration('TN-09-A-1234')).toBe('TN09 ** ** 1234')
    expect(maskRegistration('DL3CAB0042')).toBe('DL03 ** ** 0042')
    expect(maskRegistration('KA01MJ7')).toBe('KA01 ** ** 0007')
  })

  test('the mask is the same width whatever the series, so its length is not told', () => {
    expect(maskRegistration('TN091234')).toBe('TN09 ** ** 1234')
    expect(maskRegistration('TN09ABC1234')).toBe('TN09 ** ** 1234')
  })

  test('Bharat series keep the year, BH and the digits', () => {
    expect(maskRegistration('22 BH 1234 AA')).toBe('22 BH 1234 **')
  })

  test('anything else shows only its last two characters', () => {
    expect(maskRegistration('TEMP/TN/2026/77')).toBe('** ** ** 77')
  })

  test('nothing, or too little to mask, is not shown', () => {
    expect(maskRegistration(null)).toBeNull()
    expect(maskRegistration('')).toBeNull()
    expect(maskRegistration('TN9')).toBeNull()
  })

  test('the series letters never appear', () => {
    for (const plate of ['TN09AB1234', 'MH12DE1433', 'KA05XYZ0001']) {
      const masked = maskRegistration(plate)!
      expect(masked).not.toContain(plate.slice(4, 6))
      expect(masked.replace(/[^A-Z0-9]/g, '')).not.toBe(plate)
    }
  })
})

describe('certificateNumber', () => {
  test('is DSH-XXXX-XXXX, the same for a car every time, different between cars', () => {
    const first = certificateNumber(id(3301))
    expect(first).toMatch(CERTIFICATE_NUMBER_PATTERN)
    expect(certificateNumber(id(3301))).toBe(first)
    expect(certificateNumber(id(3302))).not.toBe(first)
  })
})

describe('tokens: create, look up, rotate', () => {
  const key = deriveCertificateKey('test-secret')

  test('a token is 32 URL-safe characters, made from the link id', () => {
    const token = linkToken(key, id(3320))
    expect(token).toMatch(CERTIFICATE_TOKEN_PATTERN)
    expect(token.length).toBeGreaterThanOrEqual(20)
    expect(isTokenShaped(token)).toBe(true)
    // The owner's page shows the same link again without it being stored.
    expect(linkToken(key, id(3320))).toBe(token)
  })

  test('only a hash is stored, and the hash is not the token', () => {
    const token = linkToken(key, id(3320))
    const hash = tokenHash(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
    expect(tokenHash(token)).toBe(hash)
  })

  test('a new link (rotation) is a different token; another secret gives another token', () => {
    expect(linkToken(key, id(3321))).not.toBe(linkToken(key, id(3320)))
    expect(linkToken(deriveCertificateKey('other-secret'), id(3320))).not.toBe(linkToken(key, id(3320)))
  })

  test('malformed tokens are refused before any lookup', () => {
    for (const bad of ['', 'short', 'x'.repeat(33), `${'a'.repeat(31)}/`, 42, null]) {
      expect(isTokenShaped(bad)).toBe(false)
    }
  })

  test('standing: active, then expired once its time passes, revoked whatever the time', () => {
    const expiresAt = expiresAtFor(7, NOW)
    expect(expiresAt?.toISOString()).toBe(new Date(NOW.getTime() + 7 * DAY).toISOString())
    expect(expiresAtFor(null, NOW)).toBeNull()

    expect(linkStanding({ revokedAt: null, expiresAt: null }, NOW)).toBe('active')
    expect(linkStanding({ revokedAt: null, expiresAt }, NOW)).toBe('active')
    expect(linkStanding({ revokedAt: null, expiresAt }, new Date(NOW.getTime() + 7 * DAY))).toBe('expired')
    expect(linkStanding({ revokedAt: NOW, expiresAt: null }, NOW)).toBe('revoked')
    expect(linkStanding({ revokedAt: NOW, expiresAt }, NOW)).toBe('revoked')
  })
})

describe('photo paths', () => {
  const key = deriveCertificateKey('test-secret')
  const link = id(3320)
  const pic = id(3340)

  function parse(path: string) {
    const url = new URL(path, 'https://api.example')
    return {
      photoId: url.pathname.split('/').pop()!,
      expiresAtSec: Number(url.searchParams.get('e')),
      signature: url.searchParams.get('s')!,
    }
  }

  test('name the photo, not the link or a storage key', () => {
    const path = photoPath(key, pic, link, NOW)
    expect(path.startsWith(`/certificates/photos/${pic}?`)).toBe(true)
    expect(path).not.toContain(link)
    expect(path).not.toContain('job-photos')
  })

  test('work for their link until they run out', () => {
    const signed = parse(photoPath(key, pic, link, NOW))
    expect(photoSignatureValid(key, { ...signed, linkId: link }, NOW)).toBe(true)
    const later = new Date(NOW.getTime() + (PHOTO_URL_TTL_SECONDS + 1) * 1000)
    expect(photoSignatureValid(key, { ...signed, linkId: link }, later)).toBe(false)
  })

  test('fail for a new link, another photo, a changed expiry or a wrong signature', () => {
    const signed = parse(photoPath(key, pic, link, NOW))
    expect(photoSignatureValid(key, { ...signed, linkId: id(3321) }, NOW)).toBe(false)
    expect(photoSignatureValid(key, { ...signed, photoId: id(3341), linkId: link }, NOW)).toBe(false)
    expect(photoSignatureValid(key, { ...signed, expiresAtSec: signed.expiresAtSec + 60, linkId: link }, NOW)).toBe(false)
    expect(photoSignatureValid(key, { ...signed, signature: 'x'.repeat(32), linkId: link }, NOW)).toBe(false)
  })

  test('an expiry far in the future is refused even if signed', () => {
    const far = Math.floor(NOW.getTime() / 1000) + 24 * 60 * 60
    const signed = parse(photoPath(key, pic, link, new Date(far * 1000 - PHOTO_URL_TTL_SECONDS * 1000)))
    expect(photoSignatureValid(key, { ...signed, linkId: link }, NOW)).toBe(false)
  })
})

describe('eligibleJobs: what counts', () => {
  test('completed jobs only, newest first; cancelled and no-shows, jobs to come and in progress are not', () => {
    const jobs = eligibleJobs([
      row({ id: id(3330), completedAt: daysAgo(40), scheduledAt: daysAgo(40) }),
      row({ id: id(3331), completedAt: daysAgo(5), scheduledAt: daysAgo(5) }),
      row({ id: id(3332), status: 'cancelled', completedAt: null }),
      row({ id: id(3333), status: 'confirmed', completedAt: null, scheduledAt: new Date(NOW.getTime() + DAY) }),
      row({ id: id(3334), status: 'in_progress', completedAt: null }),
    ])
    expect(jobs.map((job) => job.id)).toEqual([id(3331), id(3330)])
  })

  test('a reschedule chain counts once, as its latest row', () => {
    const jobs = eligibleJobs([
      row({ id: id(3335), status: 'cancelled', completedAt: null, rescheduleCount: 0, createdAt: daysAgo(30) }),
      row({ id: id(3336), chainId: id(3335), rescheduleCount: 1, createdAt: daysAgo(25) }),
    ])
    expect(jobs.map((job) => job.id)).toEqual([id(3336)])
  })

  test('a chain moved and then cancelled is not listed', () => {
    const jobs = eligibleJobs([
      row({ id: id(3335), status: 'cancelled', completedAt: null }),
      row({ id: id(3336), chainId: id(3335), rescheduleCount: 1, status: 'cancelled', completedAt: null }),
    ])
    expect(jobs).toEqual([])
  })

  test('a Test-marked chain is left out, even if only one of its rows carries the mark', () => {
    const jobs = eligibleJobs([
      row({ id: id(3337), markedTest: true }),
      row({ id: id(3338), status: 'cancelled', completedAt: null, markedTest: true }),
      row({ id: id(3339), chainId: id(3338), rescheduleCount: 1 }),
      row({ id: id(3340) }),
    ])
    expect(jobs.map((job) => job.id)).toEqual([id(3340)])
  })

  test('a Detlio Guarantee free redo is left out; the job it re-did stays', () => {
    const jobs = eligibleJobs([
      row({ id: id(3341), completedAt: daysAgo(6), scheduledAt: daysAgo(6) }),
      row({ id: id(3342), guaranteeRedo: true, completedAt: daysAgo(4), scheduledAt: daysAgo(4) }),
    ])
    expect(jobs.map((job) => job.id)).toEqual([id(3341)])
  })
})

describe('photoPairOf', () => {
  const booking = id(3330)
  test('matches an angle taken on both sides, front first', () => {
    const pair = photoPairOf([
      photo({ id: id(3341), bookingId: booking, stage: 'before', angle: 'left' }),
      photo({ id: id(3342), bookingId: booking, stage: 'before', angle: 'front' }),
      photo({ id: id(3343), bookingId: booking, stage: 'after', angle: 'left' }),
      photo({ id: id(3344), bookingId: booking, stage: 'after', angle: 'front' }),
    ])
    expect(pair?.before.id).toBe(id(3342))
    expect(pair?.after.id).toBe(id(3344))
  })

  test('otherwise the first of each; none without both sides', () => {
    const pair = photoPairOf([
      photo({ id: id(3345), bookingId: booking, stage: 'after', angle: 'back', createdAt: daysAgo(19) }),
      photo({ id: id(3346), bookingId: booking, stage: 'before', angle: 'front', createdAt: daysAgo(20) }),
    ])
    expect(pair?.before.id).toBe(id(3346))
    expect(pair?.after.id).toBe(id(3345))
    expect(photoPairOf([photo({ id: id(3347), bookingId: booking, stage: 'before' })])).toBeNull()
    expect(photoPairOf([])).toBeNull()
  })
})

describe('buildCertificate and the public payload', () => {
  const CAR = {
    id: id(3303),
    make: 'Hyundai',
    model: 'Creta',
    color: 'White',
    licensePlate: 'TN09AB1234',
    vehicleType: 'suv',
  }
  const wash = id(3330)
  const coating = id(3331)
  const input: CertificateInput = {
    car: CAR,
    rows: [
      row({ id: wash, completedAt: new Date('2026-10-10T20:00:00Z'), services: ['Foam Wash'] }),
      row({
        id: coating,
        completedAt: new Date('2026-07-01T04:00:00Z'),
        vendorId: id(3311),
        vendorName: 'Gloss Garage',
        services: ['Ceramic Coating', 'Interior Clean'],
      }),
      row({ id: id(3332), status: 'cancelled', completedAt: null }),
    ],
    photos: [
      photo({ id: id(3341), bookingId: coating, stage: 'before', angle: 'front' }),
      photo({ id: id(3342), bookingId: coating, stage: 'after', angle: 'front' }),
      photo({ id: id(3343), bookingId: wash, stage: 'before' }),
    ],
    certified: new Set([id(3311)]),
    documentsVerified: new Set([id(3310), id(3311)]),
    now: NOW,
  }

  test('lists the completed jobs newest first with dates in IST, marks and photos', () => {
    const view = buildCertificate(input, null)
    expect(view.certificateNumber).toBe(certificateNumber(CAR.id))
    expect(view.asOf).toBe('2026-10-18')
    expect(view.car).toEqual({ make: 'Hyundai', model: 'Creta', color: 'White', bodyType: 'suv', registration: 'TN09 ** ** 1234' })
    expect(view.jobs).toHaveLength(2)
    // 20:00 UTC on 10 Oct is 01:30 on 11 Oct in Chennai.
    expect(view.jobs[0]).toEqual({
      date: '2026-10-11',
      garage: { name: 'Shine Studio', certified: false, documentsVerified: true },
      services: ['Foam Wash'],
      photos: { before: true, after: false },
      photoPair: null,
    })
    expect(view.jobs[1].garage).toEqual({ name: 'Gloss Garage', certified: true, documentsVerified: true })
    expect(view.jobs[1].photos).toEqual({ before: true, after: true })
    expect(view.totals).toEqual({ jobs: 2, firstServiceOn: '2026-07-01', lastServiceOn: '2026-10-11' })
  })

  test('photo pairs only when a photo address is given, and only for jobs with both sides', () => {
    const view = buildCertificate(input, (p) => `/signed/${p.id}`)
    expect(view.jobs[0].photoPair).toBeNull()
    expect(view.jobs[1].photoPair).toEqual({ before: `/signed/${id(3341)}`, after: `/signed/${id(3342)}` })
  })

  test('a garage in the Bin keeps its name but loses its marks', () => {
    const view = buildCertificate(
      { ...input, rows: input.rows.map((r) => (r.id === coating ? { ...r, vendorInBin: true } : r)) },
      null
    )
    expect(view.jobs[1].garage).toEqual({ name: 'Gloss Garage', certified: false, documentsVerified: false })
  })

  test('no jobs: empty list and no dates', () => {
    const view = buildCertificate({ ...input, rows: [] }, null)
    expect(view.jobs).toEqual([])
    expect(view.totals).toEqual({ jobs: 0, firstServiceOn: null, lastServiceOn: null })
  })

  test('the public payload has no personal data: only the allowed keys, no plate, no stored URL', () => {
    const key = deriveCertificateKey('test-secret')
    const view = buildCertificate(input, (p) => photoPath(key, p.id, id(3320), NOW))
    const pub = toPublicCertificate({ ...view, ...{ owner: 'Priya', phone: '9000003301' } } as typeof view, true)

    expect(Object.keys(pub).sort()).toEqual(['asOf', 'car', 'certificateNumber', 'includesPhotos', 'jobs', 'totals'])
    expect(Object.keys(pub.car).sort()).toEqual(['bodyType', 'color', 'make', 'model', 'registration'])
    for (const job of pub.jobs) {
      expect(Object.keys(job).sort()).toEqual(['date', 'garage', 'photoPair', 'photos', 'services'])
      expect(Object.keys(job.garage).sort()).toEqual(['certified', 'documentsVerified', 'name'])
    }

    const text = JSON.stringify(pub)
    expect(text).not.toContain('Priya')
    expect(text).not.toContain('9000003301')
    expect(text).not.toContain('TN09AB1234')
    expect(text).not.toContain('https://photos.example')
    expect(text).not.toContain('job-photos')
    expect(text).not.toContain(CAR.id)
    expect(text).not.toContain(wash)
    expect(text).not.toContain(coating)
    expect(pub.jobs[1].photoPair?.before.startsWith('/certificates/photos/')).toBe(true)
  })

  test('without photos shared, the public payload carries no photo address at all', () => {
    const owner = buildCertificate(input, (p) => p.url)
    const pub = toPublicCertificate(owner, false)
    expect(pub.includesPhotos).toBe(false)
    expect(pub.jobs.every((job) => job.photoPair === null)).toBe(true)
    expect(JSON.stringify(pub)).not.toContain('https://')
  })
})
