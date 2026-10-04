/**
 * The garage's own controls over when it can be booked: how many cars at once,
 * days off, and pausing altogether — and the one thing it must not be able to
 * do, delete a service a customer has already booked.
 *
 * Runs as STAFF.scheduleOwner on the scheduling garages, which no booking spec
 * touches: pausing MAIN for even a moment would fail half the suite.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi, setActiveVendor } from '../../support/auth'
import { sql } from '../../support/db'
import { SERVICES, STAFF, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('vendor-schedule') })

/** An IST date some days out, the way the date input and the API write it. */
const istDate = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  })

// Whatever a failed run left behind, TIME_OFF goes back to an ordinary garage.
test.afterAll(async () => {
  await sql`delete from vendor_closures where vendor_id = ${VENDORS.timeOff.id}`
  await sql`
    update vendors
       set bookings_paused_at = null, bookings_paused_reason = null, bays = null, jobs_per_day = null
     where id = ${VENDORS.timeOff.id}
  `
})

test.describe('time off in the garage portal @p0', () => {
  test('a holiday can be added and removed, and customers see it', async ({ page, context, request }) => {
    await setActiveVendor(context, VENDORS.timeOff.id)
    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Time off' }).click()

    const date = istDate(10)
    await page.getByLabel('Date', { exact: true }).fill(date)
    // Exact: the pause reason's label starts with the same words.
    await page.getByLabel('Reason (optional)', { exact: true }).fill('Pongal')
    await page.getByRole('button', { name: 'Add holiday' }).click()

    const closures = async () =>
      sql<{ date: string; reason: string | null }[]>`
        select to_char(date, 'YYYY-MM-DD') as date, reason
          from vendor_closures where vendor_id = ${VENDORS.timeOff.id}
      `
    await expect.poll(closures).toEqual([{ date, reason: 'Pongal' }])

    // The customer's picker reads the same row.
    const publicClosures = await request.get(`${API}/api/v1/vendors/${VENDORS.timeOff.id}/closures`)
    expect((await publicClosures.json()).data).toContain(date)

    // Nobody had booked that day, so there is nobody to warn about.
    await expect(page.getByText(/bookings? that day/)).toHaveCount(0)

    await page.getByRole('button', { name: /^Remove holiday on/ }).click()
    await expect.poll(closures).toEqual([])
  })

  test('new bookings can be paused and resumed', async ({ page, context }) => {
    await setActiveVendor(context, VENDORS.timeOff.id)
    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Time off' }).click()

    const pause = page.getByRole('switch', { name: 'Pause new bookings' })
    await expect(pause).toHaveAttribute('aria-checked', 'false')

    await page.getByLabel('Reason (optional, customers see this)').fill('Away for a wedding')
    await pause.click()

    await expect(page.getByText(/Paused since/)).toBeVisible()
    await expect(pause).toHaveAttribute('aria-checked', 'true')
    const state = async () => {
      const [row] = await sql<{ paused: boolean; reason: string | null }[]>`
        select bookings_paused_at is not null as paused, bookings_paused_reason as reason
          from vendors where id = ${VENDORS.timeOff.id}
      `
      return row
    }
    await expect.poll(state).toEqual({ paused: true, reason: 'Away for a wedding' })

    // The reason stays editable while paused, without resuming first.
    await page.getByLabel('Reason (optional, customers see this)').fill('Back on Monday')
    await page.getByRole('button', { name: 'Update reason' }).click()
    await expect.poll(state).toEqual({ paused: true, reason: 'Back on Monday' })
    await expect(pause).toHaveAttribute('aria-checked', 'true')

    // Home keeps saying so for as long as it lasts, and its link opens
    // Settings on the tab with the switch.
    await page.goto('/home')
    await page.getByText('New bookings are paused').click()
    await expect(page.getByRole('tab', { name: 'Time off' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await page.getByRole('button', { name: 'Resume bookings' }).click()
    await expect.poll(state).toEqual({ paused: false, reason: null })
    await expect(page.getByRole('switch', { name: 'Pause new bookings' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  test('how many cars at once, and a daily limit, are saved', async ({ page, context }) => {
    await setActiveVendor(context, VENDORS.timeOff.id)
    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Hours' }).click()

    await page.getByLabel('How many cars can you work on at the same time?').fill('3')
    await page.getByLabel('Most jobs in a day (optional)').fill('12')
    await page.getByRole('button', { name: 'Save capacity' }).click()

    const capacity = async () => {
      const [row] = await sql<{ bays: number | null; jobs_per_day: number | null }[]>`
        select bays, jobs_per_day from vendors where id = ${VENDORS.timeOff.id}
      `
      return row
    }
    await expect.poll(capacity).toEqual({ bays: 3, jobs_per_day: 12 })

    // Blank is "no limit", and clears the one that was there.
    await page.getByLabel('Most jobs in a day (optional)').fill('')
    await page.getByRole('button', { name: 'Save capacity' }).click()
    await expect.poll(capacity).toEqual({ bays: 3, jobs_per_day: null })
  })
})

test.describe('a booked service @p0', () => {
  test('cannot be deleted, and the portal says to disable it', async ({ page, context }) => {
    await setActiveVendor(context, VENDORS.capacity.id)

    // A fresh sign-in rather than the page's cookies: this file runs last, and
    // the 15-minute token global setup minted has usually expired by then.
    // The other tests here load the app first, which refreshes it; an API call
    // made before any page load would get a 401.
    const owner = await loginViaApi(STAFF.scheduleOwner.phone, 'vendor')

    // BOOKINGS.capacityHeld names this service, so history depends on it.
    const response = await owner.delete(
      `/api/v1/vendors/me/services/${SERVICES.capacityWash.id}`,
      { headers: { 'x-vendor-id': VENDORS.capacity.id } }
    )
    await owner.dispose()
    expect(response.status()).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      message: 'This service has bookings. Disable it instead.',
      code: 'SERVICE_IN_USE',
    })

    await page.goto('/services')
    await expect(page.getByText(SERVICES.capacityWash.name).first()).toBeVisible()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('This service has bookings. Disable it instead.')).toBeVisible()

    const [row] = await sql<{ n: string }[]>`
      select count(*)::text as n from services where id = ${SERVICES.capacityWash.id}
    `
    expect(Number(row.n)).toBe(1)
  })
})
