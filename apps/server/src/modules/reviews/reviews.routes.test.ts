/**
 * Ratings (0065) through the real routes and auth, with the database stood
 * in for: reporting a review (anyone signed in, once, never one's own), the
 * garage's one reply editable for 24 hours (owner seat only, never a support
 * session), the public summary's new-garage rule, admin's Hide and Show
 * again, and the tags a review may carry. The counted-review SQL itself is
 * reviews.predicates.test.ts's; the rules are lib/ratings.test.ts's.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { reviewsRepository } = await import('./reviews.repository.js')
const { adminReviewRoutes, garageReviewRoutes, reviewsRoutes } =
  await import('./reviews.routes.js')

const id = (n: number) =>
  `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PEOPLE = {
  customer: id(5401),
  other: id(5402),
  owner: id(5403),
  operator: id(5404),
  superAdmin: id(5405),
}
const GARAGE = id(5410)
const REVIEW = id(5420)
const TEST_REVIEW = id(5421)
const HIDDEN_REVIEW = id(5422)
const HOUR = 60 * 60 * 1000

const SEATS = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' as const },
  {
    userId: PEOPLE.operator,
    vendorId: GARAGE,
    role: 'vendor_operator' as const,
  },
]

type Row = {
  id: string
  vendorId: string
  userId: string
  rating: number
  comment: string | null
  reply: string | null
  repliedAt: Date | null
  replyUpdatedAt: Date | null
  hiddenAt: Date | null
  markedTest: boolean
}
let rows: Record<string, Row> = {}
let reports: Array<{
  reviewId: string
  reporter: string
  userId: string
  vendorId: string | null
  reason: string
}> = []
let garageInBin = false
let audit: string[] = []

function seed() {
  const base = {
    vendorId: GARAGE,
    userId: PEOPLE.customer,
    comment: 'Seats were damp.',
    reply: null,
    repliedAt: null,
    replyUpdatedAt: null,
    hiddenAt: null,
    markedTest: false,
  }
  rows = {
    [REVIEW]: { ...base, id: REVIEW, rating: 2 },
    [TEST_REVIEW]: { ...base, id: TEST_REVIEW, rating: 5, markedTest: true },
    [HIDDEN_REVIEW]: {
      ...base,
      id: HIDDEN_REVIEW,
      rating: 1,
      hiddenAt: new Date(Date.now() - HOUR),
    },
  }
  reports = []
  garageInBin = false
  audit = []
}

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

beforeAll(() => {
  patch(membersRepository, 'listActiveVendorSeats', async (userId: string) =>
    SEATS.filter((seat) => seat.userId === userId)
  )
  patch(
    membersRepository,
    'findActiveVendorSeat',
    async (vendorId: string, userId: string) =>
      SEATS.find((seat) => seat.vendorId === vendorId && seat.userId === userId)
  )
  patch(membersRepository, 'findActivePlatformRow', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { role: 'super_admin' } : undefined
  )
  patch(membersRepository, 'findUserById', async (userId: string) =>
    userId === PEOPLE.superAdmin
      ? { id: userId, name: 'Signed-in Sam', phone: '9000009999' }
      : undefined
  )
  patch(membersRepository, 'findVendorForSupport', async (vendorId: string) =>
    vendorId === GARAGE ? { id: vendorId } : undefined
  )
  patch(membersRepository, 'logInternalAccess', async () => undefined)

  patch(reviewsRepository, 'findVendorById', async (vendorId: string) =>
    vendorId === GARAGE
      ? {
          id: GARAGE,
          deletedAt: garageInBin ? new Date() : null,
          purgedAt: null,
        }
      : undefined
  )
  patch(reviewsRepository, 'ratingAggregates', async () => [
    { vendorId: GARAGE, average: 5, count: 2 },
  ])
  patch(reviewsRepository, 'tagCounts', async () => [
    { vendorId: GARAGE, tag: 'on_time', count: 6 },
    { vendorId: GARAGE, tag: 'late', count: 1 },
  ])
  patch(reviewsRepository, 'starCounts', async () => [{ stars: 5, count: 2 }])
  patch(reviewsRepository, 'findForReport', async (reviewId: string) => {
    const row = rows[reviewId]
    return row ? { ...row, garage: 'Genoraj Car Care' } : undefined
  })
  patch(
    reviewsRepository,
    'insertReport',
    async (values: (typeof reports)[number]) => {
      const dup = reports.find(
        (r) =>
          r.reviewId === values.reviewId &&
          (values.reporter === 'garage'
            ? r.vendorId === values.vendorId
            : r.userId === values.userId)
      )
      if (dup) return undefined
      reports.push(values)
      return { id: id(5490 + reports.length) }
    }
  )
  patch(
    reviewsRepository,
    'findForGarage',
    async (vendorId: string, reviewId: string) => {
      const row = rows[reviewId]
      return row && row.vendorId === vendorId ? row : undefined
    }
  )
  patch(
    reviewsRepository,
    'setReply',
    async (input: {
      reviewId: string
      text: string
      seenRepliedAt: Date | null
      at: Date
    }) => {
      const row = rows[input.reviewId]!
      if (
        (row.repliedAt?.getTime() ?? null) !==
          (input.seenRepliedAt?.getTime() ?? null) ||
        row.hiddenAt
      )
        return undefined
      if (row.repliedAt)
        Object.assign(row, { reply: input.text, replyUpdatedAt: input.at })
      else Object.assign(row, { reply: input.text, repliedAt: input.at })
      return row
    }
  )
  patch(reviewsRepository, 'findForAdmin', async (reviewId: string) => {
    const row = rows[reviewId]
    return row
      ? {
          id: row.id,
          vendorId: row.vendorId,
          hiddenAt: row.hiddenAt,
          vendorDeletedAt: garageInBin ? new Date() : null,
        }
      : undefined
  })
  patch(
    reviewsRepository,
    'hide',
    async (reviewId: string, actor: { name: string }) => {
      const row = rows[reviewId]!
      if (row.hiddenAt) return undefined
      row.hiddenAt = new Date()
      audit.push(`review_hidden by ${actor.name}`)
      return { id: reviewId, vendorId: row.vendorId, rating: row.rating }
    }
  )
  patch(
    reviewsRepository,
    'show',
    async (reviewId: string, actor: { name: string }) => {
      const row = rows[reviewId]!
      if (!row.hiddenAt) return undefined
      row.hiddenAt = null
      audit.push(`review_shown by ${actor.name}`)
      return { id: reviewId, vendorId: row.vendorId }
    }
  )
  patch(reviewsRepository, 'findBookingById', async () => undefined)
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

beforeEach(seed)

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json(
        { success: false, message: err.message, code: err.code },
        err.statusCode as 400
      )
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/reviews', reviewsRoutes)
app.route('/vendors/me/reviews', garageReviewRoutes)
app.route('/admin', adminReviewRoutes)

type Who = keyof typeof PEOPLE | 'breakGlass' | null

async function cookieFor(who: Who): Promise<Record<string, string>> {
  if (who === null) return {}
  const customer = who === 'customer' || who === 'other'
  const token =
    who === 'breakGlass'
      ? await signAdminToken()
      : await signAccessToken({
          sub: PEOPLE[who],
          aud: customer ? 'customer' : 'vendor',
          isCustomer: customer,
          isVendorOwner: !customer,
        })
  return { Cookie: `access_token=${token}` }
}

async function call(
  method: string,
  path: string,
  who: Who,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const response = await app.request(path, {
    method,
    headers: {
      ...(await cookieFor(who)),
      'content-type': 'application/json',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = (await response.json()) as { code?: string; data?: any }
  return { status: response.status, body: json }
}

describe('the public summary', () => {
  test('two counted 5-star reviews: no score, new on Detlio; known for its top good tag', async () => {
    const res = await call('GET', `/reviews/vendors/${GARAGE}/summary`, null)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      rating: null,
      reviewCount: 2,
      isNew: true,
      knownFor: { tag: 'on_time', label: 'On time' },
      stars: [
        { stars: 5, count: 2 },
        { stars: 4, count: 0 },
        { stars: 3, count: 0 },
        { stars: 2, count: 0 },
        { stars: 1, count: 0 },
      ],
    })
    expect(res.body.data.tags.map((t: { tag: string }) => t.tag)).toEqual([
      'on_time',
      'late',
    ])
  })

  test('a garage in the Bin has no summary', async () => {
    garageInBin = true
    expect(
      (await call('GET', `/reviews/vendors/${GARAGE}/summary`, null)).status
    ).toBe(404)
  })
})

describe('reporting a review', () => {
  test('anyone signed in, once, with a reason', async () => {
    expect(
      (
        await call('POST', `/reviews/${REVIEW}/report`, null, {
          reason: 'Fake',
        })
      ).status
    ).toBe(401)
    expect(
      (
        await call('POST', `/reviews/${REVIEW}/report`, 'other', {
          reason: 'x',
        })
      ).status
    ).toBe(400)
    const first = await call('POST', `/reviews/${REVIEW}/report`, 'other', {
      reason: 'Not a real customer',
    })
    expect(first.status).toBe(201)
    expect(reports).toEqual([
      {
        reviewId: REVIEW,
        reporter: 'customer',
        userId: PEOPLE.other,
        vendorId: null,
        reason: 'Not a real customer',
      },
    ])
    const again = await call('POST', `/reviews/${REVIEW}/report`, 'other', {
      reason: 'Still fake',
    })
    expect([again.status, again.body.code]).toEqual([
      409,
      'REVIEW_ALREADY_REPORTED',
    ])
  })

  test("never one's own, and never one already hidden", async () => {
    const own = await call('POST', `/reviews/${REVIEW}/report`, 'customer', {
      reason: 'Changed my mind',
    })
    expect([own.status, own.body.code]).toEqual([409, 'REVIEW_OWN'])
    expect(
      (
        await call('POST', `/reviews/${HIDDEN_REVIEW}/report`, 'other', {
          reason: 'Abusive words',
        })
      ).status
    ).toBe(404)
    expect(reports).toEqual([])
  })
})

describe("the garage's reply", () => {
  test('owner seat only; an operator is 403, a support session 403', async () => {
    const operator = await call(
      'PUT',
      `/vendors/me/reviews/${REVIEW}/reply`,
      'operator',
      { text: 'Sorry!' }
    )
    expect(operator.status).toBe(403)
    const support = await call(
      'PUT',
      `/vendors/me/reviews/${REVIEW}/reply`,
      'superAdmin',
      { text: 'Sorry!' },
      { 'X-Vendor-Id': GARAGE }
    )
    expect([support.status, support.body.code]).toEqual([
      403,
      'REVIEWS_SUPPORT_SESSION',
    ])
    expect(rows[REVIEW]!.reply).toBeNull()
  })

  test('one public reply, changed within 24 hours, locked after', async () => {
    const posted = await call(
      'PUT',
      `/vendors/me/reviews/${REVIEW}/reply`,
      'owner',
      { text: ' Sorry Priya, fixed our drying step. ' }
    )
    expect(posted.status).toBe(200)
    expect(rows[REVIEW]!.reply).toBe('Sorry Priya, fixed our drying step.')
    expect(posted.body.data.reply).toMatchObject({
      text: 'Sorry Priya, fixed our drying step.',
      editable: true,
    })

    const changed = await call(
      'PUT',
      `/vendors/me/reviews/${REVIEW}/reply`,
      'owner',
      { text: 'Sorry Priya, your next interior is on us.' }
    )
    expect(changed.status).toBe(200)
    expect(rows[REVIEW]!.replyUpdatedAt).not.toBeNull()

    rows[REVIEW]!.repliedAt = new Date(Date.now() - 25 * HOUR)
    const late = await call(
      'PUT',
      `/vendors/me/reviews/${REVIEW}/reply`,
      'owner',
      { text: 'One more change' }
    )
    expect([late.status, late.body.code]).toEqual([409, 'REPLY_LOCKED'])
  })

  test("a Test booking's review is not the garage's (404); a hidden one takes no reply", async () => {
    expect(
      (
        await call('PUT', `/vendors/me/reviews/${TEST_REVIEW}/reply`, 'owner', {
          text: 'Hi',
        })
      ).status
    ).toBe(404)
    const hidden = await call(
      'PUT',
      `/vendors/me/reviews/${HIDDEN_REVIEW}/reply`,
      'owner',
      { text: 'Hi' }
    )
    expect([hidden.status, hidden.body.code]).toEqual([409, 'REVIEW_HIDDEN'])
    expect(
      (
        await call('PUT', `/vendors/me/reviews/${REVIEW}/reply`, 'owner', {
          text: '   ',
        })
      ).status
    ).toBe(400)
  })

  test('the garage reports a review once; it cannot hide it', async () => {
    const first = await call(
      'POST',
      `/vendors/me/reviews/${REVIEW}/report`,
      'owner',
      { reason: 'Wrong garage' }
    )
    expect(first.status).toBe(201)
    expect(reports[0]).toMatchObject({ reporter: 'garage', vendorId: GARAGE })
    expect(
      (
        await call('POST', `/vendors/me/reviews/${REVIEW}/report`, 'owner', {
          reason: 'Again',
        })
      ).status
    ).toBe(409)
    expect(
      (
        await call('POST', `/admin/reviews/${REVIEW}/hide`, 'owner', {
          reason: 'Mine',
        })
      ).status
    ).toBe(403)
  })
})

describe('admin: Hide… and Show again', () => {
  test('hide needs a reason, is signed by the session, and is refused twice', async () => {
    const token = await signAdminToken()
    const admin = { Cookie: `access_token=${token}` }
    const noReason = await app.request(`/admin/reviews/${REVIEW}/hide`, {
      method: 'POST',
      headers: { ...admin, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(noReason.status).toBe(400)
    const hidden = await call(
      'POST',
      `/admin/reviews/${REVIEW}/hide`,
      'breakGlass',
      { reason: 'Abusive language', actorName: 'Typed' }
    )
    expect(hidden.status).toBe(200)
    expect(rows[REVIEW]!.hiddenAt).not.toBeNull()
    expect(audit).toEqual(['review_hidden by admin'])
    const twice = await call(
      'POST',
      `/admin/reviews/${REVIEW}/hide`,
      'breakGlass',
      { reason: 'Again' }
    )
    expect([twice.status, twice.body.code]).toEqual([
      409,
      'REVIEW_ALREADY_HIDDEN',
    ])
  })

  test('show again undoes it; a review not hidden is refused', async () => {
    const shown = await call(
      'POST',
      `/admin/reviews/${HIDDEN_REVIEW}/show`,
      'breakGlass',
      {}
    )
    expect(shown.status).toBe(200)
    expect(rows[HIDDEN_REVIEW]!.hiddenAt).toBeNull()
    expect(audit).toEqual(['review_shown by admin'])
    const again = await call(
      'POST',
      `/admin/reviews/${HIDDEN_REVIEW}/show`,
      'breakGlass',
      {}
    )
    expect([again.status, again.body.code]).toEqual([409, 'REVIEW_NOT_HIDDEN'])
  })

  test('a garage in the Bin is read-only', async () => {
    garageInBin = true
    const res = await call(
      'POST',
      `/admin/reviews/${REVIEW}/hide`,
      'breakGlass',
      { reason: 'Abusive language' }
    )
    expect([res.status, res.body.code]).toEqual([409, 'VENDOR_IN_BIN'])
  })
})

describe("a review's tags", () => {
  test('good tags with 4-5 stars, problems with 1-3, from the list', async () => {
    const BOOKING = id(5430)
    const post = (body: Record<string, unknown>) =>
      call('POST', '/reviews', 'customer', { bookingId: BOOKING, ...body })
    expect((await post({ rating: 5, tags: ['late'] })).status).toBe(400)
    expect((await post({ rating: 2, tags: ['on_time'] })).status).toBe(400)
    expect((await post({ rating: 5, tags: ['amazing'] })).status).toBe(400)
    expect(
      (await post({ rating: 5, tags: ['on_time', 'on_time'] })).status
    ).toBe(400)
    // Valid: reaches the service, whose stand-in has no such booking.
    expect(
      (await post({ rating: 5, tags: ['on_time', 'friendly'] })).status
    ).toBe(404)
    expect((await post({ rating: 2 })).status).toBe(404)
  })
})
