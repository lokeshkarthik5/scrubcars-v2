/**
 * Who may add, see and remove a job's photos (0045), through the real routes
 * and the real auth and tenant middleware. Only the database is stood in
 * for: the seat lookups (membersRepository) and the job-photos reads and
 * writes are replaced on their objects for these tests and put back
 * afterwards, with a small in-memory photo table. Photo storage is
 * "configured" with throwaway keys only where an upload is presigned
 * (presigning is local; nothing is sent).
 *
 * The rules: a garage reaches only its own jobs (any other garage's is a
 * 404, by id or by header), and removes only its own photos; a customer
 * reaches only their own booking (anyone else's is a 404), records only
 * keys from their own folder of it, and removes only their own photos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { jobPhotosRepository } = await import('./job-photos.repository.js')
const { customerJobPhotosRoutes, jobPhotosRoutes } = await import('./job-photos.routes.js')

const GARAGE = 'e2e00000-0000-4000-8000-000000002510'
const OTHER_GARAGE = 'e2e00000-0000-4000-8000-000000002511'
const BOOKING = 'e2e00000-0000-4000-8000-000000002520'
const FILE = '0b4f6c1e-2d3a-4c5b-8e9f-0a1b2c3d4e5f'
const FILE_2 = '1c5a7d2f-3e4b-4d6c-9f0a-1b2c3d4e5f60'

const PEOPLE = {
  owner: 'e2e00000-0000-4000-8000-000000002501',
  operator: 'e2e00000-0000-4000-8000-000000002502',
  otherOwner: 'e2e00000-0000-4000-8000-000000002503',
  customer: 'e2e00000-0000-4000-8000-000000002504',
  otherCustomer: 'e2e00000-0000-4000-8000-000000002505',
}

const SEATS: Array<{ userId: string; vendorId: string; role: 'vendor_admin' | 'vendor_operator' }> = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' },
  { userId: PEOPLE.otherOwner, vendorId: OTHER_GARAGE, role: 'vendor_admin' },
]

const GARAGE_FOLDER = `vendors/${GARAGE}/job-photos/${BOOKING}`
const CUSTOMER_FOLDER = `${GARAGE_FOLDER}/customer`

// ─── Stand-ins for the database ──────────────────────────────────────────────

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

type Row = {
  id: string
  bookingId: string
  stage: 'before' | 'after'
  storageKey: string
  url: string
  uploadedBy: string | null
  uploadedByRole: 'garage' | 'customer'
  angle: string | null
  createdAt: Date
}

let rows: Row[] = []
let job: {
  id: string
  vendorId: string
  userId: string
  status: string
  acceptedAt: Date | null
  bookingType: string
  scheduledAt: Date
  completedAt: Date | null
  pickedUpAt: Date | null
  outForDeliveryAt: Date | null
  photosWaivedAt: Date | null
}

const STORAGE_KEYS = ['r2AccountId', 'r2AccessKeyId', 'r2SecretAccessKey', 'r2Bucket', 'r2PublicBaseUrl', 'r2Endpoint'] as const
const savedEnv = Object.fromEntries(STORAGE_KEYS.map((key) => [key, env[key]]))
const savedRequired = env.jobPhotosRequired
function storageOn(on: boolean) {
  const values = env as unknown as Record<string, string | undefined>
  values.r2AccountId = on ? 'test-account' : undefined
  values.r2AccessKeyId = on ? 'test-key' : undefined
  values.r2SecretAccessKey = on ? 'test-secret' : undefined
  values.r2Bucket = on ? 'detlio-test' : undefined
  // Always set: recording a photo builds its public URL from it. Without the
  // keys a delete's best-effort removal from storage just logs.
  values.r2PublicBaseUrl = 'https://photos.test'
  values.r2Endpoint = on ? 'http://localhost:9000' : undefined
}

beforeAll(() => {
  patch(membersRepository, 'listActiveVendorSeats', async (userId: string) =>
    SEATS.filter((seat) => seat.userId === userId)
  )
  patch(membersRepository, 'findActiveVendorSeat', async (vendorId: string, userId: string) =>
    SEATS.find((seat) => seat.vendorId === vendorId && seat.userId === userId)
  )
  patch(membersRepository, 'findActivePlatformRow', async () => undefined)
  patch(membersRepository, 'findVendorForSupport', async () => undefined)
  patch(membersRepository, 'logInternalAccess', async () => undefined)

  patch(jobPhotosRepository, 'findJob', async (id: string) => (id === BOOKING ? job : null))
  patch(jobPhotosRepository, 'listPhotos', async (id: string) => rows.filter((row) => row.bookingId === id))
  patch(jobPhotosRepository, 'countPhotos', async (id: string, stage: string, role: string) =>
    rows.filter((row) => row.bookingId === id && row.stage === stage && row.uploadedByRole === role).length
  )
  patch(jobPhotosRepository, 'findPhoto', async (id: string, photoId: string, role: string) =>
    rows.find((row) => row.bookingId === id && row.id === photoId && row.uploadedByRole === role)
  )
  patch(jobPhotosRepository, 'findPhotoByKey', async (id: string, key: string) =>
    rows.find((row) => row.bookingId === id && row.storageKey === key)
  )
  patch(
    jobPhotosRepository,
    'insertPhotoUnderCap',
    async (data: Omit<Row, 'id' | 'createdAt'>, max: number) => {
      const same = rows.filter(
        (row) => row.bookingId === data.bookingId && row.stage === data.stage && row.uploadedByRole === data.uploadedByRole
      )
      if (same.length >= max) return null
      const created = { ...data, id: crypto.randomUUID(), createdAt: new Date() }
      rows.push(created)
      return created
    }
  )
  patch(
    jobPhotosRepository,
    'deletePhoto',
    async (id: string, photoId: string, role: string, keepAtLeast: number | null) => {
      const photo = rows.find((row) => row.bookingId === id && row.id === photoId && row.uploadedByRole === role)
      if (!photo) return null
      const same = rows.filter((row) => row.bookingId === id && row.stage === photo.stage && row.uploadedByRole === role)
      if (keepAtLeast !== null && same.length - 1 < keepAtLeast) return 'floor'
      rows = rows.filter((row) => row !== photo)
      return photo
    }
  )
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(env as unknown as Record<string, unknown>, savedEnv)
  ;(env as unknown as Record<string, unknown>).jobPhotosRequired = savedRequired
})

beforeEach(() => {
  storageOn(false)
  ;(env as unknown as Record<string, unknown>).jobPhotosRequired = true
  rows = []
  job = {
    id: BOOKING,
    vendorId: GARAGE,
    userId: PEOPLE.customer,
    status: 'confirmed',
    acceptedAt: new Date(Date.now() - 60 * 60 * 1000),
    bookingType: 'dropin',
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    completedAt: null,
    pickedUpAt: null,
    outForDeliveryAt: null,
    photosWaivedAt: null,
  }
})

function seedPhoto(role: 'garage' | 'customer', stage: 'before' | 'after', file = crypto.randomUUID()): Row {
  const row: Row = {
    id: crypto.randomUUID(),
    bookingId: BOOKING,
    stage,
    storageKey: `${role === 'customer' ? CUSTOMER_FOLDER : GARAGE_FOLDER}/${file}.jpg`,
    url: `https://photos.test/${file}.jpg`,
    uploadedBy: role === 'customer' ? PEOPLE.customer : PEOPLE.owner,
    uploadedByRole: role,
    angle: null,
    createdAt: new Date(),
  }
  rows.push(row)
  return row
}

// ─── The app, answering the way app.ts does ──────────────────────────────────

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/vendors/me/bookings', jobPhotosRoutes)
app.route('/bookings', customerJobPhotosRoutes)

type Who = keyof typeof PEOPLE | null

async function cookieFor(who: Who): Promise<Record<string, string>> {
  if (who === null) return {}
  const isCustomer = who === 'customer' || who === 'otherCustomer'
  const token = await signAccessToken({
    sub: PEOPLE[who],
    aud: isCustomer ? 'customer' : 'vendor',
    isCustomer,
    isVendorOwner: !isCustomer,
  })
  return { Cookie: `access_token=${token}` }
}

async function call(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  who: Who,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const response = await app.request(path, {
    method,
    headers: {
      ...(await cookieFor(who)),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = (await response.json()) as { code?: string; message?: string; data?: unknown }
  return { status: response.status, body: json }
}

const GARAGE_PHOTOS = `/vendors/me/bookings/${BOOKING}/photos`
const CUSTOMER_PHOTOS = `/bookings/${BOOKING}/photos`

describe("the garage's side: its own jobs only", () => {
  test('the owner and an operator see every photo of the job, the customer’s too', async () => {
    seedPhoto('garage', 'before')
    seedPhoto('customer', 'before')
    for (const who of ['owner', 'operator'] as const) {
      const { status, body } = await call('GET', GARAGE_PHOTOS, who)
      expect(status).toBe(200)
      const photos = body.data as Array<{ by: string; storageKey?: string; uploadedBy?: string }>
      expect(photos.map((photo) => photo.by).sort()).toEqual(['customer', 'garage'])
      // Never the storage key or who exactly, on any photo.
      expect(photos.every((photo) => photo.storageKey === undefined && photo.uploadedBy === undefined)).toBe(true)
    }
  })

  test('the customer’s photos only once the garage has accepted the job', async () => {
    seedPhoto('customer', 'before')
    job = { ...job, status: 'pending', acceptedAt: null }
    expect((await call('GET', GARAGE_PHOTOS, 'owner')).body.data).toEqual([])
  })

  test('another garage gets a 404, by its own seat or by naming this garage', async () => {
    expect((await call('GET', GARAGE_PHOTOS, 'otherOwner')).body.code).toBe('BOOKING_NOT_FOUND')
    const asThisGarage = await call('GET', GARAGE_PHOTOS, 'otherOwner', undefined, { 'X-Vendor-Id': GARAGE })
    expect(asThisGarage.status).toBe(404)
    const record = await call('POST', GARAGE_PHOTOS, 'otherOwner', { stage: 'before', key: `${GARAGE_FOLDER}/${FILE}.jpg` })
    expect(record.status).toBe(404)
    expect(rows).toHaveLength(0)
  })

  test('a customer and nobody at all are refused', async () => {
    expect((await call('GET', GARAGE_PHOTOS, 'customer')).status).toBe(404)
    expect((await call('GET', GARAGE_PHOTOS, null)).status).toBe(401)
  })

  test('records its own upload with the angle, as the garage’s', async () => {
    const { status, body } = await call('POST', GARAGE_PHOTOS, 'operator', {
      stage: 'before',
      key: `${GARAGE_FOLDER}/${FILE}.jpg`,
      angle: 'front',
    })
    expect(status).toBe(201)
    expect(body.data).toMatchObject({ stage: 'before', angle: 'front', by: 'garage' })
    expect(rows[0]?.uploadedByRole).toBe('garage')
  })

  test("cannot record the customer's upload, or remove the customer's photo", async () => {
    const forged = await call('POST', GARAGE_PHOTOS, 'owner', { stage: 'before', key: `${CUSTOMER_FOLDER}/${FILE}.jpg` })
    expect(forged.status).toBe(400)
    expect(forged.body.code).toBe('INVALID_JOB_PHOTO_KEY')
    const theirs = seedPhoto('customer', 'before')
    const removed = await call('DELETE', `${GARAGE_PHOTOS}/${theirs.id}`, 'owner')
    expect(removed.status).toBe(404)
    expect(rows).toHaveLength(1)
  })

  test('an angle outside the guided five is refused', async () => {
    const { status } = await call('POST', GARAGE_PHOTOS, 'owner', {
      stage: 'before',
      key: `${GARAGE_FOLDER}/${FILE}.jpg`,
      angle: 'roof',
    })
    expect(status).toBe(400)
  })

  test('after photos: none before the work starts, none an hour after completion', async () => {
    const early = await call('POST', GARAGE_PHOTOS, 'owner', { stage: 'after', key: `${GARAGE_FOLDER}/${FILE}.jpg` })
    expect(early.body.code).toBe('JOB_PHOTO_STAGE_NOT_OPEN')

    job = { ...job, status: 'completed', completedAt: new Date(Date.now() - 61 * 60 * 1000) }
    const late = await call('POST', GARAGE_PHOTOS, 'owner', { stage: 'after', key: `${GARAGE_FOLDER}/${FILE}.jpg` })
    expect(late.status).toBe(400)
    expect(late.body.code).toBe('JOB_PHOTO_WINDOW_CLOSED')

    job = { ...job, completedAt: new Date(Date.now() - 30 * 60 * 1000) }
    const inTime = await call('POST', GARAGE_PHOTOS, 'owner', { stage: 'after', key: `${GARAGE_FOLDER}/${FILE_2}.jpg` })
    expect(inTime.status).toBe(201)
  })

  test('a started job keeps its 2 before photos; a third can go', async () => {
    const first = seedPhoto('garage', 'before')
    seedPhoto('garage', 'before')
    job = { ...job, status: 'in_progress' }
    const refused = await call('DELETE', `${GARAGE_PHOTOS}/${first.id}`, 'owner')
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('JOB_PHOTO_MINIMUM')

    seedPhoto('garage', 'before')
    expect((await call('DELETE', `${GARAGE_PHOTOS}/${first.id}`, 'owner')).status).toBe(200)
  })

  test('with the standard off, a started job’s photos can go', async () => {
    ;(env as unknown as Record<string, unknown>).jobPhotosRequired = false
    const first = seedPhoto('garage', 'before')
    job = { ...job, status: 'in_progress' }
    expect((await call('DELETE', `${GARAGE_PHOTOS}/${first.id}`, 'owner')).status).toBe(200)
  })

  test('the upload link lands in the garage’s folder of this job', async () => {
    storageOn(true)
    const { status, body } = await call('POST', `${GARAGE_PHOTOS}/upload-url`, 'owner', {
      stage: 'before',
      contentType: 'image/jpeg',
    })
    expect(status).toBe(200)
    const key = (body.data as { key: string }).key
    expect(key.startsWith(`${GARAGE_FOLDER}/`)).toBe(true)
    expect(key.startsWith(`${CUSTOMER_FOLDER}/`)).toBe(false)
  })
})

describe("the customer's side: their own booking only", () => {
  test('the customer adds a before photo of their car, from their own folder', async () => {
    const { status, body } = await call('POST', CUSTOMER_PHOTOS, 'customer', {
      stage: 'before',
      key: `${CUSTOMER_FOLDER}/${FILE}.jpg`,
      angle: 'left',
    })
    expect(status).toBe(201)
    expect(body.data).toMatchObject({ stage: 'before', angle: 'left', by: 'customer' })
    expect(rows[0]).toMatchObject({ uploadedByRole: 'customer', uploadedBy: PEOPLE.customer })
  })

  test('another customer, a garage seat and nobody get nothing', async () => {
    const key = `${CUSTOMER_FOLDER}/${FILE}.jpg`
    const other = await call('POST', CUSTOMER_PHOTOS, 'otherCustomer', { stage: 'before', key })
    expect(other.status).toBe(404)
    expect(other.body.code).toBe('BOOKING_NOT_FOUND')
    expect((await call('POST', CUSTOMER_PHOTOS, 'owner', { stage: 'before', key })).status).toBe(403)
    expect((await call('POST', CUSTOMER_PHOTOS, null, { stage: 'before', key })).status).toBe(401)
    storageOn(true)
    expect((await call('POST', `${CUSTOMER_PHOTOS}/upload-url`, 'otherCustomer', { stage: 'before', contentType: 'image/jpeg' })).status).toBe(404)
    expect(rows).toHaveLength(0)
  })

  test("cannot record the garage's upload, or remove the garage's photo", async () => {
    const forged = await call('POST', CUSTOMER_PHOTOS, 'customer', { stage: 'before', key: `${GARAGE_FOLDER}/${FILE}.jpg` })
    expect(forged.status).toBe(400)
    expect(forged.body.code).toBe('INVALID_JOB_PHOTO_KEY')
    const garages = seedPhoto('garage', 'before')
    expect((await call('DELETE', `${CUSTOMER_PHOTOS}/${garages.id}`, 'customer')).status).toBe(404)
    expect(rows).toHaveLength(1)
  })

  test('removes their own photo while the stage is open, and not another customer’s way', async () => {
    const mine = seedPhoto('customer', 'before')
    expect((await call('DELETE', `${CUSTOMER_PHOTOS}/${mine.id}`, 'otherCustomer')).status).toBe(404)
    expect((await call('DELETE', `${CUSTOMER_PHOTOS}/${mine.id}`, 'customer')).status).toBe(200)
    expect(rows).toHaveLength(0)
  })

  test('at most 4 before photos', async () => {
    for (let i = 0; i < 4; i++) seedPhoto('customer', 'before')
    const fifth = await call('POST', CUSTOMER_PHOTOS, 'customer', { stage: 'before', key: `${CUSTOMER_FOLDER}/${FILE}.jpg` })
    expect(fifth.status).toBe(409)
    expect(fifth.body.code).toBe('JOB_PHOTO_LIMIT_REACHED')
  })

  test('before photos close when the work starts; after photos open at completion for 24 hours', async () => {
    job = { ...job, status: 'in_progress' }
    const lateBefore = await call('POST', CUSTOMER_PHOTOS, 'customer', { stage: 'before', key: `${CUSTOMER_FOLDER}/${FILE}.jpg` })
    expect(lateBefore.status).toBe(400)
    expect(lateBefore.body.code).toBe('JOB_PHOTO_WINDOW_CLOSED')
    const earlyAfter = await call('POST', CUSTOMER_PHOTOS, 'customer', { stage: 'after', key: `${CUSTOMER_FOLDER}/${FILE}.jpg` })
    expect(earlyAfter.status).toBe(400)

    job = { ...job, status: 'completed', completedAt: new Date(Date.now() - 23 * 60 * 60 * 1000) }
    const after = await call('POST', CUSTOMER_PHOTOS, 'customer', { stage: 'after', key: `${CUSTOMER_FOLDER}/${FILE}.jpg` })
    expect(after.status).toBe(201)

    job = { ...job, completedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }
    const tooLate = await call('POST', CUSTOMER_PHOTOS, 'customer', { stage: 'after', key: `${CUSTOMER_FOLDER}/${FILE_2}.jpg` })
    expect(tooLate.status).toBe(400)
  })

  test('pickup & drop: before photos close once the car is collected', async () => {
    job = { ...job, bookingType: 'pickup', pickedUpAt: new Date() }
    const { status } = await call('POST', CUSTOMER_PHOTOS, 'customer', { stage: 'before', key: `${CUSTOMER_FOLDER}/${FILE}.jpg` })
    expect(status).toBe(400)
  })

  test('the upload link lands in the customer’s own folder', async () => {
    storageOn(true)
    const { status, body } = await call('POST', `${CUSTOMER_PHOTOS}/upload-url`, 'customer', {
      stage: 'before',
      contentType: 'image/jpeg',
    })
    expect(status).toBe(200)
    expect((body.data as { key: string }).key.startsWith(`${CUSTOMER_FOLDER}/`)).toBe(true)
  })
})
