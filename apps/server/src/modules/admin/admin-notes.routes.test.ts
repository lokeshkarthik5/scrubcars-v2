/**
 * Booking notes (0065) through the real admin routes and auth, with the
 * database stood in for: "Add note" writes a typed note with its session;
 * its author edits or deletes it for 24 hours; a note an action wrote, or
 * someone else's, never changes. The rule is lib/booking-notes.test.ts's;
 * the writes repeat it in their WHERE, which these stand-ins follow.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAdminToken } = await import('../../lib/jwt.js')
const { adminRepository } = await import('./admin.repository.js')
const { adminRoutes } = await import('./admin.routes.js')

const BOOKING = 'e2e00000-0000-4000-8000-000000005450'
const NOTE = 'e2e00000-0000-4000-8000-000000005451'
const HOUR = 60 * 60 * 1000

type Note = { id: string; bookingId: string; author: string; body: string; kind: 'typed' | 'system'; authorSub: string | null; editedAt: Date | null; createdAt: Date }
let notes: Note[] = []
let inserted: Array<Record<string, unknown>> = []

const originals: Array<[Record<string, unknown>, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Record<string, unknown>
  originals.push([object, key, object[key]])
  object[key] = value
}

beforeAll(() => {
  patch(adminRepository, 'findBookingById', async (id: string) => (id === BOOKING ? { id } : undefined))
  patch(adminRepository, 'createBookingNote', async (data: Record<string, unknown>) => {
    inserted.push(data)
    return [{ id: NOTE, editedAt: null, createdAt: new Date(), kind: 'system', authorSub: null, ...data }]
  })
  patch(adminRepository, 'findBookingNote', async (bookingId: string, noteId: string) =>
    notes.find((n) => n.id === noteId && n.bookingId === bookingId)
  )
  const qualifies = (n: Note | undefined, sub: string, since: Date) =>
    n && n.kind === 'typed' && n.authorSub === sub && n.createdAt > since
  patch(adminRepository, 'editTypedNote', async (input: { noteId: string; sub: string; body: string; at: Date; since: Date }) => {
    const n = notes.find((x) => x.id === input.noteId)
    if (!qualifies(n, input.sub, input.since)) return undefined
    Object.assign(n!, { body: input.body, editedAt: input.at })
    return n
  })
  patch(adminRepository, 'deleteTypedNote', async (input: { noteId: string; sub: string; since: Date }) => {
    const n = notes.find((x) => x.id === input.noteId)
    if (!qualifies(n, input.sub, input.since)) return undefined
    notes = notes.filter((x) => x !== n)
    return { id: n!.id, createdAt: n!.createdAt }
  })
})
afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})
beforeEach(() => {
  inserted = []
  notes = [{ id: NOTE, bookingId: BOOKING, author: 'admin', body: 'Called the customer', kind: 'typed', authorSub: 'admin', editedAt: null, createdAt: new Date(Date.now() - HOUR) }]
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/admin', adminRoutes)

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', Cookie: `access_token=${await signAdminToken()}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, body: (await res.json()) as { code?: string; data?: any } }
}

describe('booking notes (0065)', () => {
  test('Add note writes a typed note with its session', async () => {
    const res = await call('POST', `/admin/bookings/${BOOKING}/notes`, { body: 'Garage will call back' })
    expect(res.status).toBe(201)
    expect(inserted[0]).toMatchObject({ kind: 'typed', authorSub: 'admin', author: 'admin' })
    expect(res.body.data).toMatchObject({ kind: 'typed', authorSub: 'admin', editedAt: null })
    expect(typeof res.body.data.editableUntil).toBe('string')
  })

  test('its author edits it within 24 hours', async () => {
    const res = await call('PATCH', `/admin/bookings/${BOOKING}/notes/${NOTE}`, { body: 'Called the customer twice' })
    expect(res.status).toBe(200)
    expect(notes[0]!.body).toBe('Called the customer twice')
    expect(res.body.data.editedAt).not.toBeNull()
    expect((await call('PATCH', `/admin/bookings/${BOOKING}/notes/${NOTE}`, { body: '  ' })).status).toBe(400)
  })

  test('its author deletes it within 24 hours', async () => {
    const res = await call('DELETE', `/admin/bookings/${BOOKING}/notes/${NOTE}`)
    expect(res.status).toBe(200)
    expect(notes).toEqual([])
  })

  test('not after 24 hours, not someone else\'s, never a system note', async () => {
    notes[0]!.createdAt = new Date(Date.now() - 25 * HOUR)
    expect((await call('DELETE', `/admin/bookings/${BOOKING}/notes/${NOTE}`)).body.code).toBe('NOTE_LOCKED')
    notes[0]!.createdAt = new Date()
    notes[0]!.authorSub = 'admin:someone-else'
    expect((await call('PATCH', `/admin/bookings/${BOOKING}/notes/${NOTE}`, { body: 'x' })).body.code).toBe('NOTE_NOT_YOURS')
    notes[0]!.kind = 'system'
    notes[0]!.authorSub = null
    expect((await call('DELETE', `/admin/bookings/${BOOKING}/notes/${NOTE}`)).body.code).toBe('NOTE_SYSTEM')
    expect(notes).toHaveLength(1)
    expect((await call('DELETE', `/admin/bookings/${BOOKING}/notes/e2e00000-0000-4000-8000-000000005459`)).status).toBe(404)
  })
})

describe('undoing the photo waiver (0065)', () => {
  let booking: { id: string; status: string; photosWaivedAt: Date | null }
  let claim = false
  let undone: string[] = []
  beforeAll(() => {
    patch(adminRepository, 'findBookingById', async (id: string) => (id === BOOKING ? booking : undefined))
    patch(adminRepository, 'hasGuaranteeClaim', async () => claim)
    patch(adminRepository, 'undoJobPhotosWaiver', async (id: string) => {
      undone.push(id)
      return []
    })
  })
  beforeEach(() => {
    booking = { id: BOOKING, status: 'confirmed', photosWaivedAt: new Date() }
    claim = false
    undone = []
  })

  test('refused once the job is over, with a redo claim, or with nothing waived', async () => {
    booking.status = 'completed'
    expect((await call('POST', `/admin/bookings/${BOOKING}/photos-waiver/undo`, {})).body.code).toBe('WAIVER_JOB_OVER')
    booking.status = 'in_progress'
    claim = true
    expect((await call('POST', `/admin/bookings/${BOOKING}/photos-waiver/undo`, {})).body.code).toBe('WAIVER_HAS_CLAIM')
    claim = false
    booking.photosWaivedAt = null
    expect((await call('POST', `/admin/bookings/${BOOKING}/photos-waiver/undo`, {})).body.code).toBe('PHOTOS_NOT_WAIVED')
    expect(undone).toEqual([])
  })

  test('the write repeats the conditions: a booking that moved meanwhile is a 409', async () => {
    const res = await call('POST', `/admin/bookings/${BOOKING}/photos-waiver/undo`, {})
    expect(undone).toEqual([BOOKING])
    expect([res.status, res.body.code]).toEqual([409, 'BOOKING_STATE_CHANGED'])
  })
})
