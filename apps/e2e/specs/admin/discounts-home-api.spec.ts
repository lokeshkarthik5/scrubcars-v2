/**
 * "Show on Home" on a promo code, at the admin API: the form's settings, the
 * Home fields on a code, and the whole-row rules a PATCH of one field is
 * judged by, and the form's "Estimated reach". The form itself is
 * specs/admin/discounts-home.spec.ts.
 *
 * Every write here is refused, so no row changes: DISCOUNTS.homeBooked is
 * read by the customer Home spec running alongside.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { DISCOUNTS, VENDORS } from '../../support/seed-ids'

const DISCOUNTS_URL = `${API}/api/v1/admin/discounts`
const DAY = 24 * 60 * 60 * 1000

test.use({ storageState: asRole('admin') })

test.describe('offers on Home, for admins @p0', () => {
  test("the form's settings, with targeting on in this stack", async ({ page }) => {
    const response = await page.request.get(`${DISCOUNTS_URL}/home-config`)
    expect(response.status()).toBe(200)
    const { data } = await response.json()
    expect(data).toMatchObject({
      targetingEnabled: true,
      targetingNote: null,
      maxOffersOnHome: 3,
      priorities: [
        { value: 0, label: 'Normal' },
        { value: 1, label: 'High' },
        { value: 2, label: 'Top' },
      ],
      defaultNearRadiusKm: 10,
    })
    expect(data.audiences.map((a: { value: string }) => a.value)).toEqual([
      'everyone',
      'new_customers',
      'booked_this_garage',
      'near_this_garage',
      'wash_due',
      'car_type',
    ])
  })

  test("a code's Home fields", async ({ page }) => {
    const { data } = await (await page.request.get(`${DISCOUNTS_URL}/${DISCOUNTS.homeBooked.id}`)).json()
    expect(data).toMatchObject({
      code: DISCOUNTS.homeBooked.code,
      showOnHome: true,
      homeTitle: DISCOUNTS.homeBooked.homeTitle,
      homePriority: 2,
      homeAudience: 'booked_this_garage',
      homeAudienceRadiusKm: null,
      homeAudienceVehicleTypes: null,
      vendorId: VENDORS.homePromo.id,
    })
  })

  test('judged as a whole: a shown code keeps its end date, title and garage', async ({ page }) => {
    const patch = (data: object) => page.request.patch(`${DISCOUNTS_URL}/${DISCOUNTS.homeBooked.id}`, { data })

    const noEnd = await patch({ endsAt: null })
    expect(noEnd.status()).toBe(400)
    expect(await noEnd.json()).toEqual({
      success: false,
      message: 'An offer on Home needs an end date, so the card can say when it ends.',
      code: 'DISCOUNT_HOME_INVALID',
    })

    expect((await (await patch({ homeTitle: null })).json()).code).toBe('DISCOUNT_HOME_INVALID')
    // "Customers who booked this garage" needs the code to be for one garage.
    expect((await (await patch({ vendorId: null })).json()).code).toBe('DISCOUNT_HOME_INVALID')
    // Only three levels.
    expect((await patch({ homePriority: 5 })).status()).toBe(400)

    const hype = await patch({ homeTitle: 'Guaranteed shine, 25% off' })
    expect(hype.status()).toBe(400)
    expect((await hype.json()).code).toBe('COPY_NOT_ALLOWED')

    // None of it was written.
    const { data } = await (await page.request.get(`${DISCOUNTS_URL}/${DISCOUNTS.homeBooked.id}`)).json()
    expect(data).toMatchObject({ homeTitle: DISCOUNTS.homeBooked.homeTitle, vendorId: VENDORS.homePromo.id })
    expect(data.endsAt).not.toBeNull()
  })

  test("estimated reach, counted by Home's own rule", async ({ page }) => {
    const reach = (params: Record<string, string>) =>
      page.request.get(`${DISCOUNTS_URL}/home-reach?${new URLSearchParams(params)}`)

    const everyone = await reach({ audience: 'everyone' })
    expect(everyone.status()).toBe(200)
    const { data } = await everyone.json()
    expect(data.count).toBeGreaterThan(0)
    expect(data).toMatchObject({ garagePublic: null, measuredFrom: null })

    // CUSTOMERS.homeOffer (and other Home fixtures) have a paid job at
    // HOME_PROMO; nobody outside them books it, so this is never everyone.
    const booked = await (
      await reach({ audience: 'booked_this_garage', vendorId: VENDORS.homePromo.id })
    ).json()
    expect(booked.data.count).toBeGreaterThan(0)
    expect(booked.data.count).toBeLessThan(data.count)
    expect(booked.data.garagePublic).toBe(true)

    const near = await (
      await reach({ audience: 'near_this_garage', vendorId: VENDORS.homePromo.id, radiusKm: '5' })
    ).json()
    expect(near.data.measuredFrom).toBe('saved_addresses')

    // The wash-due count runs its own SQL (last wash per car, any booking
    // ahead). CUSTOMERS.homeWash's second car was washed 13 days ago on a
    // 10-day interval with nothing booked, so at least one customer is due.
    const due = await reach({ audience: 'wash_due' })
    expect(due.status()).toBe(200)
    expect((await due.json()).data.count).toBeGreaterThanOrEqual(1)

    // Car types, as the form sends them: comma-separated.
    const byType = await reach({ audience: 'car_type', vehicleTypes: 'sedan,suv' })
    expect(byType.status()).toBe(200)
    expect((await byType.json()).data.count).toBeGreaterThanOrEqual(1)

    // Refused as a save would be.
    const noGarage = await reach({ audience: 'booked_this_garage' })
    expect(noGarage.status()).toBe(400)
    expect(await noGarage.json()).toEqual({
      success: false,
      message: 'This audience needs the code to be for one garage.',
      code: 'DISCOUNT_HOME_INVALID',
    })
    expect((await reach({ audience: 'car_type' })).status()).toBe(400)
  })

  test('a new code shown on Home needs a title and an end date', async ({ page }) => {
    const base = {
      code: 'HUBNEVERSAVED',
      discountType: 'percentage',
      percentOff: 10,
      showOnHome: true,
    }
    const noEnd = await page.request.post(DISCOUNTS_URL, { data: { ...base, homeTitle: '10% off any wash' } })
    expect(noEnd.status()).toBe(400)
    expect((await noEnd.json()).code).toBe('DISCOUNT_HOME_INVALID')

    const carTypeWithout = await page.request.post(DISCOUNTS_URL, {
      data: {
        ...base,
        homeTitle: '10% off any wash',
        endsAt: new Date(Date.now() + 7 * DAY).toISOString(),
        homeAudience: 'car_type',
      },
    })
    expect(carTypeWithout.status()).toBe(400)
    expect(await carTypeWithout.json()).toEqual({
      success: false,
      message: 'Pick at least one car type.',
      code: 'DISCOUNT_HOME_INVALID',
    })
  })
})
