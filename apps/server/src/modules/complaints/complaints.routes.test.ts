/**
 * "Logged in error" (0065) through the real admin routes and auth, with the
 * database stood in for: only a team-logged complaint, once, signed by the
 * session, and undone. The SQL that leaves a marked complaint out of every
 * count is NOT_LOGGED_IN_ERROR (complaints.repository.ts); the rule is
 * lib/complaints.test.ts's.
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
const { signAdminToken } = await import('../../lib/jwt.js')
const { complaintsRepository } = await import('./complaints.repository.js')
const { adminComplaintRoutes } = await import('./complaints.routes.js')

const ID = 'e2e00000-0000-4000-8000-000000005440'
const NOW = new Date()

type Row = {
  source: string
  errorMarkedAt: Date | null
  errorMarkedBy: string | null
  errorReason: string | null
}
let row: Row
let changes: Array<{
  mark: boolean
  by: string
  reason?: string
  sub: string
}> = []

const originals: Array<[Record<string, unknown>, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Record<string, unknown>
  originals.push([object, key, object[key]])
  object[key] = value
}

function adminRow() {
  return {
    complaint: {
      id: ID,
      number: 41,
      userId: null,
      customerName: 'Wrong Person',
      customerPhone: '9000005440',
      bookingId: null,
      bookingRef: null,
      vendorId: null,
      garageName: null,
      category: 'other',
      message: 'Logged against the wrong caller.',
      status: 'open',
      resolutionNote: null,
      adminNote: null,
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      resolvedBy: null,
      closedAt: null,
      closedBy: null,
      loggedBy: 'Mathew',
      receivedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      ...row,
    },
    accountExists: false,
    bookingScheduledAt: null,
    bookingStatus: null,
  }
}

beforeAll(() => {
  patch(complaintsRepository, 'findForAdmin', async () => adminRow())
  patch(
    complaintsRepository,
    'setLoggedInError',
    async (
      _id: string,
      change: { mark: boolean; by: string; reason?: string; at: Date },
      sub: string
    ) => {
      if (
        row.source === 'app' ||
        (change.mark ? row.errorMarkedAt : !row.errorMarkedAt)
      )
        return null
      changes.push({
        mark: change.mark,
        by: change.by,
        reason: change.reason,
        sub,
      })
      row = change.mark
        ? {
            ...row,
            errorMarkedAt: change.at,
            errorMarkedBy: change.by,
            errorReason: change.reason ?? null,
          }
        : {
            ...row,
            errorMarkedAt: null,
            errorMarkedBy: null,
            errorReason: null,
          }
      return { id: ID, number: 41 }
    }
  )
})
afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})
beforeEach(() => {
  row = {
    source: 'phone',
    errorMarkedAt: null,
    errorMarkedBy: null,
    errorReason: null,
  }
  changes = []
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json(
        { success: false, message: err.message, code: err.code },
        err.statusCode as 400
      )
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/admin/complaints', adminComplaintRoutes)

async function post(path: string, body: unknown, signedIn = true) {
  const res = await app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signedIn ? { Cookie: `access_token=${await signAdminToken()}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return {
    status: res.status,
    body: (await res.json()) as { code?: string; data?: any },
  }
}

describe('logged in error', () => {
  test('marked with a reason, signed by the session; out of the overdue clock', async () => {
    expect(
      (
        await post(
          `/admin/complaints/${ID}/logged-in-error`,
          { reason: 'Wrong caller' },
          false
        )
      ).status
    ).toBe(401)
    expect(
      (await post(`/admin/complaints/${ID}/logged-in-error`, { reason: 'x' }))
        .status
    ).toBe(400)
    const marked = await post(`/admin/complaints/${ID}/logged-in-error`, {
      reason: 'Wrong caller',
      actorName: 'Typed',
    })
    expect(marked.status).toBe(200)
    expect(changes).toEqual([
      { mark: true, by: 'admin', reason: 'Wrong caller', sub: 'admin' },
    ])
    expect(marked.body.data.loggedInError).toMatchObject({
      by: 'admin',
      reason: 'Wrong caller',
    })
    expect(marked.body.data.overdue).toBeNull()
    const twice = await post(`/admin/complaints/${ID}/logged-in-error`, {
      reason: 'Again',
    })
    expect([twice.status, twice.body.code]).toEqual([
      409,
      'COMPLAINT_ALREADY_IN_ERROR',
    ])
  })

  test('undone, back in the counts; refused when not marked', async () => {
    row = {
      ...row,
      errorMarkedAt: NOW,
      errorMarkedBy: 'Mathew',
      errorReason: 'Wrong caller',
    }
    const undone = await post(
      `/admin/complaints/${ID}/logged-in-error/undo`,
      {}
    )
    expect(undone.status).toBe(200)
    expect(undone.body.data.loggedInError).toBeNull()
    const again = await post(`/admin/complaints/${ID}/logged-in-error/undo`, {})
    expect([again.status, again.body.code]).toEqual([
      409,
      'COMPLAINT_NOT_IN_ERROR',
    ])
  })

  test("never a customer's own complaint from the app", async () => {
    row = { ...row, source: 'app' }
    const res = await post(`/admin/complaints/${ID}/logged-in-error`, {
      reason: 'Wrong caller',
    })
    expect([res.status, res.body.code]).toEqual([409, 'COMPLAINT_FROM_APP'])
    expect(changes).toEqual([])
  })
})
