/**
 * The car condition check (0075) through the real routes and the real auth
 * and tenant middleware. Only the database is stood in for: the seat
 * lookups and the check's reads and writes are replaced on their objects
 * with small in-memory tables, and put back afterwards. The AI reader is a
 * fake that records what it was sent.
 *
 * The rules: every route is a 404 while the check is off for the garage, for
 * another garage's job and for another customer's booking; Detlio reads each
 * photo once and a failure leaves it without marks; marks change until the
 * check is sent; a pickup job's check needs all eight angles; the customer
 * answers once; after the job a possible new mark can be answered by both.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { AiUnavailableError } = await import('../../lib/ai.js')
const { signAccessToken } = await import('../../lib/jwt.js')
const { CAR_CHECK_ANGLES } = await import('../../lib/condition-check.js')
const { membersRepository } = await import('../members/members.repository.js')
const { conditionCheckRepository } = await import('./condition-check.repository.js')
const { setConditionClientsForTests } = await import('./condition-check.service.js')
const { conditionCheckRoutes, customerConditionCheckRoutes } = await import('./condition-check.routes.js')

const GARAGE = 'e2e00000-0000-4000-8000-000000002610'
const OTHER_GARAGE = 'e2e00000-0000-4000-8000-000000002611'
const BOOKING = 'e2e00000-0000-4000-8000-000000002620'

const PEOPLE = {
  owner: 'e2e00000-0000-4000-8000-000000002601',
  operator: 'e2e00000-0000-4000-8000-000000002602',
  otherOwner: 'e2e00000-0000-4000-8000-000000002603',
  customer: 'e2e00000-0000-4000-8000-000000002604',
  otherCustomer: 'e2e00000-0000-4000-8000-000000002605',
}

const SEATS: Array<{ userId: string; vendorId: string; role: 'vendor_admin' | 'vendor_operator' }> = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' },
  { userId: PEOPLE.otherOwner, vendorId: OTHER_GARAGE, role: 'vendor_admin' },
]

// ─── Stand-ins for the database ──────────────────────────────────────────────

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

type PhotoRow = {
  id: string
  stage: 'before' | 'after'
  angle: string | null
  uploadedByRole: 'garage' | 'customer'
  url: string
  storageKey: string
  conditionRead: 'done' | 'failed' | null
  createdAt: Date
}
type MarkRow = {
  id: string
  bookingId: string
  photoId: string
  comparedPhotoId: string | null
  stage: 'before' | 'after'
  kind: string
  part: string
  boxX: number | null
  boxY: number | null
  boxW: number | null
  boxH: number | null
  source: 'ai' | 'garage'
  unsure: boolean
  removedAt: Date | null
  garageAnswer: 'was_there' | null
  garageAnsweredAt: Date | null
  customerAnswer: 'already_there' | null
  customerAnsweredAt: Date | null
  createdAt: Date
}
type CheckRow = {
  bookingId: string
  sentAt: Date
  sentBy: string | null
  customerAnswer: 'looks_right' | 'something_wrong' | null
  customerAnsweredAt: Date | null
  customerAnsweredBy: string | null
  customerNote: string | null
  createdAt: Date
}

let job: { id: string; vendorId: string; userId: string; status: string; bookingType: string; photosWaivedAt: Date | null }
let photos: PhotoRow[] = []
let marks: MarkRow[] = []
let check: CheckRow | null = null
let clock = 0
const tick = () => new Date(Date.UTC(2026, 10, 15, 4, 0, clock++))

function addPhoto(stage: 'before' | 'after', angle: string | null, role: 'garage' | 'customer' = 'garage') {
  const id = crypto.randomUUID()
  photos.push({
    id,
    stage,
    angle,
    uploadedByRole: role,
    url: `vendors/${GARAGE}/job-photos/${BOOKING}/${id}.jpg`,
    storageKey: `vendors/${GARAGE}/job-photos/${BOOKING}/${id}.jpg`,
    conditionRead: null,
    createdAt: tick(),
  })
  return id
}

function walkRound(stage: 'before' | 'after', count = 8) {
  return CAR_CHECK_ANGLES.slice(0, count).map((angle) => addPhoto(stage, angle))
}

// The fake reader: what it was asked, and what it answers.
const asked: Array<{ instructions: string; prompt?: string; files: unknown[] }> = []
let answer: string | Error = JSON.stringify({
  marks: [{ kind: 'scratch', part: 'Rear left door', box: { x: 0.5, y: 0.4, w: 0.1, h: 0.1 }, sure: true }],
})
const fakeClient = {
  read: async (request: { instructions: string; prompt?: string; files: unknown[] }) => {
    asked.push(request)
    if (answer instanceof Error) throw answer
    return answer
  },
}

const ENV_KEYS = ['conditionCheckEnabled', 'conditionCheckGarages', 'aiFake', 'openaiApiKey'] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, env[key]]))
const values = env as unknown as Record<string, unknown>

beforeAll(() => {
  patch(membersRepository, 'listActiveVendorSeats', async (userId: string) => SEATS.filter((seat) => seat.userId === userId))
  patch(membersRepository, 'findActiveVendorSeat', async (vendorId: string, userId: string) =>
    SEATS.find((seat) => seat.vendorId === vendorId && seat.userId === userId)
  )
  patch(membersRepository, 'findActivePlatformRow', async () => undefined)
  patch(membersRepository, 'findVendorForSupport', async () => undefined)
  patch(membersRepository, 'logInternalAccess', async () => undefined)

  const repo = conditionCheckRepository as unknown as Patchable
  patch(repo, 'findJob', async (id: string) => (id === BOOKING ? job : null))
  patch(repo, 'listPhotos', async () => photos.map((p) => ({ ...p })))
  patch(repo, 'findCheck', async () => (check ? { ...check } : null))
  patch(repo, 'listMarks', async () => marks.map((m) => ({ ...m })))
  patch(repo, 'findMark', async (_b: string, id: string) => marks.find((m) => m.id === id) ?? null)
  patch(
    repo,
    'saveReading',
    async (input: { photoId: string; stage: 'before' | 'after'; comparedPhotoId: string | null; marks: Array<{ kind: string; part: string; box: { x: number; y: number; w: number; h: number } | null; unsure: boolean }> }) => {
      const photo = photos.find((p) => p.id === input.photoId)
      if (!photo || photo.conditionRead !== null || (input.stage === 'before' && check)) return false
      photo.conditionRead = 'done'
      for (const m of input.marks) {
        marks.push({
          id: crypto.randomUUID(),
          bookingId: BOOKING,
          photoId: input.photoId,
          comparedPhotoId: input.comparedPhotoId,
          stage: input.stage,
          kind: m.kind,
          part: m.part,
          boxX: m.box?.x ?? null,
          boxY: m.box?.y ?? null,
          boxW: m.box?.w ?? null,
          boxH: m.box?.h ?? null,
          source: 'ai',
          unsure: m.unsure,
          removedAt: null,
          garageAnswer: null,
          garageAnsweredAt: null,
          customerAnswer: null,
          customerAnsweredAt: null,
          createdAt: tick(),
        })
      }
      return true
    }
  )
  patch(repo, 'markReadFailed', async (_b: string, photoId: string) => {
    const photo = photos.find((p) => p.id === photoId)
    if (photo && photo.conditionRead === null) photo.conditionRead = 'failed'
  })
  patch(repo, 'insertGarageMark', async (input: { photoId: string; kind: string; part: string }) => {
    if (check) return null
    const row: MarkRow = {
      id: crypto.randomUUID(),
      bookingId: BOOKING,
      photoId: input.photoId,
      comparedPhotoId: null,
      stage: 'before',
      kind: input.kind,
      part: input.part,
      boxX: null,
      boxY: null,
      boxW: null,
      boxH: null,
      source: 'garage',
      unsure: false,
      removedAt: null,
      garageAnswer: null,
      garageAnsweredAt: null,
      customerAnswer: null,
      customerAnsweredAt: null,
      createdAt: tick(),
    }
    marks.push(row)
    return row
  })
  patch(repo, 'setRemoved', async (_b: string, id: string, removedAt: Date | null) => {
    const m = marks.find((row) => row.id === id && row.stage === 'before')
    if (!m || check) return null
    m.removedAt = removedAt
    return m
  })
  patch(repo, 'send', async (_b: string, sentBy: string, at: Date, enough: (rows: PhotoRow[]) => boolean) => {
    if (!enough(photos)) return 'short'
    if (check) return null
    check = { bookingId: BOOKING, sentAt: at, sentBy, customerAnswer: null, customerAnsweredAt: null, customerAnsweredBy: null, customerNote: null, createdAt: at }
    return check
  })
  patch(repo, 'answer', async (input: { userId: string; answer: 'looks_right' | 'something_wrong'; note: string | null; at: Date }) => {
    if (!check || check.customerAnswer) return null
    check.customerAnswer = input.answer
    check.customerAnsweredAt = input.at
    check.customerAnsweredBy = input.userId
    check.customerNote = input.note
    return check
  })
  patch(repo, 'garageWasThere', async (_b: string, id: string, at: Date) => {
    const m = marks.find((row) => row.id === id && row.stage === 'after' && !row.garageAnswer)
    if (!m) return null
    m.garageAnswer = 'was_there'
    m.garageAnsweredAt = at
    return m
  })
  patch(repo, 'customerAlreadyThere', async (_b: string, id: string, at: Date) => {
    const m = marks.find((row) => row.id === id && row.stage === 'after' && !row.customerAnswer)
    if (!m) return null
    m.customerAnswer = 'already_there'
    m.customerAnsweredAt = at
    return m
  })
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(values, savedEnv)
  setConditionClientsForTests(undefined, undefined)
})

beforeEach(() => {
  job = { id: BOOKING, vendorId: GARAGE, userId: PEOPLE.customer, status: 'confirmed', bookingType: 'pickup', photosWaivedAt: null }
  photos = []
  marks = []
  check = null
  asked.length = 0
  answer = JSON.stringify({
    marks: [{ kind: 'scratch', part: 'Rear left door', box: { x: 0.5, y: 0.4, w: 0.1, h: 0.1 }, sure: true }],
  })
  values.conditionCheckEnabled = false
  values.conditionCheckGarages = new Set([GARAGE])
  // aiFake on: the service sends the fake no files, so no storage is needed.
  values.aiFake = true
  values.openaiApiKey = undefined
  setConditionClientsForTests(fakeClient as never, fakeClient as never)
})

// ─── The app ─────────────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono()
  app.route('/vendors/me/bookings', conditionCheckRoutes)
  app.route('/bookings', customerConditionCheckRoutes)
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    }
    throw err
  })
  return app
}

async function call(path: string, who: string, body?: unknown, vendorId: string | null = GARAGE) {
  const customer = who === PEOPLE.customer || who === PEOPLE.otherCustomer
  const token = await signAccessToken({
    sub: who,
    aud: customer ? 'customer' : 'vendor',
    isCustomer: customer,
    isVendorOwner: !customer,
  })
  const res = await makeApp().request(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(vendorId && !customer ? { 'X-Vendor-Id': vendorId } : {}),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
  return { status: res.status, json: (await res.json()) as { data?: any; code?: string; message?: string } }
}

const garagePath = (rest: string) => `/vendors/me/bookings/${BOOKING}/condition${rest}`
const customerPath = (rest: string) => `/bookings/${BOOKING}/condition${rest}`

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('who reaches the check', () => {
  test('a 404 while the check is off for the garage', async () => {
    values.conditionCheckGarages = new Set()
    const [photoId] = walkRound('before', 1)
    expect((await call(garagePath(`/photos/${photoId}/read`), PEOPLE.owner)).status).toBe(404)
    expect((await call(garagePath('/send'), PEOPLE.owner)).status).toBe(404)
    expect((await call(customerPath('/answer'), PEOPLE.customer, { answer: 'looks_right' })).status).toBe(404)
  })

  test('on for everyone with CONDITION_CHECK_ENABLED=on', async () => {
    values.conditionCheckGarages = new Set()
    values.conditionCheckEnabled = true
    walkRound('before')
    expect((await call(garagePath('/send'), PEOPLE.operator)).status).toBe(200)
  })

  test("another garage's job and another customer's booking are 404s", async () => {
    walkRound('before')
    expect((await call(garagePath('/send'), PEOPLE.otherOwner, undefined, OTHER_GARAGE)).status).toBe(404)
    check = { bookingId: BOOKING, sentAt: tick(), sentBy: PEOPLE.owner, customerAnswer: null, customerAnsweredAt: null, customerAnsweredBy: null, customerNote: null, createdAt: tick() }
    expect((await call(customerPath('/answer'), PEOPLE.otherCustomer, { answer: 'looks_right' })).status).toBe(404)
  })
})

describe("Detlio's look at a photo", () => {
  test('marks a before photo once, sending only the photo and fixed words', async () => {
    const [front] = walkRound('before', 1)
    const first = await call(garagePath(`/photos/${front}/read`), PEOPLE.operator)
    expect(first.status).toBe(200)
    expect(first.json.data.marks).toHaveLength(1)
    expect(first.json.data.marks[0]).toMatchObject({ label: 'Scratch – rear left door', source: 'ai', removed: false })
    expect(first.json.data.unread).toEqual([])
    // Asked again: nothing new is asked or written.
    await call(garagePath(`/photos/${front}/read`), PEOPLE.operator)
    expect(asked).toHaveLength(1)
    const sent = JSON.stringify(asked[0])
    for (const secret of [BOOKING, GARAGE, PEOPLE.customer, 'Karthik', 'TN']) expect(sent).not.toContain(secret)
  })

  test('a failure leaves the photo without marks, and the check can still be sent', async () => {
    answer = new AiUnavailableError('timeout')
    const ids = walkRound('before')
    const read = await call(garagePath(`/photos/${ids[0]}/read`), PEOPLE.owner)
    expect(read.status).toBe(200)
    expect(read.json.data.marks).toEqual([])
    expect(photos[0].conditionRead).toBe('failed')
    expect((await call(garagePath('/send'), PEOPLE.owner)).status).toBe(200)
  })

  test('an answer that is not one is a failure too', async () => {
    answer = 'not json'
    const [front] = walkRound('before', 1)
    await call(garagePath(`/photos/${front}/read`), PEOPLE.owner)
    expect(photos[0].conditionRead).toBe('failed')
  })

  test('with AI off nothing is asked and nothing waits', async () => {
    values.aiFake = false
    setConditionClientsForTests(null, null)
    const [front] = walkRound('before', 1)
    const read = await call(garagePath(`/photos/${front}/read`), PEOPLE.owner)
    expect(read.json.data.ai).toBe(false)
    expect(read.json.data.unread).toEqual([])
    expect(asked).toHaveLength(0)
  })

  test("a customer's photo and an unknown photo are not found", async () => {
    const theirs = addPhoto('before', 'front', 'customer')
    expect((await call(garagePath(`/photos/${theirs}/read`), PEOPLE.owner)).status).toBe(404)
    expect((await call(garagePath(`/photos/${crypto.randomUUID()}/read`), PEOPLE.owner)).status).toBe(404)
  })

  test('an after photo is compared with the before photo of its angle', async () => {
    walkRound('before')
    check = { bookingId: BOOKING, sentAt: tick(), sentBy: PEOPLE.owner, customerAnswer: null, customerAnsweredAt: null, customerAnsweredBy: null, customerNote: null, createdAt: tick() }
    job.status = 'in_progress'
    answer = JSON.stringify({ marks: [{ kind: 'dent', part: 'rear bumper', box: { x: 0.6, y: 0.5, w: 0.1, h: 0.1 }, sure: true }] })
    const after = addPhoto('after', 'back')
    const read = await call(garagePath(`/photos/${after}/read`), PEOPLE.owner)
    const newMark = read.json.data.marks.find((m: { stage: string }) => m.stage === 'after')
    expect(newMark).toMatchObject({ label: 'Dent – rear bumper', photoId: after })
    expect(newMark.beforePhotoId).toBe(photos.find((p) => p.stage === 'before' && p.angle === 'back')!.id)
    expect(asked[0].prompt).toContain('first photo is before')
  })

  test('an after photo with no before photo of its angle is read with no marks', async () => {
    job.status = 'in_progress'
    const after = addPhoto('after', 'front_left')
    await call(garagePath(`/photos/${after}/read`), PEOPLE.owner)
    expect(asked).toHaveLength(0)
    expect(photos[0].conditionRead).toBe('done')
  })
})

describe('the garage checks the marks', () => {
  test('remove a wrong mark, Undo, add one Detlio missed', async () => {
    const [front] = walkRound('before', 1)
    const read = await call(garagePath(`/photos/${front}/read`), PEOPLE.owner)
    const markId = read.json.data.marks[0].id
    expect((await call(garagePath(`/marks/${markId}/remove`), PEOPLE.owner)).json.data.marks[0].removed).toBe(true)
    expect((await call(garagePath(`/marks/${markId}/restore`), PEOPLE.owner)).json.data.marks[0].removed).toBe(false)
    const added = await call(garagePath('/marks'), PEOPLE.operator, { photoId: front, kind: 'dent', part: 'Bonnet 123' })
    expect(added.status).toBe(201)
    expect(added.json.data.marks.at(-1)).toMatchObject({ label: 'Dent – bonnet', source: 'garage', box: null })
  })

  test('a mark needs a walk-round photo and words', async () => {
    const extra = addPhoto('before', null)
    expect((await call(garagePath('/marks'), PEOPLE.owner, { photoId: extra, kind: 'dent', part: 'bonnet' })).status).toBe(404)
    const [front] = walkRound('before', 1)
    expect((await call(garagePath('/marks'), PEOPLE.owner, { photoId: front, kind: 'dent', part: '1234' })).json.code).toBe('INVALID_MARK_PART')
    expect((await call(garagePath('/marks'), PEOPLE.owner, { photoId: front, kind: 'smudge', part: 'x' })).status).toBe(400)
  })

  test('a pickup job sends all eight angles; at the garage any number', async () => {
    walkRound('before', 7)
    const short = await call(garagePath('/send'), PEOPLE.owner)
    expect(short.status).toBe(400)
    expect(short.json.code).toBe('CONDITION_CHECK_NOT_READY')
    job.bookingType = 'dropin'
    expect((await call(garagePath('/send'), PEOPLE.owner)).status).toBe(200)
  })

  test('sent, the marks stay as they are, and it is sent once', async () => {
    const [front] = walkRound('before')
    const read = await call(garagePath(`/photos/${front}/read`), PEOPLE.owner)
    const sent = await call(garagePath('/send'), PEOPLE.owner)
    expect(sent.json.data.sentAt).not.toBeNull()
    expect(sent.json.data.gate).toBeNull()
    expect(check?.sentBy).toBe(PEOPLE.owner)
    const markId = read.json.data.marks[0].id
    expect((await call(garagePath(`/marks/${markId}/remove`), PEOPLE.owner)).status).toBe(409)
    expect((await call(garagePath('/marks'), PEOPLE.owner, { photoId: front, kind: 'dent', part: 'bonnet' })).status).toBe(409)
    expect((await call(garagePath('/send'), PEOPLE.owner)).json.code).toBe('CONDITION_CHECK_SENT')
  })

  test('not on a job that is over', async () => {
    walkRound('before')
    job.status = 'completed'
    expect((await call(garagePath('/send'), PEOPLE.owner)).status).toBe(400)
  })
})

describe('the customer answers', () => {
  function sent() {
    walkRound('before')
    check = { bookingId: BOOKING, sentAt: tick(), sentBy: PEOPLE.owner, customerAnswer: null, customerAnsweredAt: null, customerAnsweredBy: null, customerNote: null, createdAt: tick() }
  }

  test('not before it is sent', async () => {
    expect((await call(customerPath('/answer'), PEOPLE.customer, { answer: 'looks_right' })).json.code).toBe('CONDITION_CHECK_NOT_SENT')
  })

  test('"Looks right", recorded with who and when, once', async () => {
    sent()
    const ok = await call(customerPath('/answer'), PEOPLE.customer, { answer: 'looks_right' })
    expect(ok.status).toBe(200)
    expect(ok.json.data.answer.kind).toBe('looks_right')
    expect(ok.json.data.photos).toHaveLength(8)
    expect(check?.customerAnsweredBy).toBe(PEOPLE.customer)
    expect((await call(customerPath('/answer'), PEOPLE.customer, { answer: 'looks_right' })).status).toBe(409)
  })

  test('"Something\'s wrong" needs a note, which the garage then reads', async () => {
    sent()
    expect((await call(customerPath('/answer'), PEOPLE.customer, { answer: 'something_wrong' })).status).toBe(400)
    expect((await call(customerPath('/answer'), PEOPLE.customer, { answer: 'something_wrong', note: '   ' })).status).toBe(400)
    expect((await call(customerPath('/answer'), PEOPLE.customer, { answer: 'looks_right', note: 'x' })).status).toBe(400)
    const wrong = await call(customerPath('/answer'), PEOPLE.customer, { answer: 'something_wrong', note: 'The dent on the bonnet was not there' })
    expect(wrong.status).toBe(200)
    const garage = await call(garagePath(`/photos/${photos[0].id}/read`), PEOPLE.owner)
    expect(garage.json.data.answer).toMatchObject({ kind: 'something_wrong', note: 'The dent on the bonnet was not there' })
  })
})

describe('a possible new mark after the job', () => {
  async function withNewMark() {
    walkRound('before')
    check = { bookingId: BOOKING, sentAt: tick(), sentBy: PEOPLE.owner, customerAnswer: null, customerAnsweredAt: null, customerAnsweredBy: null, customerNote: null, createdAt: tick() }
    job.status = 'in_progress'
    answer = JSON.stringify({ marks: [{ kind: 'dent', part: 'rear bumper', box: { x: 0.6, y: 0.5, w: 0.1, h: 0.1 }, sure: true }] })
    const after = addPhoto('after', 'back')
    const read = await call(garagePath(`/photos/${after}/read`), PEOPLE.owner)
    return read.json.data.marks.find((m: { stage: string }) => m.stage === 'after').id as string
  }

  test('the garage says "It was there" (a warning, never a block)', async () => {
    const markId = await withNewMark()
    const answered = await call(garagePath(`/marks/${markId}/was-there`), PEOPLE.operator)
    expect(answered.json.data.marks.find((m: { id: string }) => m.id === markId).garageAnswer).toBe('was_there')
  })

  test('the customer sees it once the job is done, and can say it was already there', async () => {
    const markId = await withNewMark()
    expect((await call(customerPath(`/marks/${markId}/already-there`), PEOPLE.customer)).status).toBe(404)
    job.status = 'completed'
    const answered = await call(customerPath(`/marks/${markId}/already-there`), PEOPLE.customer)
    expect(answered.status).toBe(200)
    expect(answered.json.data.marks.find((m: { id: string }) => m.id === markId).customerAnswer).toBe('already_there')
    expect((await call(customerPath(`/marks/${markId}/already-there`), PEOPLE.otherCustomer)).status).toBe(404)
  })
})
