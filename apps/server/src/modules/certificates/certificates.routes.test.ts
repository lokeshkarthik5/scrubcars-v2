/**
 * Who may manage a car's Service History certificate links, and what the
 * public page shows, through the real routes and the real auth middleware,
 * wired as users.routes.ts and app.ts wire them. Only the database and the
 * photo bucket are stood in for (put back afterwards).
 *
 * The rules: only the car's owner reads its certificate and makes, changes
 * or stops its link (anyone else's car, or one removed, is a 404 and nothing
 * of it changes); the public lookup needs no sign-in, shows no personal
 * data, and answers an unknown, malformed, revoked, replaced or expired
 * token with the same 404; photos are served only through a path signed for
 * the live link while it includes photos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken } = await import('../../lib/jwt.js')
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')
const { tiersService } = await import('../tiers/tiers.service.js')
const { certificatesRepository } = await import('./certificates.repository.js')
const { vendorsRepository } = await import('../vendors/vendors.repository.js')
const { photoStore } = await import('./certificates.service.js')
const { customerCertificateRoutes, publicCertificateRoutes } = await import('./certificates.routes.js')
type LinkRow = import('./certificates.repository.js').CertificateLinkRow
type CertificateRow = import('../../lib/service-history-certificate.js').CertificateRow
type CertificatePhoto = import('../../lib/service-history-certificate.js').CertificatePhoto

// Ids 3300–3399 only (this feature's range).
const id = (n: number) => `e2e00000-0000-4000-8000-00000000${n}`
const PEOPLE = { owner: id(3301), other: id(3302), garage: id(3304) }
const CARS = { own: id(3303), others: id(3305), removed: id(3306) }
const JOBS = { wash: id(3320), coating: id(3321), cancelled: id(3322) }
const PHOTOS = { before: id(3330), after: id(3331), customer: id(3332) }

const cars = [
  { id: CARS.own, userId: PEOPLE.owner, archived: false, plate: 'TN09AB1234' },
  { id: CARS.others, userId: PEOPLE.other, archived: false, plate: 'TN10CD5678' },
  { id: CARS.removed, userId: PEOPLE.owner, archived: true, plate: null },
]
const userActive = new Map([
  [PEOPLE.owner, true],
  [PEOPLE.other, true],
])

const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(Date.now() - days * DAY)
function job(
  over: Partial<CertificateRow & { userId: string; vehicleId: string }> & { id: string }
): CertificateRow & { userId: string; vehicleId: string } {
  return {
    chainId: over.id,
    rescheduleCount: 0,
    createdAt: ago(60),
    status: 'completed',
    scheduledAt: ago(50),
    completedAt: ago(50),
    markedTest: false,
    vendorId: id(3310),
    vendorName: 'Certificate Test Garage',
    vendorInBin: false,
    services: ['Foam Wash'],
    userId: PEOPLE.owner,
    vehicleId: CARS.own,
    ...over,
  }
}
const bookings = [
  job({ id: JOBS.wash, completedAt: ago(10), scheduledAt: ago(10) }),
  job({ id: JOBS.coating, services: ['Ceramic Coating'] }),
  job({ id: JOBS.cancelled, status: 'cancelled', completedAt: null }),
  job({ id: id(3323), userId: PEOPLE.other, vehicleId: CARS.others }),
]
const photos: Array<CertificatePhoto & { role: string; key: string }> = [
  { id: PHOTOS.before, bookingId: JOBS.coating, stage: 'before', angle: 'front', createdAt: ago(50), url: 'https://photos.example/vendors/g/job-photos/c/before.jpg', role: 'garage', key: 'vendors/g/job-photos/c/before.jpg' },
  { id: PHOTOS.after, bookingId: JOBS.coating, stage: 'after', angle: 'front', createdAt: ago(50), url: 'https://photos.example/vendors/g/job-photos/c/after.jpg', role: 'garage', key: 'vendors/g/job-photos/c/after.jpg' },
  { id: PHOTOS.customer, bookingId: JOBS.coating, stage: 'after', angle: null, createdAt: ago(50), url: 'https://photos.example/vendors/g/job-photos/c/customer/x.jpg', role: 'customer', key: 'vendors/g/job-photos/c/customer/x.jpg' },
]
let links: LinkRow[] = []
let reads: Array<{ storageKey: string; url: string }> = []

// ─── Stand-ins for the database and the bucket ───────────────────────────────

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const carOf = (car: (typeof cars)[number]) => ({
  id: car.id,
  make: 'Hyundai',
  model: 'Creta',
  color: 'White',
  licensePlate: car.plate,
  vehicleType: 'suv',
})
const liveLink = (vehicleId: string) => links.find((l) => l.vehicleId === vehicleId && !l.revokedAt)

beforeAll(() => {
  patch(certificatesRepository, 'findOwnCar', async (userId: string, vehicleId: string) => {
    const car = cars.find((c) => c.id === vehicleId && c.userId === userId && !c.archived)
    return car ? carOf(car) : undefined
  })
  patch(certificatesRepository, 'listCertificateRows', async (userId: string, vehicleId: string) =>
    bookings.filter((b) => b.userId === userId && b.vehicleId === vehicleId)
  )
  patch(certificatesRepository, 'listGaragePhotos', async (ids: string[]) =>
    photos.filter((p) => ids.includes(p.bookingId) && p.role === 'garage')
  )
  patch(certificatesRepository, 'findLiveLink', async (vehicleId: string) => liveLink(vehicleId))
  patch(certificatesRepository, 'replaceLink', async (input: { id: string; userId: string; vehicleId: string; tokenHash: string; includePhotos: boolean; expiresAt: Date | null; now: Date }) => {
    for (const l of links) if (l.vehicleId === input.vehicleId && !l.revokedAt) l.revokedAt = input.now
    const link: LinkRow = {
      id: input.id,
      userId: input.userId,
      vehicleId: input.vehicleId,
      tokenHash: input.tokenHash,
      includePhotos: input.includePhotos,
      createdAt: input.now,
      expiresAt: input.expiresAt,
      revokedAt: null,
      lastViewedAt: null,
      viewCount: 0,
    }
    links.push(link)
    return link
  })
  patch(certificatesRepository, 'setIncludePhotos', async (userId: string, vehicleId: string, includePhotos: boolean) => {
    const link = links.find((l) => l.userId === userId && l.vehicleId === vehicleId && !l.revokedAt)
    if (link) link.includePhotos = includePhotos
    return link
  })
  patch(certificatesRepository, 'revoke', async (userId: string, vehicleId: string, now: Date) => {
    let n = 0
    for (const l of links) {
      if (l.userId === userId && l.vehicleId === vehicleId && !l.revokedAt) {
        l.revokedAt = now
        n += 1
      }
    }
    return n
  })
  patch(certificatesRepository, 'findByTokenHash', async (hash: string) => {
    const link = links.find((l) => l.tokenHash === hash)
    const car = link && cars.find((c) => c.id === link.vehicleId && c.userId === link.userId && !c.archived)
    return link && car && userActive.get(link.userId) ? { link, car: carOf(car) } : undefined
  })
  patch(certificatesRepository, 'recordView', async (linkId: string, now: Date) => {
    const link = links.find((l) => l.id === linkId && !l.revokedAt)
    if (link) {
      link.viewCount += 1
      link.lastViewedAt = now
    }
  })
  patch(certificatesRepository, 'findSharedPhoto', async (photoId: string) => {
    const p = photos.find((each) => each.id === photoId)
    const b = p && bookings.find((each) => each.id === p.bookingId)
    if (!p || !b) return undefined
    const link = links.find((l) => l.vehicleId === b.vehicleId && l.userId === b.userId && !l.revokedAt)
    return {
      photoId: p.id,
      url: p.url,
      storageKey: p.key,
      uploadedByRole: p.role,
      bookingStatus: b.status,
      bookingMarkedTest: b.markedTest,
      bookingGuaranteeRedo: false,
      link: link ? { id: link.id, includePhotos: link.includePhotos, expiresAt: link.expiresAt, revokedAt: link.revokedAt } : null,
    }
  })
  patch(tiersService, 'customerTiers', async () => new Map())
  patch(photoStore, 'read', async (photo: { storageKey: string; url: string }) => {
    reads.push(photo)
    return { body: new TextEncoder().encode(`bytes of ${photo.storageKey}`), contentType: 'image/jpeg' }
  })
})

beforeEach(() => {
  links = []
  reads = []
  userActive.set(PEOPLE.owner, true)
  cars.find((c) => c.id === CARS.own)!.archived = false
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

// ─── The app, wired the way users.routes.ts and app.ts wire it ───────────────

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
const users = new Hono()
users.use('*', authMiddleware, requireCustomer)
users.route('/me', customerCertificateRoutes)
app.route('/users', users)
app.route('/certificates', publicCertificateRoutes)

type Who = keyof typeof PEOPLE | null

async function call(method: string, path: string, who: Who, body?: unknown) {
  const headers: Record<string, string> = {}
  if (who) {
    const customer = who !== 'garage'
    const token = await signAccessToken({
      sub: PEOPLE[who],
      aud: customer ? 'customer' : 'vendor',
      isCustomer: customer,
      isVendorOwner: !customer,
    })
    headers.Cookie = `access_token=${token}`
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json: { success?: boolean; code?: string; message?: string; data?: Record<string, unknown> } = {}
  try {
    json = JSON.parse(text)
  } catch {
    // An image.
  }
  return { status: response.status, body: json, text, headers: response.headers }
}

const own = `/users/me/vehicles/${CARS.own}/certificate`
const others = `/users/me/vehicles/${CARS.others}/certificate`

async function shareOwn(body: Record<string, unknown> = {}) {
  const { status, body: json } = await call('POST', `${own}/share`, 'owner', body)
  expect(status).toBe(201)
  return json.data as { token: string; includePhotos: boolean; state: string }
}

const verify = (token: unknown) => call('POST', '/certificates/verify', null, { token })

describe('the owner’s certificate: only your own cars', () => {
  test('your car: its completed jobs, a masked plate, not shared yet', async () => {
    const { status, body, headers } = await call('GET', own, 'owner')
    expect(status).toBe(200)
    expect(headers.get('cache-control')).toBe('no-store')
    const data = body.data as { certificate: { jobs: unknown[]; car: { registration: string } }; share: unknown }
    expect(data.certificate.jobs).toHaveLength(2)
    expect(data.certificate.car.registration).toBe('TN09 ** ** 1234')
    expect(data.share).toBeNull()
  })

  test('someone else’s car is a 404 for every action, and their link is left alone', async () => {
    links.push({
      id: id(3340), userId: PEOPLE.other, vehicleId: CARS.others, tokenHash: 'a'.repeat(64), includePhotos: false,
      createdAt: new Date(), expiresAt: null, revokedAt: null, lastViewedAt: null, viewCount: 0,
    })
    for (const [method, path, body] of [
      ['GET', others, undefined],
      ['POST', `${others}/share`, {}],
      ['PATCH', `${others}/share`, { includePhotos: true }],
      ['DELETE', `${others}/share`, undefined],
    ] as const) {
      const { status, body: json } = await call(method, path, 'owner', body)
      expect(status).toBe(404)
      expect(json.code).toBe('VEHICLE_NOT_FOUND')
    }
    expect(links).toHaveLength(1)
    expect(links[0].revokedAt).toBeNull()
    expect(links[0].includePhotos).toBe(false)
  })

  test('a car you removed is a 404', async () => {
    expect((await call('GET', `/users/me/vehicles/${CARS.removed}/certificate`, 'owner')).status).toBe(404)
    expect((await call('POST', `/users/me/vehicles/${CARS.removed}/certificate/share`, 'owner', {})).status).toBe(404)
  })

  test('signed out is a 401; a garage session is not a customer', async () => {
    expect((await call('GET', own, null)).status).toBe(401)
    expect((await call('POST', `${own}/share`, null, {})).status).toBe(401)
    expect((await call('GET', own, 'garage')).status).toBe(403)
  })

  test('bodies are strict: no user id or unknown expiry rides along', async () => {
    expect((await call('POST', `${own}/share`, 'owner', { userId: PEOPLE.other })).status).toBe(400)
    expect((await call('POST', `${own}/share`, 'owner', { expiresInDays: 5 })).status).toBe(400)
    expect((await call('PATCH', `${own}/share`, 'owner', {})).status).toBe(400)
    expect(links).toHaveLength(0)
  })
})

describe('the public page', () => {
  test('a shared token opens signed out: two jobs, a masked plate, no personal data', async () => {
    const share = await shareOwn()
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(share.state).toBe('active')
    // Only the hash is kept.
    expect(JSON.stringify(links)).not.toContain(share.token)

    const { status, body, text, headers } = await verify(share.token)
    expect(status).toBe(200)
    expect(headers.get('x-robots-tag')).toContain('noindex')
    const data = body.data as { jobs: Array<{ services: string[]; photoPair: unknown }>; car: { registration: string }; includesPhotos: boolean }
    expect(data.jobs.map((j) => j.services)).toEqual([['Foam Wash'], ['Ceramic Coating']])
    expect(data.car.registration).toBe('TN09 ** ** 1234')
    expect(data.includesPhotos).toBe(false)
    expect(data.jobs.every((j) => j.photoPair === null)).toBe(true)
    for (const secret of ['TN09AB1234', PEOPLE.owner, CARS.own, JOBS.wash, 'photos.example', 'job-photos']) {
      expect(text).not.toContain(secret)
    }
    expect(links[0].viewCount).toBe(1)
  })

  test('the owner sees the same link again, and its views', async () => {
    const share = await shareOwn()
    await verify(share.token)
    const { body } = await call('GET', own, 'owner')
    const again = (body.data as { share: { token: string; viewCount: number } }).share
    expect(again.token).toBe(share.token)
    expect(again.viewCount).toBe(1)
  })

  test('unknown, malformed, revoked and replaced tokens all say the same thing', async () => {
    const first = await shareOwn()
    const second = await shareOwn() // A new link: the first stops working.
    expect(second.token).not.toBe(first.token)
    expect(links.filter((l) => !l.revokedAt)).toHaveLength(1)

    const replaced = await verify(first.token)
    const unknown = await verify('A'.repeat(32))
    const malformed = await verify('not a token')
    expect((await verify(second.token)).status).toBe(200)

    expect((await call('DELETE', `${own}/share`, 'owner')).status).toBe(200)
    const revoked = await verify(second.token)
    // Stopping twice is fine.
    expect((await call('DELETE', `${own}/share`, 'owner')).status).toBe(200)

    for (const answer of [replaced, unknown, malformed, revoked]) {
      expect(answer.status).toBe(404)
      expect(answer.body).toEqual({ success: false, message: 'This certificate is not shared.', code: 'CERTIFICATE_NOT_FOUND' })
    }
    // Revoked links count no views.
    expect(links.every((l) => l.viewCount <= 1)).toBe(true)

    // Sharing again makes a fresh, working link.
    const third = await shareOwn()
    expect((await verify(third.token)).status).toBe(200)
  })

  test('an expired link, a removed car or a suspended account shows nothing', async () => {
    const share = await shareOwn({ expiresInDays: 7 })
    expect((await verify(share.token)).status).toBe(200)
    links[0].expiresAt = new Date(Date.now() - 1000)
    expect((await verify(share.token)).status).toBe(404)
    const { body } = await call('GET', own, 'owner')
    expect((body.data as { share: { state: string } }).share.state).toBe('expired')

    const fresh = await shareOwn()
    userActive.set(PEOPLE.owner, false)
    expect((await verify(fresh.token)).status).toBe(404)
    userActive.set(PEOPLE.owner, true)
    cars.find((c) => c.id === CARS.own)!.archived = true
    expect((await verify(fresh.token)).status).toBe(404)
  })
})

describe('photos on the public page', () => {
  async function photoPaths(token: string) {
    const { body } = await verify(token)
    const data = body.data as { jobs: Array<{ photoPair: { before: string; after: string } | null }> }
    return data.jobs.map((j) => j.photoPair)
  }

  test('off by default; included only when the owner ticks it, through signed paths', async () => {
    const share = await shareOwn()
    expect((await photoPaths(share.token)).every((pair) => pair === null)).toBe(true)

    const on = await call('PATCH', `${own}/share`, 'owner', { includePhotos: true })
    expect(on.status).toBe(200)
    expect((on.body.data as { token: string }).token).toBe(share.token)

    const [wash, coating] = await photoPaths(share.token)
    expect(wash).toBeNull() // no garage photos
    expect(coating!.before).toStartWith(`/certificates/photos/${PHOTOS.before}?`)
    expect(coating!.after).toStartWith(`/certificates/photos/${PHOTOS.after}?`)

    const image = await call('GET', coating!.before, null)
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/jpeg')
    expect(image.headers.get('cache-control')).toBe('private, max-age=300')
    expect(image.text).toBe('bytes of vendors/g/job-photos/c/before.jpg')
  })

  test('a signed path stops working when photos are switched off, the link is replaced or stopped', async () => {
    const share = await shareOwn({ includePhotos: true })
    const [, coating] = await photoPaths(share.token)
    expect((await call('GET', coating!.after, null)).status).toBe(200)

    await call('PATCH', `${own}/share`, 'owner', { includePhotos: false })
    expect((await call('GET', coating!.after, null)).status).toBe(404)
    await call('PATCH', `${own}/share`, 'owner', { includePhotos: true })
    expect((await call('GET', coating!.after, null)).status).toBe(200)

    await shareOwn({ includePhotos: true }) // a new link
    expect((await call('GET', coating!.after, null)).status).toBe(404)

    const latest = await call('GET', own, 'owner')
    const token = (latest.body.data as { share: { token: string } }).share.token
    const [, fresh] = await photoPaths(token)
    expect((await call('GET', fresh!.after, null)).status).toBe(200)
    await call('DELETE', `${own}/share`, 'owner')
    expect((await call('GET', fresh!.after, null)).status).toBe(404)
  })

  test('a tampered path, another photo, or the customer’s own photo is a 404', async () => {
    const share = await shareOwn({ includePhotos: true })
    const [, coating] = await photoPaths(share.token)
    const url = new URL(coating!.before, 'https://api.example')

    const tampered = `${url.pathname}?e=${url.searchParams.get('e')}&s=${'x'.repeat(32)}`
    expect((await call('GET', tampered, null)).status).toBe(404)

    const swapped = `/certificates/photos/${PHOTOS.customer}${url.search}`
    expect((await call('GET', swapped, null)).status).toBe(404)

    const unsigned = `/certificates/photos/${PHOTOS.before}`
    expect((await call('GET', unsigned, null)).status).toBe(400)
  })
})

describe('private job photos (R2_DOCS_BUCKET set)', () => {
  const STORAGE = ['r2AccountId', 'r2AccessKeyId', 'r2SecretAccessKey', 'r2DocsBucket', 'r2Endpoint'] as const
  const values = env as unknown as Record<string, string | undefined>
  const saved = Object.fromEntries(STORAGE.map((key) => [key, values[key]]))
  const storedUrls = photos.map((p) => p.url)

  beforeAll(() => {
    // The same bucket switches garage documents on, so the certificate asks
    // which garages hold Documents verified: none here.
    patch(vendorsRepository, 'listApprovedDocumentTypes', async () => [])
  })

  beforeEach(() => {
    values.r2AccountId = 'test-account'
    values.r2AccessKeyId = 'test-key'
    values.r2SecretAccessKey = 'test-secret'
    values.r2DocsBucket = 'detlio-private-test'
    values.r2Endpoint = undefined
    // The garage's before photo is private (its key is stored); the after
    // photo is an older public row, which keeps its address.
    photos[0]!.url = photos[0]!.key
  })

  afterAll(() => {
    Object.assign(values, saved)
    photos.forEach((p, i) => (p.url = storedUrls[i]!))
  })

  test('the owner gets a short-lived link for a private photo, an older public one as it was', async () => {
    const { status, body } = await call('GET', own, 'owner')
    expect(status).toBe(200)
    const data = body.data as { certificate: { jobs: Array<{ photoPair: { before: string; after: string } | null }> } }
    const pair = data.certificate.jobs.find((j) => j.photoPair)!.photoPair!
    const link = new URL(pair.before)
    expect(link.host).toBe('detlio-private-test.test-account.r2.cloudflarestorage.com')
    expect(link.pathname).toBe('/vendors/g/job-photos/c/before.jpg')
    expect(Number(link.searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(15 * 60)
    expect(link.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(pair.after).toBe('https://photos.example/vendors/g/job-photos/c/after.jpg')
  })

  test('someone else asking for the owner’s car gets a 404, and no link', async () => {
    const { status, text } = await call('GET', own, 'other')
    expect(status).toBe(404)
    expect(text).not.toContain('X-Amz-Signature')
    expect(text).not.toContain('job-photos')
  })

  test('the public page shows no photos by default: no link, no key, no address', async () => {
    const share = await shareOwn()
    const { status, text } = await verify(share.token)
    expect(status).toBe(200)
    const data = JSON.parse(text).data as { jobs: Array<{ photoPair: unknown }> }
    expect(data.jobs.every((j) => j.photoPair === null)).toBe(true)
    for (const leak of ['X-Amz-Signature', 'job-photos', 'r2.cloudflarestorage.com', 'photos.example']) {
      expect(text).not.toContain(leak)
    }
  })

  test('with photos included, still only the API’s own signed paths, read from the right bucket', async () => {
    const share = await shareOwn({ includePhotos: true })
    const { text } = await verify(share.token)
    for (const leak of ['X-Amz-Signature', 'job-photos', 'r2.cloudflarestorage.com', 'photos.example']) {
      expect(text).not.toContain(leak)
    }
    const data = JSON.parse(text).data as { jobs: Array<{ photoPair: { before: string; after: string } | null }> }
    const pair = data.jobs.find((j) => j.photoPair)!.photoPair!
    expect(pair.before).toStartWith(`/certificates/photos/${PHOTOS.before}?`)

    expect((await call('GET', pair.before, null)).status).toBe(200)
    expect((await call('GET', pair.after, null)).status).toBe(200)
    // The private photo by its key; the older one by its public address.
    expect(reads).toEqual([
      { storageKey: 'vendors/g/job-photos/c/before.jpg', url: 'vendors/g/job-photos/c/before.jpg' },
      { storageKey: 'vendors/g/job-photos/c/after.jpg', url: 'https://photos.example/vendors/g/job-photos/c/after.jpg' },
    ])
  })
})
