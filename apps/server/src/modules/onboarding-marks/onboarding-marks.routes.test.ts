/**
 * Onboarding marks and collection lists (0059), through the real admin
 * routes and the real auth middleware. Only the repositories' reads and
 * writes (and the missing keys' read) are stood in for, each replaced for
 * these tests and put back afterwards, so nothing here touches a database.
 * The stand-ins keep the indexes' rules: one open mark per garage and
 * missing key.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAdminToken } = await import('../../lib/jwt.js')
const { personalAdminSubject } = await import('../../lib/admin-actor.js')
const { adminRoutes } = await import('../admin/admin.routes.js')
const { adminLoginsRepository } =
  await import('../admin-logins/admin-logins.repository.js')
const { onboardingMarksRepository } =
  await import('./onboarding-marks.repository.js')
const { onboardingMarksService } = await import('./onboarding-marks.service.js')
const { collectionListsRepository } =
  await import('../collection-lists/collection-lists.repository.js')

const GARAGE_A = 'e2e00000-0000-4000-8000-000000004151'
const GARAGE_B = 'e2e00000-0000-4000-8000-000000004155'
const BINNED = 'e2e00000-0000-4000-8000-000000004158'
const GONE = 'e2e00000-0000-4000-8000-000000004159'
const RAGA = 'e2e00000-0000-4000-8000-000000004160'
const NOBODY = 'e2e00000-0000-4000-8000-000000004199'

type Mark = {
  id: string
  vendorId: string
  kind: string
  label: string | null
  note: string | null
  status: 'to_ask' | 'asked' | 'received'
  askedAt: Date | null
  askedByName: string | null
  receivedAt: Date | null
  createdByName: string
  updatedByName: string | null
  createdAt: Date
  updatedAt: Date
}
type List = {
  id: string
  assigneeLoginId: string | null
  assigneeName: string
  dueOn: string | null
  note: string | null
  createdByName: string
  createdAt: Date
  telegramSentAt: Date | null
  closedAt: Date | null
}
type Item = {
  id: string
  listId: string
  vendorId: string
  kind: string
  label: string | null
  status: 'to_collect' | 'collected'
  collectedAt: Date | null
  collectedByName: string | null
  note: string | null
}

const garages = new Map([
  [
    GARAGE_A,
    {
      id: GARAGE_A,
      deletedAt: null as Date | null,
      purgedAt: null as Date | null,
    },
  ],
  [GARAGE_B, { id: GARAGE_B, deletedAt: null, purgedAt: null }],
  [BINNED, { id: BINNED, deletedAt: new Date(), purgedAt: null }],
])
const marks = new Map<string, Mark>()
const lists = new Map<string, List>()
const items = new Map<string, Item>()
const missing = new Map<string, string[]>()
let seq = 0
const uuid = () =>
  `e2e00000-0000-4000-8000-${String(900000 + ++seq).padStart(12, '0')}`

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

/** The open-mark index: one open mark per garage and missing key. */
const clashes = (row: Pick<Mark, 'id' | 'vendorId' | 'kind' | 'status'>) =>
  row.kind !== 'custom' &&
  row.status !== 'received' &&
  [...marks.values()].some(
    (m) =>
      m.id !== row.id &&
      m.vendorId === row.vendorId &&
      m.kind === row.kind &&
      m.status !== 'received'
  )

beforeAll(() => {
  patch(adminLoginsRepository, 'findSession', async (id: string) =>
    id === RAGA
      ? {
          id,
          username: 'raga',
          name: 'Raga',
          status: 'active',
          isOwner: false,
          sessionsFrom: new Date('2026-01-01'),
        }
      : undefined
  )

  const m = onboardingMarksRepository
  patch(m, 'findGarage', async (id: string) => garages.get(id))
  patch(m, 'findGarages', async (ids: string[]) =>
    ids.flatMap((id) => (garages.has(id) ? [garages.get(id)!] : []))
  )
  patch(m, 'list', async (vendorId: string) =>
    [...marks.values()].filter((row) => row.vendorId === vendorId)
  )
  patch(m, 'find', async (vendorId: string, id: string) => {
    const row = marks.get(id)
    return row?.vendorId === vendorId ? row : undefined
  })
  patch(m, 'insert', async (values: Omit<Mark, 'id'>) => {
    const row = {
      ...values,
      id: uuid(),
      updatedByName: values.updatedByName ?? null,
    } as Mark
    if (clashes(row)) return 'exists'
    marks.set(row.id, row)
    return row
  })
  patch(
    m,
    'update',
    async (vendorId: string, id: string, values: Partial<Mark>) => {
      const row = marks.get(id)
      if (!row || row.vendorId !== vendorId) return undefined
      const next = { ...row, ...values }
      if (clashes(next)) return 'exists'
      marks.set(id, next)
      return next
    }
  )
  patch(
    m,
    'remove',
    async (vendorId: string, id: string) =>
      marks.get(id)?.vendorId === vendorId && marks.delete(id)
  )
  patch(
    m,
    'markAsked',
    async (
      gs: Array<{ vendorId: string; kinds: string[]; markIds: string[] }>,
      actorName: string,
      now: Date
    ) => {
      const asked = {
        status: 'asked' as const,
        askedAt: now,
        askedByName: actorName,
        receivedAt: null,
        updatedByName: actorName,
        updatedAt: now,
      }
      const out: Mark[] = []
      for (const g of gs) {
        for (const kind of g.kinds) {
          const open = [...marks.values()].find(
            (r) =>
              r.vendorId === g.vendorId &&
              r.kind === kind &&
              r.status !== 'received'
          )
          const row = open
            ? { ...open, ...asked }
            : {
                id: uuid(),
                vendorId: g.vendorId,
                kind,
                label: null,
                note: null,
                createdByName: actorName,
                createdAt: now,
                ...asked,
              }
          marks.set(row.id, row)
          out.push(row)
        }
        for (const id of g.markIds) {
          const row = marks.get(id)
          if (row && row.vendorId === g.vendorId && row.status !== 'received') {
            marks.set(id, { ...row, ...asked })
            out.push(marks.get(id)!)
          }
        }
      }
      return out
    }
  )
  patch(
    onboardingMarksService,
    'missingFor',
    async (ids: string[]) =>
      new Map(
        ids.filter((id) => missing.has(id)).map((id) => [id, missing.get(id)!])
      )
  )

  const c = collectionListsRepository
  patch(c, 'findGarages', async (ids: string[]) =>
    ids.flatMap((id) => (garages.has(id) ? [garages.get(id)!] : []))
  )
  patch(
    c,
    'createLists',
    async (
      rows: Array<{
        list: Omit<List, 'id' | 'telegramSentAt' | 'closedAt'>
        items: Array<Pick<Item, 'vendorId' | 'kind' | 'label'>>
      }>
    ) =>
      rows.map(({ list, items: its }) => {
        const id = uuid()
        lists.set(id, { ...list, id, telegramSentAt: null, closedAt: null })
        for (const item of its) {
          const itemId = uuid()
          items.set(itemId, {
            ...item,
            id: itemId,
            listId: id,
            status: 'to_collect',
            collectedAt: null,
            collectedByName: null,
            note: null,
          })
        }
        return id
      })
  )
  patch(c, 'listByIds', async (ids: string[]) =>
    ids.flatMap((id) => (lists.has(id) ? [lists.get(id)!] : []))
  )
  patch(c, 'listUnclosed', async (loginId?: string) =>
    [...lists.values()]
      .filter((l) => !l.closedAt && (!loginId || l.assigneeLoginId === loginId))
      .reverse()
  )
  patch(c, 'listClosed', async (_limit: number, loginId?: string) =>
    [...lists.values()].filter(
      (l) => l.closedAt && (!loginId || l.assigneeLoginId === loginId)
    )
  )
  patch(c, 'listItems', async (ids: string[]) =>
    [...items.values()].filter((i) => ids.includes(i.listId))
  )
  patch(c, 'listGarageBriefs', async (ids: string[]) =>
    ids.map((id) => ({
      id,
      businessName:
        id === GARAGE_A ? 'Marks Test Garage A' : 'Marks Test Garage B',
      address: '1, Marks Road',
      city: 'Chennai',
      mapsUrl: null,
      lat: id === GARAGE_A ? 13.5 : null,
      lng: id === GARAGE_A ? 80.25 : null,
      ownerName: 'Anbu',
      ownerPhone: '9000004151',
    }))
  )
  patch(c, 'findItem', async (id: string) => {
    const item = items.get(id)
    return item
      ? { item, closedAt: lists.get(item.listId)!.closedAt }
      : undefined
  })
  patch(c, 'updateItem', async (id: string, values: Partial<Item>) => {
    const item = items.get(id)
    if (!item) return undefined
    items.set(id, { ...item, ...values })
    return items.get(id)
  })
  patch(c, 'close', async (id: string, at: Date) => {
    const list = lists.get(id)
    if (list && !list.closedAt) list.closedAt = at
  })
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

beforeEach(() => {
  marks.clear()
  lists.clear()
  items.clear()
  missing.clear()
  missing.set(GARAGE_A, ['photos', 'logo', 'radius_default', 'payout'])
  missing.set(GARAGE_B, ['photos', 'bays'])
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
app.route('/admin', adminRoutes)

type Body = { success?: boolean; code?: string; data?: any }

async function call(
  method: string,
  path: string,
  token: string,
  body?: unknown
) {
  const res = await app.request(path, {
    method,
    headers: {
      Cookie: `access_token=${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: (await res.json()) as Body }
}

const shared = () => signAdminToken()
const raga = () => signAdminToken(personalAdminSubject(RAGA))

describe('marks', () => {
  test('create signs with the session, labels a missing key, and refuses a second open one (409 MARK_EXISTS)', async () => {
    const token = await raga()
    const made = await call('POST', `/admin/vendors/${GARAGE_A}/marks`, token, {
      kind: 'photos',
      actorName: 'Someone Else',
    })
    expect(made.status).toBe(201)
    expect(made.body.data).toMatchObject({
      kind: 'photos',
      label: 'Photos',
      status: 'to_ask',
      createdByName: 'Raga',
      askedAt: null,
    })

    const again = await call(
      'POST',
      `/admin/vendors/${GARAGE_A}/marks`,
      token,
      { kind: 'photos' }
    )
    expect(again).toMatchObject({ status: 409, body: { code: 'MARK_EXISTS' } })
    // Another garage, or a custom mark, is free.
    expect(
      (
        await call('POST', `/admin/vendors/${GARAGE_B}/marks`, token, {
          kind: 'photos',
        })
      ).status
    ).toBe(201)
    expect(
      (
        await call('POST', `/admin/vendors/${GARAGE_A}/marks`, token, {
          kind: 'custom',
          label: 'Call back',
        })
      ).status
    ).toBe(201)
    expect(
      (
        await call('POST', `/admin/vendors/${GARAGE_A}/marks`, token, {
          kind: 'custom',
          label: 'Call back',
        })
      ).status
    ).toBe(201)
  })

  test('a custom mark needs a label; limits and unknown kinds are 400', async () => {
    const token = await shared()
    for (const body of [
      { kind: 'custom' },
      { kind: 'custom', label: '   ' },
      { kind: 'custom', label: 'x'.repeat(61) },
      { kind: 'photos', note: 'n'.repeat(501) },
      { kind: 'nothing' },
      { kind: 'photos', vendorId: GARAGE_B },
    ]) {
      expect(
        (await call('POST', `/admin/vendors/${GARAGE_A}/marks`, token, body))
          .status
      ).toBe(400)
    }
  })

  test('Asked stamps when and who; Undo back to To ask clears them; Received stamps when', async () => {
    const token = await raga()
    const made = (
      await call('POST', `/admin/vendors/${GARAGE_A}/marks`, token, {
        kind: 'payout',
      })
    ).body.data
    const path = `/admin/vendors/${GARAGE_A}/marks/${made.id}`

    const asked = await call('PATCH', path, token, {
      status: 'asked',
      note: 'Sent on WhatsApp',
    })
    expect(asked.body.data).toMatchObject({
      status: 'asked',
      askedByName: 'Raga',
      note: 'Sent on WhatsApp',
      updatedByName: 'Raga',
    })
    expect(asked.body.data.askedAt).not.toBeNull()

    const undone = await call('PATCH', path, token, { status: 'to_ask' })
    expect(undone.body.data).toMatchObject({
      status: 'to_ask',
      askedAt: null,
      askedByName: null,
    })

    const received = await call('PATCH', path, token, {
      status: 'received',
      note: null,
    })
    expect(received.body.data).toMatchObject({ status: 'received', note: null })
    expect(received.body.data.receivedAt).not.toBeNull()

    // Received is history: a new open one may be made, and the old one can't reopen beside it.
    expect(
      (
        await call('POST', `/admin/vendors/${GARAGE_A}/marks`, token, {
          kind: 'payout',
        })
      ).status
    ).toBe(201)
    expect(
      await call('PATCH', path, token, { status: 'to_ask' })
    ).toMatchObject({ status: 409, body: { code: 'MARK_EXISTS' } })
    expect((await call('PATCH', path, token, { kind: 'logo' })).status).toBe(
      400
    )
  })

  test('list, delete, and another garage’s mark is not found', async () => {
    const token = await shared()
    const made = (
      await call('POST', `/admin/vendors/${GARAGE_A}/marks`, token, {
        kind: 'logo',
      })
    ).body.data
    expect(
      (await call('GET', `/admin/vendors/${GARAGE_A}/marks`, token)).body.data
    ).toHaveLength(1)
    expect(
      (
        await call(
          'PATCH',
          `/admin/vendors/${GARAGE_B}/marks/${made.id}`,
          token,
          { status: 'asked' }
        )
      ).status
    ).toBe(404)
    expect(
      (
        await call(
          'DELETE',
          `/admin/vendors/${GARAGE_B}/marks/${made.id}`,
          token,
          {}
        )
      ).status
    ).toBe(404)
    expect(
      (
        await call(
          'DELETE',
          `/admin/vendors/${GARAGE_A}/marks/${made.id}`,
          token,
          {}
        )
      ).body
    ).toEqual({ success: true, data: null })
    expect(
      (await call('GET', `/admin/vendors/${GARAGE_A}/marks`, token)).body.data
    ).toEqual([])
  })

  test('a garage in the Bin reads but is not written; one that is gone is 404', async () => {
    const token = await shared()
    expect(
      (await call('GET', `/admin/vendors/${BINNED}/marks`, token)).status
    ).toBe(200)
    expect(
      (
        await call('POST', `/admin/vendors/${BINNED}/marks`, token, {
          kind: 'logo',
        })
      ).body.code
    ).toBe('VENDOR_IN_BIN')
    expect(
      (await call('GET', `/admin/vendors/${GONE}/marks`, token)).status
    ).toBe(404)
  })

  test('bulk Asked: moves the open mark, makes the missing ones, and the named ones; at most 50 garages', async () => {
    const token = await raga()
    const open = (
      await call('POST', `/admin/vendors/${GARAGE_A}/marks`, token, {
        kind: 'photos',
      })
    ).body.data
    const custom = (
      await call('POST', `/admin/vendors/${GARAGE_B}/marks`, token, {
        kind: 'custom',
        label: 'Visit the shop',
      })
    ).body.data

    const res = await call('POST', '/admin/onboarding-marks/asked', token, {
      garages: [
        { vendorId: GARAGE_A, kinds: ['photos', 'logo'] },
        { vendorId: GARAGE_B, kinds: ['bays'], markIds: [custom.id] },
      ],
    })
    expect(res.status).toBe(200)
    const byKind = Object.fromEntries(
      res.body.data.marks.map((m: any) => [
        `${m.vendorId === GARAGE_A ? 'A' : 'B'}:${m.kind}`,
        m,
      ])
    )
    expect(Object.keys(byKind).sort()).toEqual([
      'A:logo',
      'A:photos',
      'B:bays',
      'B:custom',
    ])
    expect(byKind['A:photos'].id).toBe(open.id)
    for (const mark of res.body.data.marks)
      expect(mark).toMatchObject({ status: 'asked', askedByName: 'Raga' })
    expect(marks.size).toBe(4)

    const many = Array.from({ length: 51 }, () => ({
      vendorId: GARAGE_A,
      kinds: ['logo'],
    }))
    expect(
      (
        await call('POST', '/admin/onboarding-marks/asked', token, {
          garages: many,
        })
      ).status
    ).toBe(400)
    expect(
      (
        await call('POST', '/admin/onboarding-marks/asked', token, {
          garages: [{ vendorId: BINNED, kinds: ['logo'] }],
        })
      ).body.code
    ).toBe('VENDOR_IN_BIN')
  })
})

describe('collection lists', () => {
  const send = (token: string, body: unknown) =>
    call('POST', '/admin/collection-lists', token, body)

  test('create: one list per collector in order, kinds merged per garage, the login’s own name kept', async () => {
    const token = await shared()
    const res = await send(token, {
      sendTelegram: false,
      lists: [
        {
          assigneeLoginId: RAGA,
          assigneeName: 'typed name',
          dueOn: '2026-10-29',
          note: '  Mornings  ',
          garages: [
            { vendorId: GARAGE_B, kinds: ['photos'] },
            { vendorId: GARAGE_A, kinds: ['payout', 'photos', 'payout'] },
            { vendorId: GARAGE_B, kinds: ['bays', 'photos'] },
          ],
        },
        {
          assigneeName: 'Someone else',
          garages: [{ vendorId: GARAGE_A, kinds: ['logo'] }],
        },
      ],
    })
    expect(res.status).toBe(201)
    const [first, second] = res.body.data.lists
    expect(first).toMatchObject({
      assigneeLoginId: RAGA,
      assigneeName: 'Raga',
      dueOn: '2026-10-29',
      note: 'Mornings',
      createdByName: 'admin',
      telegramSentAt: null,
      closedAt: null,
      open: true,
      progress: { done: 0, total: 4 },
    })
    expect(first.garages.map((g: any) => [g.businessName, g.mapsUrl])).toEqual([
      [
        'Marks Test Garage A',
        'https://www.google.com/maps/search/?api=1&query=13.500000,80.250000',
      ],
      ['Marks Test Garage B', null],
    ])
    expect(
      first.items.map((i: any) => [
        i.vendorId === GARAGE_A ? 'A' : 'B',
        i.label,
        i.status,
        i.cleared,
      ])
    ).toEqual([
      ['A', 'Photos', 'to_collect', false],
      ['A', 'Payout details', 'to_collect', false],
      ['B', 'Photos', 'to_collect', false],
      ['B', 'Bays', 'to_collect', false],
    ])
    expect(second).toMatchObject({
      assigneeLoginId: null,
      assigneeName: 'Someone else',
      dueOn: null,
      note: null,
    })
  })

  test('refusals: over 50 garages, nothing to collect, a garage in the Bin, an unknown login, a bad date', async () => {
    const token = await shared()
    const list = (garages: unknown[], extra = {}) => ({
      sendTelegram: false,
      lists: [{ assigneeName: 'Raga', garages, ...extra }],
    })
    const fiftyOne = Array.from({ length: 51 }, (_, i) => ({
      vendorId: `e2e00000-0000-4000-8000-${String(800000 + i).padStart(12, '0')}`,
      kinds: ['logo'],
    }))
    expect((await send(token, list(fiftyOne))).body.code).toBe(
      'COLLECTION_LIST_TOO_LONG'
    )
    expect(
      (await send(token, list([{ vendorId: GARAGE_A, kinds: [] }]))).body.code
    ).toBe('COLLECTION_LIST_EMPTY')
    expect(
      (await send(token, list([{ vendorId: BINNED, kinds: ['logo'] }]))).body
        .code
    ).toBe('VENDOR_IN_BIN')
    expect(
      (
        await send(
          token,
          list([{ vendorId: GARAGE_A, kinds: ['logo'] }], {
            assigneeLoginId: NOBODY,
          })
        )
      ).status
    ).toBe(404)
    expect(
      (
        await send(
          token,
          list([{ vendorId: GARAGE_A, kinds: ['logo'] }], {
            dueOn: '2026-02-30',
          })
        )
      ).status
    ).toBe(400)
    expect(
      (await send(token, list([{ vendorId: GARAGE_A, kinds: ['custom'] }])))
        .status
    ).toBe(400)
    expect(lists.size).toBe(0)
  })

  test('cleared items, ticking, progress, open; mine vs all; close', async () => {
    const admin = await shared()
    const mine = await raga()
    await send(admin, {
      sendTelegram: false,
      lists: [
        {
          assigneeLoginId: RAGA,
          assigneeName: 'Raga',
          garages: [{ vendorId: GARAGE_A, kinds: ['photos', 'logo'] }],
        },
      ],
    })
    await send(admin, {
      sendTelegram: false,
      lists: [
        {
          assigneeName: 'Typed',
          garages: [{ vendorId: GARAGE_B, kinds: ['bays'] }],
        },
      ],
    })

    // The logo was saved on the garage meanwhile: cleared.
    missing.set(GARAGE_A, ['photos', 'radius_default', 'payout'])
    const all = (await call('GET', '/admin/collection-lists?scope=all', admin))
      .body.data.lists
    expect(all).toHaveLength(2)
    const ragas = (
      await call('GET', '/admin/collection-lists?scope=mine&open=true', mine)
    ).body.data.lists
    expect(ragas).toHaveLength(1)
    expect(ragas[0].progress).toEqual({ done: 1, total: 2 })
    expect(ragas[0].items.find((i: any) => i.kind === 'logo').cleared).toBe(
      true
    )
    // The shared login has no login row: nothing is its own.
    expect(
      (await call('GET', '/admin/collection-lists?scope=mine', admin)).body.data
        .lists
    ).toEqual([])

    const photos = ragas[0].items.find((i: any) => i.kind === 'photos')
    const ticked = await call(
      'PATCH',
      `/admin/collection-items/${photos.id}`,
      mine,
      { status: 'collected', note: 'Got 4' }
    )
    expect(ticked.body.data).toMatchObject({
      status: 'collected',
      collectedByName: 'Raga',
      note: 'Got 4',
      cleared: false,
    })
    // Every item done: the list is no longer open.
    expect(
      (await call('GET', '/admin/collection-lists?scope=mine', mine)).body.data
        .lists
    ).toEqual([])
    const done = (
      await call('GET', '/admin/collection-lists?scope=mine&open=false', mine)
    ).body.data.lists
    expect(done).toHaveLength(1)
    expect(done[0]).toMatchObject({
      open: false,
      closedAt: null,
      progress: { done: 2, total: 2 },
    })

    const untick = await call(
      'PATCH',
      `/admin/collection-items/${photos.id}`,
      mine,
      { status: 'to_collect' }
    )
    expect(untick.body.data).toMatchObject({
      status: 'to_collect',
      collectedAt: null,
      collectedByName: null,
      note: 'Got 4',
    })

    const closed = await call(
      'POST',
      `/admin/collection-lists/${ragas[0].id}/close`,
      mine,
      {}
    )
    expect(closed.body.data).toMatchObject({ open: false })
    expect(closed.body.data.closedAt).not.toBeNull()
    expect(
      (
        await call('PATCH', `/admin/collection-items/${photos.id}`, mine, {
          status: 'collected',
        })
      ).body.code
    ).toBe('COLLECTION_LIST_CLOSED')
    expect(
      (await call('POST', `/admin/collection-lists/${NOBODY}/close`, mine, {}))
        .status
    ).toBe(404)
  })
})

describe('a garage’s open collection (the Garages list)', () => {
  test('that garage’s items on its newest open list; finished lists are not open', async () => {
    const { collectionListsService } =
      await import('../collection-lists/collection-lists.service.js')
    const older = new Date('2026-10-20T00:00:00Z')
    const newer = new Date('2026-10-25T00:00:00Z')
    const row = (
      listId: string,
      vendorId: string,
      kind: string,
      status: 'to_collect' | 'collected',
      createdAt: Date
    ) => ({
      listId,
      vendorId,
      kind,
      status,
      assigneeName: listId === 'L1' ? 'Raga' : 'Kavya',
      dueOn: listId === 'L1' ? '2026-10-29' : null,
      createdAt,
    })
    const restore = collectionListsRepository.listUnclosedItems
    ;(collectionListsRepository as Record<string, unknown>).listUnclosedItems =
      async () => [
        row('L1', GARAGE_A, 'photos', 'collected', older),
        row('L1', GARAGE_A, 'logo', 'to_collect', older),
        row('L1', GARAGE_B, 'bays', 'to_collect', older),
        row('L2', GARAGE_A, 'payout', 'to_collect', newer),
        row('L2', GARAGE_A, 'radius_default', 'to_collect', newer),
        // Finished: every item cleared, so not open.
        row(
          'L3',
          GARAGE_B,
          'logo',
          'to_collect',
          new Date('2026-10-26T00:00:00Z')
        ),
      ]
    try {
      const byVendor = await collectionListsService.openCollectionByVendor(
        new Map([
          [GARAGE_A, ['photos', 'payout'] as const],
          [GARAGE_B, ['bays'] as const],
        ] as Array<[string, readonly ('photos' | 'payout' | 'bays')[]]>)
      )
      // L2 is newer; its radius is cleared (no longer missing).
      expect(byVendor.get(GARAGE_A)).toEqual({
        listId: 'L2',
        assigneeName: 'Kavya',
        dueOn: null,
        done: 1,
        total: 2,
      })
      expect(byVendor.get(GARAGE_B)).toEqual({
        listId: 'L1',
        assigneeName: 'Raga',
        dueOn: '2026-10-29',
        done: 0,
        total: 1,
      })
    } finally {
      ;(
        collectionListsRepository as Record<string, unknown>
      ).listUnclosedItems = restore
    }
  })
})
