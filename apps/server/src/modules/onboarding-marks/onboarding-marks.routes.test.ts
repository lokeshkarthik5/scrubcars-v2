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
const TURNED_OFF = 'e2e00000-0000-4000-8000-000000004161'
const NOBODY = 'e2e00000-0000-4000-8000-000000004199'

type Mark = {
  id: string
  vendorId: string
  kind: string
  label: string | null
  note: string | null
  items?: Array<Record<string, unknown>>
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
    id === RAGA || id === TURNED_OFF
      ? {
          id,
          username: id === RAGA ? 'raga' : 'kavya',
          name: id === RAGA ? 'Raga' : 'Kavya',
          status: id === RAGA ? 'active' : 'off',
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
    'updateLocked',
    async (vendorId: string, id: string, change: (row: Mark) => Partial<Mark>) => {
      const row = marks.get(id)
      if (!row || row.vendorId !== vendorId) return undefined
      const next = { ...row, ...change({ ...row, items: row.items ?? [] }) }
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
      pincode: '600116',
      mapsUrl: null,
      // A is pinned in Adyar; B has no pin.
      lat: id === GARAGE_A ? 13.0067 : null,
      lng: id === GARAGE_A ? 80.257 : null,
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
  patch(c, 'closeFinished', async (ids: string[], at: Date) => {
    for (const id of ids) {
      const list = lists.get(id)
      if (list && !list.closedAt) list.closedAt = at
    }
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

describe('marks as a checklist (0061)', () => {
  test('a mark made with items: each answered one is stamped; status follows the ticks', async () => {
    const token = await raga()
    const made = await call('POST', `/admin/vendors/${GARAGE_B}/marks`, token, {
      kind: 'custom',
      label: 'New garage call',
      items: [
        { text: 'At-garage services?' },
        { text: '  Doorstep radius  ' },
        { text: 'Payout details', done: true, answer: 'Will send on WhatsApp' },
      ],
    })
    expect(made.status).toBe(201)
    const mark = made.body.data
    expect(mark.items.map((i: any) => i.text)).toEqual([
      'At-garage services?',
      'Doorstep radius',
      'Payout details',
    ])
    expect(mark.items[0]).toMatchObject({ done: false, answer: null, answeredBy: null })
    expect(mark.items[2]).toMatchObject({ done: true, answer: 'Will send on WhatsApp', answeredBy: 'Raga' })
    // One of three ticked: in progress, which is Asked, stamped.
    expect(mark.status).toBe('asked')
    expect(mark.askedByName).toBe('Raga')

    // Tick one with an answer: who and when, and still Asked.
    const first = mark.items[0].id
    const ticked = await call(
      'PATCH',
      `/admin/vendors/${GARAGE_B}/marks/${mark.id}/items/${first}`,
      token,
      { done: true, answer: 'Yes: wash and polish at Kilpauk' }
    )
    expect(ticked.status).toBe(200)
    expect(ticked.body.data.items[0]).toMatchObject({
      done: true,
      answer: 'Yes: wash and polish at Kilpauk',
      answeredBy: 'Raga',
    })
    expect(ticked.body.data.items[0].answeredAt).toBeTruthy()
    expect(ticked.body.data.status).toBe('asked')

    // The last one ticked: Received, which closes the mark.
    const last = await call(
      'PATCH',
      `/admin/vendors/${GARAGE_B}/marks/${mark.id}/items/${mark.items[1].id}`,
      token,
      { done: true, answer: '5 km' }
    )
    expect(last.body.data.status).toBe('received')
    expect(last.body.data.receivedAt).toBeTruthy()

    // Unticked again: back to Asked, open.
    const reopened = await call(
      'PATCH',
      `/admin/vendors/${GARAGE_B}/marks/${mark.id}/items/${mark.items[1].id}`,
      token,
      { done: false }
    )
    expect(reopened.body.data.status).toBe('asked')
    expect(reopened.body.data.receivedAt).toBeNull()

    // An item no longer on the list, and an empty change.
    expect(
      (await call('PATCH', `/admin/vendors/${GARAGE_B}/marks/${mark.id}/items/nope`, token, { done: true })).body.code
    ).toBe('MARK_ITEM_NOT_FOUND')
    expect(
      (await call('PATCH', `/admin/vendors/${GARAGE_B}/marks/${mark.id}/items/${first}`, token, {})).status
    ).toBe(400)
  })

  test('the edit dialog saves the whole list: kept items keep who answered, new ones get ids, at most 30', async () => {
    const token = await raga()
    const made = await call('POST', `/admin/vendors/${GARAGE_B}/marks`, token, {
      kind: 'custom',
      label: 'Payout setup',
      items: [{ text: 'Bank or UPI?', done: true, answer: 'UPI' }, { text: 'Holder name' }],
    })
    const [bank, holder] = made.body.data.items
    const saved = await call('PATCH', `/admin/vendors/${GARAGE_B}/marks/${made.body.data.id}`, await shared(), {
      actorName: 'Ignored',
      items: [
        { id: holder.id, text: 'Account holder name' },
        { id: bank.id, text: 'Bank or UPI?', done: true, answer: 'UPI' },
        { text: 'Proof on WhatsApp' },
      ],
    })
    expect(saved.status).toBe(200)
    const items = saved.body.data.items
    expect(items.map((i: any) => i.text)).toEqual(['Account holder name', 'Bank or UPI?', 'Proof on WhatsApp'])
    // Unchanged tick and answer: still Raga's, though the shared login saved.
    expect(items[1]).toMatchObject({ id: bank.id, answeredBy: 'Raga' })
    expect(items[2].id).toBeTruthy()
    expect(items[2].id).not.toBe(bank.id)

    const tooMany = Array.from({ length: 31 }, (_, i) => ({ text: `Item ${i}` }))
    expect(
      (await call('PATCH', `/admin/vendors/${GARAGE_B}/marks/${made.body.data.id}`, token, { items: tooMany })).status
    ).toBe(400)
  })

  test('an old note’s "- " lines read as items, and are saved as items on the first tick', async () => {
    const token = await raga()
    const made = await call('POST', `/admin/vendors/${GARAGE_A}/marks`, token, {
      kind: 'custom',
      label: 'Old call',
      note: 'Owner busy till 5\n- Check if they do doorstep\n- Ask the radius',
    })
    // A mark from before 0061: the note holds the list.
    expect(made.body.data.items.map((i: any) => i.id)).toEqual(['note-1', 'note-2'])
    expect(made.body.data.note).toBe('Owner busy till 5')

    const ticked = await call(
      'PATCH',
      `/admin/vendors/${GARAGE_A}/marks/${made.body.data.id}/items/note-2`,
      token,
      { done: true, answer: '3 km' }
    )
    expect(ticked.status).toBe(200)
    expect(ticked.body.data.items.map((i: any) => [i.text, i.done])).toEqual([
      ['Check if they do doorstep', false],
      ['Ask the radius', true],
    ])
    expect(ticked.body.data.note).toBe('Owner busy till 5')
    // Stored now: the note no longer holds them.
    const stored = [...(await onboardingMarksRepository.list(GARAGE_A))].find(
      (row: any) => row.id === made.body.data.id
    ) as any
    expect(stored.note).toBe('Owner busy till 5')
    expect(stored.items).toHaveLength(2)
  })

  test('a mark with no items keeps the status the team sets', async () => {
    const token = await raga()
    const made = await call('POST', `/admin/vendors/${GARAGE_A}/marks`, token, {
      kind: 'custom',
      label: 'Plain one',
      status: 'received',
    })
    expect(made.body.data.status).toBe('received')
    expect(made.body.data.items).toEqual([])
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
    expect(
      first.garages.map((g: any) => [g.businessName, g.area, g.mapsUrl])
    ).toEqual([
      [
        'Marks Test Garage A',
        'Adyar',
        'https://www.google.com/maps/search/?api=1&query=13.006700,80.257000',
      ],
      ['Marks Test Garage B', 'Chennai', null],
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
    // A turned-off login can't sign in to see its list.
    expect(
      await send(
        token,
        list([{ vendorId: GARAGE_A, kinds: ['logo'] }], {
          assigneeLoginId: TURNED_OFF,
        })
      )
    ).toMatchObject({ status: 409, body: { code: 'ADMIN_LOGIN_OFF' } })
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
    const path = `/admin/collection-items/${photos.id}`
    // The logo goes missing again; an untick on an open list puts it back.
    missing.set(GARAGE_A, ['photos', 'logo', 'radius_default', 'payout'])
    const logo = ragas[0].items.find((i: any) => i.kind === 'logo')
    await call('PATCH', path, mine, { status: 'collected', note: 'Got 2' })
    expect(lists.get(ragas[0].id)!.closedAt).toBeNull()
    const untick = await call('PATCH', path, mine, { status: 'to_collect' })
    expect(untick.body.data).toMatchObject({
      status: 'to_collect',
      collectedAt: null,
      collectedByName: null,
      note: 'Got 2',
    })
    await call('PATCH', `/admin/collection-items/${logo.id}`, mine, {
      status: 'collected',
    })
    expect(lists.get(ragas[0].id)!.closedAt).toBeNull()

    // The tick that leaves nothing to do closes the list.
    const ticked = await call('PATCH', path, mine, {
      status: 'collected',
      note: 'Got 4',
    })
    expect(ticked.body.data).toMatchObject({
      status: 'collected',
      collectedByName: 'Raga',
      note: 'Got 4',
      cleared: false,
    })
    const stamped = lists.get(ragas[0].id)!.closedAt
    expect(stamped).not.toBeNull()
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
      closedAt: stamped!.toISOString(),
      progress: { done: 2, total: 2 },
    })
    expect(
      (await call('PATCH', path, mine, { status: 'to_collect' })).body.code
    ).toBe('COLLECTION_LIST_CLOSED')

    // Close still answers, and keeps when it was closed.
    const closed = await call(
      'POST',
      `/admin/collection-lists/${ragas[0].id}/close`,
      mine,
      {}
    )
    expect(closed.body.data).toMatchObject({
      open: false,
      closedAt: stamped!.toISOString(),
    })
    expect(
      (await call('POST', `/admin/collection-lists/${NOBODY}/close`, mine, {}))
        .status
    ).toBe(404)
  })
})

describe('finished lists close', () => {
  test('a list whose things were all saved on the garage closes when read', async () => {
    const admin = await shared()
    const made = (
      await send(admin, {
        sendTelegram: false,
        lists: [
          {
            assigneeName: 'Typed',
            garages: [{ vendorId: GARAGE_B, kinds: ['bays'] }],
          },
        ],
      })
    ).body.data.lists[0]
    expect(made).toMatchObject({ open: true, closedAt: null })

    // The bays were saved on the garage: nothing is left to collect.
    missing.set(GARAGE_B, ['photos'])
    const read = (
      await call('GET', '/admin/collection-lists?scope=all&open=false', admin)
    ).body.data.lists
    expect(read).toHaveLength(1)
    expect(read[0]).toMatchObject({ id: made.id, open: false })
    expect(read[0].closedAt).not.toBeNull()
    expect(lists.get(made.id)!.closedAt).not.toBeNull()
    // It no longer counts as unclosed, even when the bays go missing again.
    missing.set(GARAGE_B, ['photos', 'bays'])
    expect(
      (await call('GET', '/admin/collection-lists?scope=all', admin)).body.data
        .lists
    ).toEqual([])
  })

  function send(token: string, body: unknown) {
    return call('POST', '/admin/collection-lists', token, body)
  }
})

describe('a garage’s open collection (the Garages list)', () => {
  test('the list due first with that garage’s things left; nothing left is no entry; finished lists close', async () => {
    const { collectionListsService } =
      await import('../collection-lists/collection-lists.service.js')
    const at = (day: number) => new Date(`2026-10-${day}T00:00:00Z`)
    const LISTS: Record<
      string,
      { assigneeName: string; dueOn: string | null; createdAt: Date }
    > = {
      // Due 29 Oct, the oldest.
      L1: { assigneeName: 'Raga', dueOn: '2026-10-29', createdAt: at(20) },
      // No due date, the newest.
      L2: { assigneeName: 'Kavya', dueOn: null, createdAt: at(25) },
      // Due 29 Oct too, newer than L1.
      L3: { assigneeName: 'Vimal', dueOn: '2026-10-29', createdAt: at(22) },
      // Due first, but every item done.
      L4: { assigneeName: 'Raga', dueOn: '2026-10-27', createdAt: at(21) },
    }
    const row = (
      listId: string,
      vendorId: string,
      kind: string,
      status: 'to_collect' | 'collected'
    ) => ({ listId, vendorId, kind, status, ...LISTS[listId]! })
    const GARAGE_C = 'e2e00000-0000-4000-8000-000000004165'
    const restore = {
      listUnclosedItems: collectionListsRepository.listUnclosedItems,
      closeFinished: collectionListsRepository.closeFinished,
    }
    const closedIds: string[] = []
    Object.assign(collectionListsRepository, {
      listUnclosedItems: async () => [
        // A: undone on L1, L2 and L3; L3 is due first with L1 and newer.
        row('L1', GARAGE_A, 'photos', 'collected'),
        row('L1', GARAGE_A, 'payout', 'to_collect'),
        row('L2', GARAGE_A, 'payout', 'to_collect'),
        row('L3', GARAGE_A, 'photos', 'to_collect'),
        row('L3', GARAGE_A, 'radius_default', 'to_collect'),
        row('L3', GARAGE_A, 'logo', 'collected'),
        // B: done on L1 (bays collected) and L3 (logo cleared), so L2.
        row('L1', GARAGE_B, 'bays', 'collected'),
        row('L3', GARAGE_B, 'logo', 'to_collect'),
        row('L2', GARAGE_B, 'photos', 'to_collect'),
        // C: everything done, on a finished list.
        row('L4', GARAGE_C, 'logo', 'collected'),
        row('L4', GARAGE_C, 'bays', 'to_collect'),
      ],
      closeFinished: async (ids: string[]) => {
        closedIds.push(...ids)
      },
    })
    try {
      const byVendor = await collectionListsService.openCollectionByVendor(
        new Map<string, readonly ('photos' | 'payout' | 'bays' | 'logo')[]>([
          [GARAGE_A, ['photos', 'payout']],
          [GARAGE_B, ['photos', 'bays']],
          [GARAGE_C, []],
        ])
      )
      // L3: due 29 Oct like L1 but newer. Its radius is cleared and its
      // logo collected: 2 of 3.
      expect(byVendor.get(GARAGE_A)).toEqual({
        listId: 'L3',
        assigneeName: 'Vimal',
        dueOn: '2026-10-29',
        done: 2,
        total: 3,
      })
      // Nothing of B's left on L1 or L3: the undated L2.
      expect(byVendor.get(GARAGE_B)).toEqual({
        listId: 'L2',
        assigneeName: 'Kavya',
        dueOn: null,
        done: 0,
        total: 1,
      })
      expect(byVendor.has(GARAGE_C)).toBe(false)
      // L4 is finished, so it is closed; the others still have work.
      expect(closedIds).toEqual(['L4'])
    } finally {
      Object.assign(collectionListsRepository, restore)
    }
  })
})
