/**
 * Job photo standards (0045), across the customer app, the garage portal and
 * the API, at VENDORS.photos (fixtures in the reserved 2500–2599 range).
 *
 * The standard is off for every other garage in E2E (JOB_PHOTOS_REQUIRED=off
 * in .env.e2e) and on for this one (JOB_PHOTOS_REQUIRED_GARAGES), so no
 * other spec's Start or Complete waits for photos.
 *
 * The customer adds a before photo of their car from the booking page. The
 * garage sees it, but cannot start the job — the button is off and says
 * "Add 2 before photos to start.", and the API refuses too — until it has
 * photographed the car from two guided angles; then it starts. The customer
 * then sees the garage's photos, and their own before photos are closed.
 * Storage is the suite's MinIO, so every upload is a real presigned PUT.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../../support/fixtures'
import { API } from '../../support/auth'
import { getBooking, getJobPhotos } from '../../support/db'
import { openActors } from '../../support/journey'
import { BOOKINGS, CUSTOMERS, VENDORS } from '../../support/seed-ids'

const PIXEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/pixel.png')

test.describe.configure({ mode: 'serial' })

const GARAGE = VENDORS.photos.id
const BOOKING = BOOKINGS.photosJob

const byRole = async (role: 'garage' | 'customer') =>
  (await getJobPhotos(BOOKING)).filter((photo) => photo.uploaded_by_role === role)

test.describe('job photo standards @p0', () => {
  test('the garage cannot start without 2 before photos, then can; the customer adds a before photo and sees the garage’s', async ({
    browser,
  }) => {
    const { customer, vendor, vendorCtx, close } = await openActors(
      browser,
      'customer-photos',
      GARAGE,
      'vendor-photos'
    )
    const name = CUSTOMERS.photos.name

    // ── the customer: a before photo of their car, from a guided angle ─────
    await customer.goto(`/bookings/${BOOKING}`)
    await expect(customer.getByRole('heading', { name: "Your car's condition" })).toBeVisible()
    await customer.getByLabel('Add a front photo of your car, before the work').setInputFiles(PIXEL)
    await expect.poll(async () => (await byRole('customer')).length).toBe(1)
    const [mine] = await byRole('customer')
    expect(mine.stage).toBe('before')
    expect(mine.angle).toBe('front')
    // In the customer's own folder of the job, never the garage's.
    expect(mine.storage_key).toMatch(
      new RegExp(`^vendors/${GARAGE}/job-photos/${BOOKING}/customer/[0-9a-f-]+\\.(png|jpg)$`)
    )
    await expect(customer.getByRole('button', { name: 'View your front photo, before the work' })).toBeVisible()
    // The garage's photos are not shown before the work starts (it has none yet).
    await expect(customer.getByRole('heading', { name: 'Job photos' })).toHaveCount(0)

    // ── the garage: Start waits for two before photos ──────────────────────
    await vendor.goto('/bookings?tab=upcoming')
    const start = vendor.getByRole('button', { name: `Mark booking for ${name} in progress` })
    await expect(start).toBeDisabled()
    await expect(vendor.getByText('Add 2 before photos to start.')).toBeVisible()
    // The customer's photo is on the garage's card too: one record.
    await expect(vendor.getByRole('button', { name: "View customer's before photo 1" })).toBeVisible()

    // The API holds the same rule, whatever the button says.
    const early = await vendorCtx.request.patch(`${API}/api/v1/bookings/${BOOKING}/progress`, {
      headers: { 'X-Vendor-Id': GARAGE },
    })
    expect(early.status()).toBe(409)
    expect(await early.json()).toMatchObject({
      success: false,
      code: 'JOB_PHOTOS_REQUIRED',
      message: 'Add 2 before photos to start.',
    })
    expect((await getBooking(BOOKING))?.status).toBe('confirmed')

    // The customer's photo does not count toward the garage's two.
    await vendor.getByLabel(`Add front before photo for ${name}`).setInputFiles(PIXEL)
    await expect.poll(async () => (await byRole('garage')).length).toBe(1)
    await expect(vendor.getByText('Add 1 more before photo to start.')).toBeVisible()
    await expect(start).toBeDisabled()

    await vendor.getByLabel(`Add back before photo for ${name}`).setInputFiles(PIXEL)
    await expect.poll(async () => (await byRole('garage')).length).toBe(2)
    const garage = await byRole('garage')
    expect(garage.map((photo) => photo.angle).sort()).toEqual(['back', 'front'])
    expect(garage.every((photo) => photo.storage_key.startsWith(`vendors/${GARAGE}/job-photos/${BOOKING}/`))).toBe(true)
    expect(garage.some((photo) => photo.storage_key.includes('/customer/'))).toBe(false)

    await expect(start).toBeEnabled()
    await start.click()
    await expect.poll(async () => (await getBooking(BOOKING))?.status).toBe('in_progress')

    // ── the customer: the garage's photos, and their own before photos closed
    await customer.reload()
    await expect(customer.getByRole('heading', { name: 'Job photos' })).toBeVisible()
    await expect(customer.getByRole('button', { name: /^View before photo [12] of 2$/ })).toHaveCount(2)
    await expect(customer.getByRole('button', { name: 'View your front photo, before the work' })).toBeVisible()
    await expect(customer.getByLabel('Add a back photo of your car, before the work')).toHaveCount(0)

    // And the API refuses a late before photo from them.
    const late = await customer.request.post(`${API}/api/v1/bookings/${BOOKING}/photos/upload-url`, {
      data: { stage: 'before', contentType: 'image/jpeg' },
    })
    expect(late.status()).toBe(400)
    expect((await late.json()).code).toBe('JOB_PHOTO_WINDOW_CLOSED')

    await close()
  })
})
