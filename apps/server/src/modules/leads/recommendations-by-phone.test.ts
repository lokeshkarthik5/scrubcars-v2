/**
 * Bring your garage (21 Nov 2026): a garage that signs up itself (or is
 * added by the team) with the phone a customer recommended is linked to
 * that recommendation — every customer who gave the number, the first open
 * lead among them Onboarded to it, each customer told once (in the area
 * news' hours). The repository is stood in for by memory; the rules are the
 * real ones (lib/recommendations.ts).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { leadsRepository } = await import('./leads.repository.js')
const { leadsService } = await import('./leads.service.js')
const { pushService } = await import('../push/push.service.js')

type Status = 'new' | 'contacted' | 'joined' | 'declined'
interface Rec {
  id: string
  userId: string | null
  phone: string | null
  status: Status
  vendorId: string | null
  creditStatus: 'owed' | 'granted' | null
  leadId: string | null
  handledBy: string | null
  handledAt: Date | null
}

const GARAGE = 'garage-new'
// 10:00 IST: inside the 09:00–20:59 hours; 22:00 IST outside them.
const DAY = new Date('2026-11-21T10:00:00+05:30')
const NIGHT = new Date('2026-11-21T22:00:00+05:30')

let recs = new Map<string, Rec>()
let leadGarage = new Map<string, string | null>()
let garage: { phone: string; whatsapp: string | null; ownerPhone: string | null } | null = null
let told: Array<{ userId: string; title: string; url: string }> = []

const rec = (patch: Partial<Rec> & { id: string }): Rec => ({
  userId: 'priya',
  phone: '9840123456',
  status: 'new',
  vendorId: null,
  creditStatus: null,
  leadId: null,
  handledBy: null,
  handledAt: null,
  ...patch,
})

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

beforeAll(() => {
  const l = leadsRepository as unknown as Patchable
  patch(l, 'transaction', async (fn: (tx: unknown) => Promise<unknown>) => fn({}))
  patch(l, 'garagePhones', async () => garage)
  patch(l, 'lockRecommendationsByPhones', async (phones: string[]) =>
    [...recs.values()].filter(
      (r) => r.phone && phones.includes(r.phone) && !r.vendorId && !r.creditStatus && (r.status === 'new' || r.status === 'contacted')
    )
  )
  patch(l, 'linkRecommendationsToGarage', async (ids: string[], vendorId: string, handledBy: string, now: Date) =>
    ids.flatMap((id) => {
      const r = recs.get(id)
      if (!r || r.vendorId || r.creditStatus) return []
      recs.set(id, { ...r, vendorId, status: 'joined', handledBy: r.handledBy ?? handledBy, handledAt: r.handledAt ?? now })
      return [{ id, userId: r.userId, leadId: r.leadId }]
    })
  )
  patch(l, 'leadIdOfGarage', async (vendorId: string) =>
    [...leadGarage.entries()].find(([, v]) => v === vendorId)?.[0] ?? null
  )
  patch(l, 'markOnboarded', async (leadId: string, vendorId: string) => {
    if (!leadGarage.has(leadId) || leadGarage.get(leadId)) return false
    leadGarage.set(leadId, vendorId)
    return true
  })
  patch(l, 'lockRecommendationsOfLead', async (leadId: string) =>
    [...recs.values()]
      .filter((r) => r.leadId === leadId)
      .map(({ id, status, vendorId, creditStatus, userId }) => ({ id, status, vendorId, creditStatus, userId }))
  )
  patch(l, 'setRecommendationGarages', async (changes: Array<{ id: string; vendorId: string | null; status: Status }>) => {
    for (const change of changes) recs.set(change.id, { ...recs.get(change.id)!, ...change })
    return changes.length
  })
  patch(l, 'garageForJoinedNotice', async () => ({ businessName: 'Sri Krishna Car Spa', listed: false }))
  patch(pushService, 'notifyLater', (loader: () => Promise<Array<{ recipient: { userId: string }; message: { title: string; url: string } }>>) => {
    void loader().then((sends) => {
      for (const { recipient, message } of sends) told.push({ userId: recipient.userId, title: message.title, url: message.url })
    })
  })
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

beforeEach(() => {
  recs = new Map()
  leadGarage = new Map()
  garage = { phone: '9840123456', whatsapp: null, ownerPhone: '9840123456' }
  told = []
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('a self-signed-up garage with a recommended phone', () => {
  test('every customer who gave the number is linked, joined, signed by the sign-up, and told once', async () => {
    recs.set('a', rec({ id: 'a', userId: 'priya' }))
    recs.set('b', rec({ id: 'b', userId: 'arun', phone: '9840123456' }))
    recs.set('c', rec({ id: 'c', userId: 'priya', phone: '9840123456' }))
    recs.set('other', rec({ id: 'other', userId: 'meena', phone: '9000000000' }))

    expect(await leadsService.linkRecommendationsByPhone(GARAGE, 'Garage sign-up', DAY)).toBe(3)
    await settle()
    for (const id of ['a', 'b', 'c']) {
      expect(recs.get(id)).toMatchObject({ vendorId: GARAGE, status: 'joined', handledBy: 'Garage sign-up', handledAt: DAY })
    }
    expect(recs.get('other')).toMatchObject({ vendorId: null, status: 'new' })
    // Once per customer, whatever they recommended twice.
    expect(told.map((t) => t.userId).sort()).toEqual(['arun', 'priya'])
    expect(told[0]).toMatchObject({ title: 'Sri Krishna Car Spa joined Detlio thanks to you', url: '/garages' })
  })

  test('matched on the WhatsApp or the owner’s number too, normalised', async () => {
    garage = { phone: '044 2490 1234', whatsapp: '+91 98401 23456', ownerPhone: null }
    recs.set('a', rec({ id: 'a' }))
    expect(await leadsService.linkRecommendationsByPhone(GARAGE, 'Garage sign-up', DAY)).toBe(1)
  })

  test('the team’s who and when are kept; its lead is Onboarded to the garage and the lead’s others follow', async () => {
    const handledAt = new Date('2026-11-01T10:00:00+05:30')
    leadGarage.set('lead-1', null)
    recs.set('a', rec({ id: 'a', status: 'contacted', leadId: 'lead-1', handledBy: 'Raga', handledAt }))
    // Made into the same lead, recommended with a Maps link only.
    recs.set('maps', rec({ id: 'maps', userId: 'kavya', phone: null, status: 'contacted', leadId: 'lead-1', handledBy: 'Raga', handledAt }))

    await leadsService.linkRecommendationsByPhone(GARAGE, 'Garage sign-up', DAY)
    await settle()
    expect(recs.get('a')).toMatchObject({ vendorId: GARAGE, status: 'joined', handledBy: 'Raga', handledAt })
    expect(leadGarage.get('lead-1')).toBe(GARAGE)
    expect(recs.get('maps')).toMatchObject({ vendorId: GARAGE, status: 'joined' })
    expect(told.map((t) => t.userId).sort()).toEqual(['kavya', 'priya'])
  })

  test('a garage that already has a lead keeps it: no second lead is Onboarded', async () => {
    leadGarage.set('its-own', GARAGE)
    leadGarage.set('lead-1', null)
    recs.set('a', rec({ id: 'a', status: 'contacted', leadId: 'lead-1', handledBy: 'Raga', handledAt: DAY }))
    await leadsService.linkRecommendationsByPhone(GARAGE, 'Garage sign-up', DAY)
    expect(leadGarage.get('lead-1')).toBeNull()
    expect(recs.get('a')).toMatchObject({ vendorId: GARAGE, status: 'joined' })
  })

  test('never moved: dismissed, already joined elsewhere, credit decided', async () => {
    recs.set('declined', rec({ id: 'declined', status: 'declined' }))
    recs.set('elsewhere', rec({ id: 'elsewhere', status: 'joined', vendorId: 'garage-old' }))
    recs.set('credited', rec({ id: 'credited', status: 'joined', vendorId: 'garage-old', creditStatus: 'owed' }))
    expect(await leadsService.linkRecommendationsByPhone(GARAGE, 'Garage sign-up', DAY)).toBe(0)
    expect(recs.get('elsewhere')!.vendorId).toBe('garage-old')
    expect(told).toEqual([])
  })

  test('outside 09:00–20:59 IST the link is made, and nobody is woken', async () => {
    recs.set('a', rec({ id: 'a' }))
    expect(await leadsService.linkRecommendationsByPhone(GARAGE, 'Garage sign-up', NIGHT)).toBe(1)
    await settle()
    expect(recs.get('a')!.status).toBe('joined')
    expect(told).toEqual([])
  })

  test('a garage with no mobile number to match: nothing read or linked', async () => {
    garage = { phone: '044 2490 1234', whatsapp: null, ownerPhone: null }
    recs.set('a', rec({ id: 'a' }))
    expect(await leadsService.linkRecommendationsByPhone(GARAGE, 'Garage sign-up', DAY)).toBe(0)
    expect(recs.get('a')!.status).toBe('new')
  })
})

describe('the admin panel’s “Brought in by”', () => {
  test('each garage’s customers, with their ₹500 paid, owed or waiting', async () => {
    patch(leadsRepository as unknown as Patchable, 'listJoinedRecommendations', async () => [
      { id: 'r1', vendor_id: GARAGE, credit_status: null, credit_amount: null, customer_name: 'Priya Raman', has_user: true, created_at: DAY },
      { id: 'r2', vendor_id: GARAGE, credit_status: 'granted', credit_amount: '500.00', customer_name: 'Arun', has_user: true, created_at: DAY },
      { id: 'r3', vendor_id: 'g2', credit_status: 'owed', credit_amount: '500.00', customer_name: null, has_user: false, created_at: DAY },
    ])
    const byGarage = await leadsService.broughtInByGarage()
    expect(byGarage.get(GARAGE)).toEqual([
      { recommendationId: 'r1', customerName: 'Priya Raman', credit: 'waiting', amountRupees: 500, recommendedAt: DAY.toISOString() },
      { recommendationId: 'r2', customerName: 'Arun', credit: 'paid', amountRupees: 500, recommendedAt: DAY.toISOString() },
    ])
    expect(byGarage.get('g2')).toEqual([
      { recommendationId: 'r3', customerName: null, credit: 'owed', amountRupees: 500, recommendedAt: DAY.toISOString() },
    ])
  })
})
