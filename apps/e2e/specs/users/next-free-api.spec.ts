/**
 * "Next free" at the API (customer UI round, Nov 2026, §9):
 * GET /vendors/next-free answers up to 20 garages in one ask, each with the
 * first day this week that has a time for the job checkout books from a
 * card, and up to three of its times; null for a garage with none to offer.
 * Public, and kept by the browser for a minute (Cache-Control). The garage's
 * own public reads carry their half-minute header beside it (speed fix 6).
 *
 * Read-only: nothing here books.
 */
import { request } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API } from '../../support/auth'
import { VENDORS } from '../../support/seed-ids'

const NEXT_FREE = `${API}/api/v1/vendors/next-free`
/** Never a garage. */
const NOBODY = '00000000-0000-4000-8000-999999999999'

test.describe('next free times API @p0', () => {
  test('one ask, a key for every garage: times for an open garage, null for a paused one and an unknown id', async () => {
    const guest = await request.newContext()
    const ids = [VENDORS.main.id, VENDORS.paused.id, NOBODY]
    const response = await guest.get(NEXT_FREE, { params: { ids: ids.join(','), bookingType: 'dropin' } })
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toBe('public, max-age=60')

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(Object.keys(body.data).sort()).toEqual([...ids].sort())

    // Open 06:00–22:00 every day: always something this week.
    const main = body.data[VENDORS.main.id] as { day: string; times: string[] }
    expect(main.day).toMatch(/^(today|tomorrow|\d{4}-\d{2}-\d{2})$/)
    expect(main.times.length).toBeGreaterThan(0)
    expect(main.times.length).toBeLessThanOrEqual(3)
    const starts = main.times.map((time) => Date.parse(time))
    for (const start of starts) expect(start).toBeGreaterThan(Date.now())
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)

    expect(body.data[VENDORS.paused.id]).toBeNull()
    expect(body.data[NOBODY]).toBeNull()
    await guest.dispose()
  })

  test('at most 20 garages an ask, in the API envelope', async () => {
    const guest = await request.newContext()
    const many = Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

    const tooMany = await guest.get(NEXT_FREE, { params: { ids: many.join(',') } })
    expect(tooMany.status()).toBe(400)
    expect(await tooMany.json()).toMatchObject({ success: false, code: 'TOO_MANY_GARAGES' })

    // Twenty is fine, and an id asked twice counts once.
    const twenty = await guest.get(NEXT_FREE, { params: { ids: [...many.slice(0, 20), many[0]].join(',') } })
    expect(twenty.status()).toBe(200)
    expect(Object.keys((await twenty.json()).data)).toHaveLength(20)

    // Not an id at all.
    expect((await guest.get(NEXT_FREE, { params: { ids: 'not-an-id' } })).status()).toBe(400)
    await guest.dispose()
  })

  test("a garage's public reads may be kept by the browser for half a minute", async () => {
    const guest = await request.newContext()
    const read = await guest.get(`${API}/api/v1/vendors/${VENDORS.main.id}`)
    expect(read.status()).toBe(200)
    expect(read.headers()['cache-control']).toBe('public, max-age=30, stale-while-revalidate=300')
    // Never a shared cache's: no s-maxage.
    expect(read.headers()['cache-control']).not.toContain('s-maxage')
    // An error is never kept.
    const missing = await guest.get(`${API}/api/v1/vendors/${NOBODY}`)
    expect(missing.status()).toBe(404)
    expect(missing.headers()['cache-control'] ?? '').not.toContain('max-age')
    await guest.dispose()
  })
})
