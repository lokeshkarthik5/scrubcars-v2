/**
 * Onboarding marks and collection lists (0059), at the admin API: the
 * missing keys on the Garages list and the editor, the marks' rules, and a
 * collection list from Send to team through ticking an item.
 *
 * VENDORS.marksA and marksB miss exactly what e2e-ids.ts says. The marks UI
 * spec (onboarding-marks.spec.ts) works the same garages at the same time,
 * so this one makes marks only on marksB (the UI spec deletes and counts
 * marks on marksA alone), sticks to kinds marksB does not miss (its logo
 * and hours, which the UI never offers) and custom marks, and deletes what
 * it made. Its collection list is closed at the end, whatever happens.
 */
import { request, type APIRequestContext } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { ADMIN_LOGINS, VENDORS } from '../../support/seed-ids'

const ADMIN = `${API}/api/v1/admin`
const A = VENDORS.marksA.id
const B = VENDORS.marksB.id

test.use({ storageState: asRole('admin') })

/** A fresh API session for one login. */
async function signIn(
  username: string,
  password: string
): Promise<APIRequestContext> {
  const ctx = await request.newContext({
    baseURL: API,
    storageState: { cookies: [], origins: [] },
  })
  const res = await ctx.post('/api/v1/admin/login', {
    data: { username, password },
  })
  expect(res.status()).toBe(200)
  return ctx
}

test.describe('onboarding marks API @p0', () => {
  test('missing keys on the Garages list and the editor, separate from readiness', async ({
    page,
  }) => {
    const list = await page.request.get(`${ADMIN}/vendors`)
    expect(list.status()).toBe(200)
    const vendors = (await list.json()).data as Array<Record<string, unknown>>
    const a = vendors.find((v) => v.id === A)!
    const b = vendors.find((v) => v.id === B)!
    expect(a.missing).toEqual(['photos', 'logo', 'radius_default', 'payout'])
    expect(b.missing).toEqual(['photos', 'bays'])
    expect(b.onboardedByName).toBe(VENDORS.marksB.onboardedByName)
    expect(a.onboardedByName).toBeNull()
    for (const v of [a, b]) {
      expect(v.live).toBe(true)
      expect(Array.isArray(v.openMarks)).toBe(true)
      expect(Array.isArray(v.readiness)).toBe(true)
      expect(v).toHaveProperty('openCollection')
    }

    for (const [id, missing] of [
      [A, ['photos', 'logo', 'radius_default', 'payout']],
      [B, ['photos', 'bays']],
    ] as const) {
      const detail = (
        await (await page.request.get(`${ADMIN}/vendors/${id}`)).json()
      ).data
      expect(detail.missing).toEqual(missing)
      // The same checklist the list carries.
      expect(detail.readiness).toEqual(
        vendors.find((v) => v.id === id)!.readiness
      )
    }
  })

  test('a mark is made, moved and deleted, signed by the session; a second open one is 409', async ({
    page,
  }) => {
    const base = `${ADMIN}/vendors/${B}/marks`
    const made = await page.request.post(base, {
      data: {
        kind: 'logo',
        note: 'Ask for the shop sign',
        actorName: 'Not me',
      },
    })
    expect(made.status()).toBe(201)
    const mark = (await made.json()).data
    expect(mark).toMatchObject({
      vendorId: B,
      kind: 'logo',
      label: 'Logo',
      status: 'to_ask',
      createdByName: ADMIN_LOGINS.e2e.name,
    })

    try {
      const again = await page.request.post(base, { data: { kind: 'logo' } })
      expect(again.status()).toBe(409)
      expect((await again.json()).code).toBe('MARK_EXISTS')

      const asked = (
        await (
          await page.request.patch(`${base}/${mark.id}`, {
            data: { status: 'asked' },
          })
        ).json()
      ).data
      expect(asked).toMatchObject({
        status: 'asked',
        askedByName: ADMIN_LOGINS.e2e.name,
        updatedByName: ADMIN_LOGINS.e2e.name,
      })
      expect(asked.askedAt).not.toBeNull()
      const undone = (
        await (
          await page.request.patch(`${base}/${mark.id}`, {
            data: { status: 'to_ask' },
          })
        ).json()
      ).data
      expect(undone).toMatchObject({
        status: 'to_ask',
        askedAt: null,
        askedByName: null,
      })

      // A custom mark needs a label, and any number of them may be open.
      expect(
        (await page.request.post(base, { data: { kind: 'custom' } })).status()
      ).toBe(400)

      // Open marks show on the Garages list.
      const vendors = (
        await (await page.request.get(`${ADMIN}/vendors`)).json()
      ).data as Array<{ id: string; openMarks: Array<{ id: string }> }>
      expect(
        vendors.find((v) => v.id === B)!.openMarks.map((m) => m.id)
      ).toContain(mark.id)
    } finally {
      const gone = await page.request.delete(`${base}/${mark.id}`, { data: {} })
      expect(gone.status()).toBe(200)
    }
    const marks = (await (await page.request.get(base)).json()).data as Array<{
      id: string
    }>
    expect(marks.map((m) => m.id)).not.toContain(mark.id)
  })

  test('bulk Asked moves the named marks and makes the missing key’s', async ({
    page,
  }) => {
    const base = `${ADMIN}/vendors/${B}/marks`
    const custom = (
      await (
        await page.request.post(base, {
          data: { kind: 'custom', label: 'Call back (API spec)' },
        })
      ).json()
    ).data
    const made: string[] = [custom.id]
    try {
      const res = await page.request.post(`${ADMIN}/onboarding-marks/asked`, {
        data: {
          garages: [{ vendorId: B, kinds: ['hours'], markIds: [custom.id] }],
        },
      })
      expect(res.status()).toBe(200)
      const marks = (await res.json()).data.marks as Array<{
        id: string
        kind: string
        status: string
        askedByName: string
      }>
      made.push(...marks.map((m) => m.id))
      expect(marks.map((m) => m.kind).sort()).toEqual(['custom', 'hours'])
      for (const m of marks)
        expect(m).toMatchObject({
          status: 'asked',
          askedByName: ADMIN_LOGINS.e2e.name,
        })
    } finally {
      for (const id of new Set(made))
        await page.request.delete(`${base}/${id}`, { data: {} })
    }
  })

  test('a collection list for E2E Collector: listed, ticked, its progress; mine vs all', async ({
    page,
  }) => {
    const created = await page.request.post(`${ADMIN}/collection-lists`, {
      data: {
        sendTelegram: false,
        lists: [
          {
            assigneeLoginId: ADMIN_LOGINS.collector.id,
            assigneeName: ADMIN_LOGINS.collector.name,
            note: 'API spec list',
            garages: [
              { vendorId: A, kinds: ['photos', 'payout'] },
              // marksB has a logo: already cleared.
              { vendorId: B, kinds: ['bays', 'logo'] },
            ],
          },
        ],
      },
    })
    expect(created.status()).toBe(201)
    const [list] = (await created.json()).data.lists
    // Closed whatever happens below, so a failure leaves no open list behind.
    let collector: APIRequestContext | undefined
    try {
      expect(list).toMatchObject({
        assigneeLoginId: ADMIN_LOGINS.collector.id,
        assigneeName: ADMIN_LOGINS.collector.name,
        createdByName: ADMIN_LOGINS.e2e.name,
        telegramSentAt: null,
        open: true,
        progress: { done: 1, total: 4 },
      })
      expect(list.garages.map((g: { id: string }) => g.id)).toEqual([A, B])
      const garageA = list.garages[0]
      expect(garageA).toMatchObject({
        businessName: VENDORS.marksA.name,
        ownerPhone: '9000004151',
        // Pinned outside the service city: its area is its city.
        area: 'Chennai',
      })
      expect(garageA.mapsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\//)
      expect(
        list.items.find((i: { kind: string }) => i.kind === 'logo').cleared
      ).toBe(true)

      collector = await signIn(
        ADMIN_LOGINS.collector.username,
        ADMIN_LOGINS.collector.password
      )
      const all = (
        await (
          await page.request.get(
            `${ADMIN}/collection-lists?scope=all&open=true`
          )
        ).json()
      ).data.lists
      expect(all.map((l: { id: string }) => l.id)).toContain(list.id)
      // Not E2E Admin's own list; the collector's.
      const adminMine = (
        await (
          await page.request.get(`${ADMIN}/collection-lists?scope=mine`)
        ).json()
      ).data.lists
      expect(adminMine.map((l: { id: string }) => l.id)).not.toContain(list.id)
      const theirs = (
        await (
          await collector.get('/api/v1/admin/collection-lists?scope=mine')
        ).json()
      ).data.lists
      expect(theirs.map((l: { id: string }) => l.id)).toContain(list.id)

      const photos = list.items.find(
        (i: { vendorId: string; kind: string }) =>
          i.vendorId === A && i.kind === 'photos'
      )
      const ticked = await collector.patch(
        `/api/v1/admin/collection-items/${photos.id}`,
        {
          data: { status: 'collected', note: 'Got 3 photos' },
        }
      )
      expect(ticked.status()).toBe(200)
      expect((await ticked.json()).data).toMatchObject({
        status: 'collected',
        collectedByName: ADMIN_LOGINS.collector.name,
        note: 'Got 3 photos',
      })
      const after = (
        await (
          await page.request.get(`${ADMIN}/collection-lists?scope=all`)
        ).json()
      ).data.lists
      expect(
        after.find((l: { id: string }) => l.id === list.id).progress
      ).toEqual({ done: 2, total: 4 })

      // The Garages list carries each garage's place on an open list (the
      // one due first where it still has things left, which may be another
      // spec's).
      const vendors = (
        await (await page.request.get(`${ADMIN}/vendors`)).json()
      ).data as Array<{ id: string; openCollection: unknown }>
      expect(vendors.find((v) => v.id === A)!.openCollection).toMatchObject({
        listId: expect.any(String),
        total: expect.any(Number),
      })
    } finally {
      const closed = await page.request.post(
        `${ADMIN}/collection-lists/${list.id}/close`,
        { data: {} }
      )
      expect(closed.status()).toBe(200)
      expect((await closed.json()).data).toMatchObject({
        id: list.id,
        open: false,
      })
      await collector?.dispose()
    }
  })
})
