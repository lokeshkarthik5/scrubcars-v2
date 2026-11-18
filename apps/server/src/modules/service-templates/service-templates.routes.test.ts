/**
 * Service templates (0082) through the real admin routes and auth, with the
 * repository stood in for (no database): who may read and change them, the
 * description rules on save, one name per template, the editor's list
 * leaving out switched-off ones, every change signed for the audit row, and
 * the rate limit.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { env } = await import('../../lib/env.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { adminRoutes } = await import('../admin/admin.routes.js')
const { membersRepository } = await import('../members/members.repository.js')
const { serviceTemplatesRepository } = await import('./service-templates.repository.js')

// E2E fixture range 7950–7999 (seeds/e2e-ids.ts), reused here as plain ids.
const OWNER = 'e2e00000-0000-4000-8000-000000007990'
const GARAGE = 'e2e00000-0000-4000-8000-000000007950'
const FOAM = 'e2e00000-0000-4000-8000-000000007960'
const MONSOON = 'e2e00000-0000-4000-8000-000000007961'
const CLUTCH = 'e2e00000-0000-4000-8000-000000007962'
const NOBODY = 'e2e00000-0000-4000-8000-000000007999'

type Row = {
  id: string
  key: string | null
  position: number | null
  name: string
  category: string
  durationMins: number
  pricingType: string
  description: string
  isOn: boolean
  builtIn: boolean
  createdByAdmin: string | null
  updatedByAdmin: string | null
  sourceVendorId: string | null
  sourceVendorName: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

const NOW = new Date()
const LONG_AGO = new Date('2026-11-01T04:30:00Z')
let rows: Map<string, Row>
let audits: Array<{ action: string; by: string; id: string }>
let nextId = 7970

const seed = () =>
  new Map<string, Row>([
    [FOAM, {
      id: FOAM, key: 'foam-wash', position: 1, name: 'Foam wash', category: 'car_wash', durationMins: 45,
      pricingType: 'per_vehicle', description: 'Snow-foam pre-wash, then a hand wash and a microfibre dry.',
      isOn: true, builtIn: true, createdByAdmin: null, updatedByAdmin: null, sourceVendorId: null,
      sourceVendorName: null, createdAt: NOW, updatedAt: NOW, deletedAt: null,
    }],
    [MONSOON, {
      id: MONSOON, key: null, position: null, name: 'Monsoon underbody wash', category: 'car_wash', durationMins: 40,
      pricingType: 'flat', description: 'Underside and wheel arches rinsed to clear mud and flood-water grime.',
      isOn: true, builtIn: false, createdByAdmin: 'Priya', updatedByAdmin: 'Priya', sourceVendorId: GARAGE,
      sourceVendorName: 'Shine Auto Spa – Anna Nagar', createdAt: NOW, updatedAt: NOW, deletedAt: null,
    }],
    [CLUTCH, {
      id: CLUTCH, key: null, position: null, name: 'Clutch repair', category: 'repairs', durationMins: 1440,
      pricingType: 'on_inspection', description: 'Clutch checked on the car first; worn parts replaced as needed.',
      isOn: false, builtIn: false, createdByAdmin: 'Priya', updatedByAdmin: 'Priya', sourceVendorId: null,
      sourceVendorName: null, createdAt: LONG_AGO, updatedAt: LONG_AGO, deletedAt: null,
    }],
  ])

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const live = () => [...rows.values()].filter((row) => row.deletedAt === null)

beforeAll(() => {
  // The garage owner holds a garage seat and no platform row.
  patch(membersRepository, 'findActivePlatformRow', async () => undefined)
  patch(membersRepository, 'listActiveVendorSeats', async (userId: string) =>
    userId === OWNER ? [{ userId, vendorId: GARAGE, role: 'vendor_admin' }] : []
  )
  const r = serviceTemplatesRepository
  patch(r, 'listTemplates', async (onlyOn = false) => live().filter((row) => !onlyOn || row.isOn))
  patch(r, 'findTemplate', async (id: string) => live().find((row) => row.id === id))
  patch(r, 'vendorExists', async (id: string) => id === GARAGE)
  patch(r, 'createTemplate', async (values: Partial<Row>, actor: { name: string }) => {
    // The database's own index: lower and trimmed.
    if (live().some((row) => row.name.trim().toLowerCase() === values.name!.trim().toLowerCase())) {
      throw Object.assign(new Error('duplicate'), { code: '23505' })
    }
    const id = `e2e00000-0000-4000-8000-00000000${nextId++}`
    const row: Row = {
      id, key: null, position: null, name: values.name!, category: values.category!,
      durationMins: values.durationMins!, pricingType: values.pricingType!, description: values.description!,
      isOn: values.isOn!, builtIn: false, createdByAdmin: actor.name, updatedByAdmin: actor.name,
      sourceVendorId: values.sourceVendorId ?? null,
      sourceVendorName: values.sourceVendorId === GARAGE ? 'Kumar Auto Spa' : null,
      createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    }
    rows.set(id, row)
    audits.push({ action: values.sourceVendorId ? 'service_template_saved_from_service' : 'service_template_added', by: actor.name, id })
    return row
  })
  patch(r, 'updateTemplate', async (id: string, values: Record<string, unknown>, actor: { name: string }) => {
    const row = live().find((each) => each.id === id)
    if (!row) return undefined
    const changed = Object.keys(values).filter((key) => values[key] !== undefined && values[key] !== (row as Patchable)[key])
    if (changed.length === 0) return row
    for (const key of changed) (row as Patchable)[key] = values[key]
    row.updatedByAdmin = actor.name
    if (changed.includes('isOn')) {
      audits.push({ action: row.isOn ? 'service_template_turned_on' : 'service_template_turned_off', by: actor.name, id })
    }
    if (changed.some((key) => key !== 'isOn')) audits.push({ action: 'service_template_edited', by: actor.name, id })
    return row
  })
  patch(r, 'deleteTemplate', async (id: string, actor: { name: string }) => {
    const row = live().find((each) => each.id === id)
    if (!row) return false
    row.deletedAt = new Date()
    row.isOn = false
    audits.push({ action: 'service_template_deleted', by: actor.name, id })
    return true
  })
})

beforeEach(() => {
  rows = seed()
  audits = []
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

type Who = 'admin' | 'garage' | 'customer' | null
async function cookie(who: Who): Promise<Record<string, string>> {
  if (who === null) return {}
  const token =
    who === 'admin'
      ? await signAdminToken()
      : await signAccessToken({
          sub: OWNER,
          aud: who === 'customer' ? 'customer' : 'vendor',
          isCustomer: who === 'customer',
          isVendorOwner: who === 'garage',
        })
  return { Cookie: `access_token=${token}` }
}

async function call(method: string, path: string, who: Who, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      ...(await cookie(who)),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: (await res.json()) as { data?: any; code?: string; message?: string } }
}

const BASE = '/admin/service-templates'
const NEW_TEMPLATE = {
  name: 'Rat repellent treatment',
  category: 'others',
  durationMins: 30,
  pricingType: 'flat',
  description: 'Engine bay dusted off and a rodent-repellent spray applied to the wiring, hoses and bonnet lining.',
}

describe('admin only', () => {
  test('a garage and a customer are refused with 403, nobody with 401; nothing changes', async () => {
    for (const who of ['garage', 'customer'] as const) {
      expect((await call('GET', BASE, who)).status).toBe(403)
      expect((await call('GET', `${BASE}?on=true`, who)).status).toBe(403)
      expect((await call('POST', BASE, who, NEW_TEMPLATE)).status).toBe(403)
      expect((await call('PATCH', `${BASE}/${FOAM}`, who, { name: 'Snow foam' })).status).toBe(403)
      expect((await call('PATCH', `${BASE}/${FOAM}/on`, who, { on: false })).status).toBe(403)
      expect((await call('DELETE', `${BASE}/${FOAM}`, who)).status).toBe(403)
    }
    expect((await call('GET', BASE, null)).status).toBe(401)
    expect((await call('POST', BASE, null, NEW_TEMPLATE)).status).toBe(401)
    expect((await call('DELETE', `${BASE}/${FOAM}`, null)).status).toBe(401)
    expect(live()).toHaveLength(3)
    expect(rows.get(FOAM)).toMatchObject({ name: 'Foam wash', isOn: true })
    expect(audits).toEqual([])
  })
})

describe('the lists', () => {
  test('Settings lists every one, off ones too, with Built in and New', async () => {
    const { status, body } = await call('GET', BASE, 'admin')
    expect(status).toBe(200)
    expect(body.data.templates.map((t: any) => [t.name, t.isOn, t.builtIn, t.isNew])).toEqual([
      ['Foam wash', true, true, false],
      ['Monsoon underbody wash', true, false, true],
      ['Clutch repair', false, false, false],
    ])
    expect(body.data.templates[1]).toMatchObject({
      createdByName: 'Priya',
      sourceVendorName: 'Shine Auto Spa – Anna Nagar',
      durationMins: 40,
      pricingType: 'flat',
    })
    // Never a price on a template.
    expect(Object.keys(body.data.templates[0]).filter((key) => /price(?!.*type)/i.test(key))).toEqual([])
  })

  test('the editor’s list leaves out switched-off ones', async () => {
    const { body } = await call('GET', `${BASE}?on=true`, 'admin')
    expect(body.data.templates.map((t: any) => t.name)).toEqual(['Foam wash', 'Monsoon underbody wash'])
    await call('PATCH', `${BASE}/${MONSOON}/on`, 'admin', { on: false })
    const after = await call('GET', `${BASE}?on=true`, 'admin')
    expect(after.body.data.templates.map((t: any) => t.name)).toEqual(['Foam wash'])
    expect((await call('GET', `${BASE}?on=false`, 'admin')).status).toBe(400)
  })
})

describe('Add, Edit, On/Off and Delete', () => {
  test('Add template saves it on, signed, and it is New', async () => {
    const { status, body } = await call('POST', BASE, 'admin', NEW_TEMPLATE)
    expect(status).toBe(201)
    expect(body.data).toMatchObject({ ...NEW_TEMPLATE, isOn: true, builtIn: false, isNew: true, key: null })
    expect(audits).toEqual([{ action: 'service_template_added', by: 'admin', id: body.data.id }])
  })

  test('Save as template names the garage; an unknown garage is 404', async () => {
    const saved = await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, fromVendorId: GARAGE })
    expect(saved.status).toBe(201)
    expect(saved.body.data).toMatchObject({ sourceVendorId: GARAGE, sourceVendorName: 'Kumar Auto Spa' })
    expect(audits.map((a) => a.action)).toEqual(['service_template_saved_from_service'])
    const unknown = await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, name: 'Other', fromVendorId: NOBODY })
    expect([unknown.status, unknown.body.code]).toEqual([404, 'VENDOR_NOT_FOUND'])
  })

  test('a price, a package or anything else sent is refused', async () => {
    expect((await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, price: 599 })).status).toBe(400)
    expect((await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, category: 'package' })).status).toBe(400)
    expect((await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, durationMins: 0 })).status).toBe(400)
    expect((await call('PATCH', `${BASE}/${FOAM}`, 'admin', { priceSuv: 900 })).status).toBe(400)
    expect(live()).toHaveLength(3)
  })

  test('Edit changes only what is sent, built-ins too, signed', async () => {
    const { status, body } = await call('PATCH', `${BASE}/${FOAM}`, 'admin', { durationMins: 50, name: 'Foam wash ' })
    expect(status).toBe(200)
    expect(body.data).toMatchObject({ name: 'Foam wash', durationMins: 50, builtIn: true, updatedByName: 'admin' })
    expect(audits).toEqual([{ action: 'service_template_edited', by: 'admin', id: FOAM }])
  })

  test('On/Off is its own switch; switching to what it is changes nothing', async () => {
    const off = await call('PATCH', `${BASE}/${FOAM}/on`, 'admin', { on: false })
    expect([off.status, off.body.data.isOn]).toEqual([200, false])
    const again = await call('PATCH', `${BASE}/${FOAM}/on`, 'admin', { on: false })
    expect(again.body.data.isOn).toBe(false)
    expect(audits).toEqual([{ action: 'service_template_turned_off', by: 'admin', id: FOAM }])
  })

  test('Delete takes it out of both lists, built-ins included; a second Delete is 404', async () => {
    const deleted = await call('DELETE', `${BASE}/${FOAM}`, 'admin')
    expect([deleted.status, deleted.body.data]).toEqual([200, { id: FOAM, deleted: true }])
    expect((await call('GET', BASE, 'admin')).body.data.templates.map((t: any) => t.name)).not.toContain('Foam wash')
    expect((await call('GET', `${BASE}?on=true`, 'admin')).body.data.templates.map((t: any) => t.name)).not.toContain('Foam wash')
    const again = await call('DELETE', `${BASE}/${FOAM}`, 'admin')
    expect([again.status, again.body.code]).toEqual([404, 'TEMPLATE_NOT_FOUND'])
    expect((await call('PATCH', `${BASE}/${FOAM}`, 'admin', { name: 'Back' })).status).toBe(404)
    expect(audits.map((a) => a.action)).toEqual(['service_template_deleted'])
    // Its name is free again.
    expect((await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, name: 'Foam wash' })).status).toBe(201)
  })

  test('a bad id is 400, an unknown one 404', async () => {
    expect((await call('PATCH', `${BASE}/not-an-id/on`, 'admin', { on: true })).status).toBe(400)
    const unknown = await call('PATCH', `${BASE}/${NOBODY}/on`, 'admin', { on: true })
    expect([unknown.status, unknown.body.code]).toEqual([404, 'TEMPLATE_NOT_FOUND'])
  })
})

describe('the words', () => {
  test('a price, a time, a claim or "ask the garage" is refused in plain words; nothing saved', async () => {
    const cases: Array<[string, string]> = [
      ['Rinsed and dried, from ₹299.', 'The description can’t be saved: it mentioned a price or money.'],
      ['Rinsed and dried in 30 minutes.', 'The description can’t be saved: it mentioned how long the service takes.'],
      ['A guaranteed rust-free underside.', 'The description can’t be saved: it said "guaranteed", which Detlio does not claim.'],
      ['Ask the garage about the spray.', 'The description can’t be saved: it tells customers to ask, call or contact the garage, and they can’t reach a garage before booking.'],
      ['', 'Write a description: what the service includes, in a sentence or two.'],
    ]
    for (const [description, message] of cases) {
      const res = await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, description })
      expect([res.status, res.body.code, res.body.message]).toEqual([400, 'TEMPLATE_INVALID', message])
    }
    const edit = await call('PATCH', `${BASE}/${FOAM}`, 'admin', { description: 'The best foam wash.' })
    expect([edit.status, edit.body.code]).toEqual([400, 'TEMPLATE_INVALID'])
    expect(rows.get(FOAM)!.description).toBe('Snow-foam pre-wash, then a hand wash and a microfibre dry.')
    const name = await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, name: 'Certified coating' })
    expect([name.status, name.body.code]).toEqual([400, 'TEMPLATE_INVALID'])
    // A price in the name, on Add and on Edit alike.
    const priced = await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, name: 'Rat repellent ₹599' })
    expect([priced.status, priced.body.code]).toEqual([400, 'TEMPLATE_INVALID'])
    const renamed = await call('PATCH', `${BASE}/${FOAM}`, 'admin', { name: 'Foam wash Rs 399' })
    expect([renamed.status, renamed.body.code]).toEqual([400, 'TEMPLATE_INVALID'])
    expect(rows.get(FOAM)!.name).toBe('Foam wash')
    expect(live()).toHaveLength(3)
    expect(audits).toEqual([])
  })
})

describe('one name per template', () => {
  test('the same name in any case, spacing or punctuation is refused', async () => {
    for (const name of ['foam wash', '  FOAM-WASH ', 'Clutch Repair']) {
      const res = await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, name })
      expect([res.status, res.body.code]).toEqual([409, 'TEMPLATE_NAME_TAKEN'])
    }
    const rename = await call('PATCH', `${BASE}/${MONSOON}`, 'admin', { name: 'Foam Wash' })
    expect([rename.status, rename.body.code, rename.body.message]).toEqual([
      409,
      'TEMPLATE_NAME_TAKEN',
      'There is already a template called “Foam wash”. Pick another name.',
    ])
    // Its own name, in another case, is fine.
    expect((await call('PATCH', `${BASE}/${MONSOON}`, 'admin', { name: 'Monsoon Underbody Wash' })).status).toBe(200)
  })

  test('two names in Tamil are two templates; the same one again is refused', async () => {
    expect((await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, name: 'கார் வாஷ்' })).status).toBe(201)
    expect((await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, name: 'பைக் வாஷ்' })).status).toBe(201)
    const again = await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, name: ' கார் வாஷ் ' })
    expect([again.status, again.body.code]).toEqual([409, 'TEMPLATE_NAME_TAKEN'])
  })

  test('two saves at once: the database’s index refusing is the same 409', async () => {
    patch(serviceTemplatesRepository, 'listTemplates', async () => [])
    try {
      const res = await call('POST', BASE, 'admin', { ...NEW_TEMPLATE, name: 'Foam wash' })
      expect([res.status, res.body.code]).toEqual([409, 'TEMPLATE_NAME_TAKEN'])
    } finally {
      const [object, key, value] = originals.pop()!
      object[key] = value
    }
  })
})

describe('rate limit', () => {
  test('writes per admin per hour; reads are not counted', async () => {
    const writable = env as { serviceTemplateWriteRateLimit: number }
    const before = writable.serviceTemplateWriteRateLimit
    // Counts are kept per process, and the tests above wrote as this admin.
    writable.serviceTemplateWriteRateLimit = 0
    try {
      const res = await call('PATCH', `${BASE}/${FOAM}/on`, 'admin', { on: false })
      expect([res.status, res.body.code]).toEqual([429, 'RATE_LIMIT_EXCEEDED'])
      expect(rows.get(FOAM)!.isOn).toBe(true)
      expect((await call('GET', BASE, 'admin')).status).toBe(200)
    } finally {
      writable.serviceTemplateWriteRateLimit = before
    }
  })
})
