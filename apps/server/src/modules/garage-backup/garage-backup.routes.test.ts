/**
 * Back up all garages through the real admin routes, auth and service, with
 * the repository stood in for (its SQL runs against Postgres in
 * garage-backup.db.test.ts): only the owner's login and the shared
 * break-glass login reach it; any other admin, a garage and a customer are
 * refused before anything is read. Each download is recorded first, pages
 * are masked unless that record asked for full numbers, and pages chain by
 * cursor.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { personalAdminSubject } = await import('../../lib/admin-actor.js')
const { BACKUP_PAGE_SIZE } = await import('../../lib/garage-backup.js')
const { adminRoutes } = await import('../admin/admin.routes.js')
const { adminLoginsService } = await import('../admin-logins/admin-logins.service.js')
const { membersRepository } = await import('../members/members.repository.js')
const { garageBackupRepository } = await import('./garage-backup.repository.js')

const OWNER = 'e2e00000-0000-4000-8000-000000007860'
const TEAMMATE = 'e2e00000-0000-4000-8000-000000007861'
const MEMBER_ADMIN = 'e2e00000-0000-4000-8000-000000007862'
const GARAGE_OWNER = 'e2e00000-0000-4000-8000-000000007863'
const BACKUP_MASKED = 'e2e00000-0000-4000-8000-000000007870'
const BACKUP_FULL = 'e2e00000-0000-4000-8000-000000007871'
const BACKUP_TEAMMATE = 'e2e00000-0000-4000-8000-000000007872'

type Audit = { id: string; actorSub: string; actorName: string; full: boolean; createdAt: Date }

const audits = new Map<string, Audit>()
const reads: string[] = []
const pageCalls: Array<{ table: string; after: string | null; limit: number }> = []

/** A garage row as the repository gives it (every column the sheet names, and more). */
const garageRow = (n: number) => ({
  garage_id: `g${n}`,
  garage_name: `Backup Check Motors ${n}`,
  phone: '9000007851',
  owner_phone: '+919000007850',
  notes: 'Owner’s brother: 9000007899',
  verified: true,
  cursor_id: `e2e00000-0000-4000-8000-${String(9000 + n).padStart(12, '0')}`,
})

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

beforeAll(() => {
  patch(adminLoginsService, 'sessionActor', async (sub: string) => {
    const id = sub.slice('admin:'.length)
    if (id === OWNER) return { sub, kind: 'personal', name: 'Mathew', username: 'owner', loginId: OWNER, isOwner: true }
    if (id === TEAMMATE) return { sub, kind: 'personal', name: 'Raga', username: 'raga', loginId: TEAMMATE, isOwner: false }
    return null
  })
  // A member admin (a users row with super_admin); every other user has no platform row.
  patch(membersRepository, 'findActivePlatformRow', async (userId: string) =>
    userId === MEMBER_ADMIN ? { role: 'super_admin' } : undefined
  )
  patch(membersRepository, 'findUserById', async () => ({ name: 'Member Admin' }))

  const now = Date.now()
  audits.set(BACKUP_MASKED, { id: BACKUP_MASKED, actorSub: personalAdminSubject(OWNER), actorName: 'Mathew', full: false, createdAt: new Date(now) })
  audits.set(BACKUP_FULL, { id: BACKUP_FULL, actorSub: personalAdminSubject(OWNER), actorName: 'Mathew', full: true, createdAt: new Date(now) })
  audits.set(BACKUP_TEAMMATE, { id: BACKUP_TEAMMATE, actorSub: personalAdminSubject(TEAMMATE), actorName: 'Raga', full: true, createdAt: new Date(now) })

  patch(garageBackupRepository, 'counts', async () => {
    reads.push('counts')
    return { garages: 3, bookings: 3402, garage_book_bills: 1180 }
  })
  patch(garageBackupRepository, 'lastBackup', async () => {
    reads.push('lastBackup')
    return audits.get(BACKUP_MASKED) ?? null
  })
  patch(garageBackupRepository, 'findBackup', async (id: string) => audits.get(id) ?? null)
  patch(garageBackupRepository, 'recordBackup', async (input: { actorSub: string; actorName: string; full: boolean }) => {
    const audit = { id: 'e2e00000-0000-4000-8000-000000007879', ...input, createdAt: new Date('2026-11-18T05:11:00Z') }
    audits.set(audit.id, audit)
    return audit
  })
  patch(garageBackupRepository, 'page', async (table: string, after: string | null, limit: number) => {
    pageCalls.push({ table, after, limit })
    // Two full pages and a short one: limit + 1 rows, then limit + 1, then 1.
    const start = after === null ? 0 : Number(after.slice(-4)) - 9000 + 1
    const total = 2 * limit + 1
    return Array.from({ length: Math.min(limit + 1, total - start) }, (_, i) => garageRow(start + i))
  })
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/admin', adminRoutes)

async function call(method: string, path: string, body: unknown, token?: string) {
  const res = await app.request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Cookie: `access_token=${token}` } : {}),
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
  return {
    status: res.status,
    cache: res.headers.get('cache-control'),
    body: (await res.json().catch(() => ({}))) as { data?: any; code?: string },
  }
}

const asOwner = () => signAdminToken(personalAdminSubject(OWNER))
const asTeammate = () => signAdminToken(personalAdminSubject(TEAMMATE))
const asUser = (sub: string, isVendorOwner: boolean) =>
  signAccessToken({ sub, aud: isVendorOwner ? 'vendor' : 'customer', isCustomer: !isVendorOwner, isVendorOwner } as never)

const ROUTES = [
  ['GET', '/admin/backup/last', null],
  ['GET', '/admin/backup', null],
  ['POST', '/admin/backup/started', { full: true }],
  ['GET', `/admin/backup/garages?backup=${BACKUP_TEAMMATE}&full=1`, null],
] as const

describe('only the owner backs up all garages', () => {
  test('another admin login is 403 ADMIN_OWNER_ONLY, a member admin too, and nothing is read', async () => {
    const before = reads.length + pageCalls.length
    for (const token of [await asTeammate(), await asUser(MEMBER_ADMIN, false)]) {
      for (const [method, path, body] of ROUTES) {
        const res = await call(method, path, body, token)
        expect([path, res.status, res.body.code]).toEqual([path, 403, 'ADMIN_OWNER_ONLY'])
      }
    }
    expect(reads.length + pageCalls.length).toBe(before)
  })

  test('a garage owner and a customer are not admins at all', async () => {
    for (const token of [await asUser(GARAGE_OWNER, true), await asUser(GARAGE_OWNER, false)]) {
      for (const [method, path, body] of ROUTES) {
        const res = await call(method, path, body, token)
        expect([path, res.status, res.body.code]).toEqual([path, 403, 'ADMIN_REQUIRED'])
      }
    }
  })

  test('signed out is 401', async () => {
    for (const [method, path, body] of ROUTES) expect((await call(method, path, body)).status).toBe(401)
  })

  test('the owner sees the last backup; so does the shared break-glass login', async () => {
    for (const token of [await asOwner(), await signAdminToken()]) {
      const res = await call('GET', '/admin/backup/last', null, token)
      expect(res.status).toBe(200)
      expect(res.body.data.lastBackup).toEqual({ at: expect.any(String), by: 'Mathew', full: false })
    }
  })
})

describe('the manifest', () => {
  test('each line of the sheet with its spreadsheets, row counts and columns', async () => {
    const res = await call('GET', '/admin/backup', null, await asOwner())
    expect(res.status).toBe(200)
    const data = res.body.data
    expect(data.pageSize).toBe(BACKUP_PAGE_SIZE)
    expect(data.totals).toEqual({ garages: 3, bookings: 3402, garageBookBills: 1180 })
    expect(data.groups.map((g: { label: string }) => g.label)).toEqual([
      'Garages and their details',
      'Services and prices',
      'Opening hours',
      'Photos (links)',
      'Bank and payout details',
      'Bookings',
      'Reviews',
      'Payouts',
      'Garage Book: customers, bills, expenses, stock',
      'Documents (links)',
    ])
    const garages = data.groups[0].tables[0]
    expect(garages).toMatchObject({ key: 'garages', file: 'garages.csv', rows: 3 })
    expect(garages.columns[0]).toEqual({ header: 'Garage ID', about: expect.any(String) })
    expect(data.groups[8].tables).toHaveLength(4)
  })
})

describe('a download', () => {
  test('is recorded first, signed with the session whatever name is sent', async () => {
    const res = await call('POST', '/admin/backup/started', { full: false, actorName: 'Typed Name' }, await asOwner())
    expect(res.status).toBe(201)
    expect(res.body.data).toEqual({
      backupId: 'e2e00000-0000-4000-8000-000000007879',
      at: '2026-11-18T05:11:00.000Z',
      by: 'Mathew',
      full: false,
    })
    expect(audits.get('e2e00000-0000-4000-8000-000000007879')).toMatchObject({
      actorSub: personalAdminSubject(OWNER),
      actorName: 'Mathew',
      full: false,
    })
  })

  test('a page needs its record: none is a 400, someone else’s a 403', async () => {
    const token = await asOwner()
    expect((await call('GET', '/admin/backup/garages', null, token)).status).toBe(400)
    const other = await call('GET', `/admin/backup/garages?backup=${BACKUP_TEAMMATE}`, null, token)
    expect([other.status, other.body.code]).toEqual([403, 'BACKUP_NOT_STARTED'])
    expect((await call('GET', `/admin/backup/users?backup=${BACKUP_MASKED}`, null, token)).status).toBe(400)
  })

  test('masked by default: phones and numbers in notes', async () => {
    const res = await call('GET', `/admin/backup/garages?backup=${BACKUP_MASKED}`, null, await asOwner())
    expect(res.status).toBe(200)
    expect(res.cache).toBe('no-store')
    const text = JSON.stringify(res.body.data.rows)
    expect(text).toContain('90•••••851')
    expect(text).toContain('90•••••850')
    expect(text).not.toContain('9000007851')
    expect(text).not.toContain('9000007850')
    expect(text).not.toContain('9000007899')
  })

  test('full numbers need a record that asked for them', async () => {
    const token = await asOwner()
    const refused = await call('GET', `/admin/backup/garages?backup=${BACKUP_MASKED}&full=1`, null, token)
    expect([refused.status, refused.body.code]).toEqual([403, 'BACKUP_NOT_FULL'])

    const res = await call('GET', `/admin/backup/garages?backup=${BACKUP_FULL}&full=1`, null, token)
    expect(res.status).toBe(200)
    const [row] = res.body.data.rows as unknown[][]
    expect(row.slice(0, 2)).toEqual(['g0', 'Backup Check Motors 0'])
    const text = JSON.stringify(row)
    expect(text).toContain('9000007851')
    expect(text).toContain('+919000007850')
    expect(text).toContain('9000007899')
  })

  test('pages chain by cursor until a short page', async () => {
    const token = await asOwner()
    pageCalls.length = 0
    const seen: unknown[] = []
    let cursor: string | null = null
    do {
      const query: string = `/admin/backup/garages?backup=${BACKUP_MASKED}${cursor ? `&cursor=${cursor}` : ''}`
      const res = await call('GET', query, null, token)
      expect(res.status).toBe(200)
      expect(res.body.data.rows.length).toBeLessThanOrEqual(BACKUP_PAGE_SIZE)
      seen.push(...res.body.data.rows.map((row: unknown[]) => row[0]))
      cursor = res.body.data.nextCursor
    } while (cursor)
    expect(pageCalls.map((p) => p.limit)).toEqual([BACKUP_PAGE_SIZE, BACKUP_PAGE_SIZE, BACKUP_PAGE_SIZE])
    expect(pageCalls[0].after).toBeNull()
    expect(seen).toHaveLength(2 * BACKUP_PAGE_SIZE + 1)
    expect(new Set(seen).size).toBe(seen.length)
  })
})
