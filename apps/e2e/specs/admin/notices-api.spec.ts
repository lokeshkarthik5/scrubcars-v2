/**
 * Team notices, at the admin API: write one, see who it reaches, and End now
 * on a live notice and on a scheduled one. The admin screens arrive in a
 * later PR.
 *
 * Nothing here is ever a live notice for everyone: that would reach every
 * customer's Home in every parallel spec. The 'all' notice made here starts
 * a month from now; the live one is about bookings at VENDORS.homePromo in
 * half a year, which nobody has.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { BOOKINGS, VENDORS } from '../../support/seed-ids'
import { sql } from '../../support/db'

const NOTICES = `${API}/api/v1/admin/notices`
const DAY = 24 * 60 * 60 * 1000
const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString()

test.use({ storageState: asRole('admin') })

test.describe('team notices @p0', () => {
  test('a scheduled notice for everyone, switched off by End now', async ({ page }) => {
    const created = await page.request.post(NOTICES, {
      data: {
        title: 'Diwali hours',
        body: 'Some garages close early on Diwali. Check the slot before you book.',
        audience: 'all',
        startsAt: fromNow(30 * DAY),
        endsAt: fromNow(32 * DAY),
        linkUrl: '/bookings',
        linkLabel: 'My bookings',
      },
    })
    expect(created.status()).toBe(201)
    const { data: notice } = await created.json()
    expect(notice).toMatchObject({
      audience: 'all',
      state: 'scheduled',
      isActive: true,
      vendorId: null,
      bookingFrom: null,
      dismissals: 0,
      createdBy: 'admin',
    })

    // Ending it before it starts switches it off; its dates are untouched,
    // because an end before the start is a row the database refuses.
    const ended = await page.request.post(`${NOTICES}/${notice.id}/end`)
    expect(ended.status()).toBe(200)
    expect((await ended.json()).data).toMatchObject({
      isActive: false,
      state: 'ended',
      startsAt: notice.startsAt,
      endsAt: notice.endsAt,
    })

    const listed = await (await page.request.get(`${NOTICES}?status=ended`)).json()
    expect(listed.data.map((row: { id: string }) => row.id)).toContain(notice.id)
  })

  test('a live booking-window notice ends now', async ({ page }) => {
    const created = await page.request.post(NOTICES, {
      data: {
        title: 'Slot may move: rain',
        body: 'Heavy rain is forecast. The garage may call you to move your time.',
        audience: 'with_booking_between',
        vendorId: VENDORS.homePromo.id,
        bookingFrom: fromNow(200 * DAY),
        bookingTo: fromNow(201 * DAY),
        endsAt: fromNow(3 * DAY),
      },
    })
    expect(created.status()).toBe(201)
    const { data: notice } = await created.json()
    expect(notice).toMatchObject({ state: 'live', vendorId: VENDORS.homePromo.id, vendorName: VENDORS.homePromo.name })

    const before = Date.now()
    const ended = await page.request.post(`${NOTICES}/${notice.id}/end`)
    expect(ended.status()).toBe(200)
    const { data } = await ended.json()
    expect(data).toMatchObject({ state: 'ended', isActive: true })
    expect(Date.parse(data.endsAt)).toBeGreaterThanOrEqual(before - 5_000)
    expect(Date.parse(data.endsAt)).toBeLessThanOrEqual(Date.now() + 5_000)
  })

  test('who a notice reaches, before it is saved', async ({ page }) => {
    const [slot] = await sql<{ scheduled_at: Date }[]>`
      select scheduled_at from bookings where id = ${BOOKINGS.homeNoticeUpcoming}
    `
    const around = (ms: number) => new Date(slot.scheduled_at.getTime() + ms).toISOString()
    const params = new URLSearchParams({
      audience: 'with_booking_between',
      vendorId: VENDORS.homePromo.id,
      bookingFrom: around(-60 * 60 * 1000),
      bookingTo: around(60 * 60 * 1000),
    })
    const reach = await page.request.get(`${NOTICES}/audience-count?${params}`)
    expect(reach.status()).toBe(200)
    // CUSTOMERS.homeNotice's booking is in the window; nobody else books there.
    expect((await reach.json()).data).toEqual({ count: 1 })

    const everyone = await (await page.request.get(`${NOTICES}/audience-count?audience=all`)).json()
    expect(everyone.data.count).toBeGreaterThan(1)
  })

  test('a notice that does not hold together is refused', async ({ page }) => {
    const base = {
      title: 'Slot may move: rain',
      body: 'Heavy rain is forecast.',
      audience: 'all',
      startsAt: fromNow(30 * DAY),
      endsAt: fromNow(31 * DAY),
    }

    // A protocol-relative link would leave the app.
    expect((await page.request.post(NOTICES, { data: { ...base, linkUrl: '//evil.com', linkLabel: 'Open' } })).status()).toBe(400)
    // Nor may a backslash: browsers read /\evil.com as //evil.com.
    expect((await page.request.post(NOTICES, { data: { ...base, linkUrl: '/\\evil.com', linkLabel: 'Open' } })).status()).toBe(400)

    const noEnd = await page.request.post(NOTICES, {
      data: { ...base, audience: 'with_booking_between', bookingFrom: fromNow(DAY) },
    })
    expect(noEnd.status()).toBe(400)
    expect(await noEnd.json()).toEqual({
      success: false,
      message: 'Give both ends of the booking window.',
      code: 'NOTICE_INVALID',
    })

    const promise = await page.request.post(NOTICES, {
      data: { ...base, body: "Book today and we'll notify you when it is done." },
    })
    expect(promise.status()).toBe(400)
    expect((await promise.json()).code).toBe('COPY_NOT_ALLOWED')

    // The link's label is customer copy too: it is the notice's button.
    const label = await page.request.post(NOTICES, {
      data: { ...base, linkUrl: '/help', linkLabel: 'Get certified detailing' },
    })
    expect(label.status()).toBe(400)
    expect((await label.json()).code).toBe('COPY_NOT_ALLOWED')
  })
})
