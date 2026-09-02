/**
 * Garage settings.
 *
 * The working-hours test is the one that earns its keep: it changes the hours
 * in the vendor app and then asserts the *customer's* slot grid moved with
 * them. Two deployments, one API — a change that lands in one and not the
 * other is invisible to either app's own tests.
 *
 * It operates on SECOND rather than MAIN because the customer booking specs
 * assert MAIN's slot boundaries (06:00–22:00) and would fail if this file
 * moved them mid-run.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { setActiveVendor } from '../../support/auth'
import { sql } from '../../support/db'
import { SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('vendor-owner') })

// These tests deliberately break SECOND's opening hours. Nothing else reads
// them today, but leaving a garage closed for the rest of the run is the kind
// of debt that turns into someone else's mystery failure.
test.afterAll(async () => {
  await sql`
    update vendor_working_hours
       set open_time = '09:00:00', close_time = '18:00:00', is_closed = false
     where vendor_id = ${VENDORS.second.id}
  `
})

test.describe('vendor settings', () => {
  test('the profile can be edited and is persisted', async ({ page, context }) => {
    await setActiveVendor(context, VENDORS.main.id)
    await page.goto('/settings')

    // These bind only because the inputs were given ids; the label prop alone
    // leaves them decorative.
    const pincode = page.getByLabel('Pincode')
    await expect(pincode).toHaveValue('600020')
    await pincode.fill('600028')
    await page.getByRole('button', { name: /Save profile/i }).click()

    await expect
      .poll(async () => {
        const rows = await sql<{ pincode: string }[]>`
          select pincode from vendors where id = ${VENDORS.main.id}
        `
        return rows[0]?.pincode
      })
      .toBe('600028')

    // Put it back: other specs read this garage.
    await sql`update vendors set pincode = '600020' where id = ${VENDORS.main.id}`
  })

  test('changing working hours changes what a customer can book', async ({ page, context }) => {
    await setActiveVendor(context, VENDORS.second.id)
    await page.goto('/settings')

    // Real tabs here — these panels exist, unlike the radiogroup filters
    // elsewhere in the app.
    await page.getByRole('tab', { name: 'Hours' }).click()

    // Close the whole week at noon. Every day, so the assertion below holds
    // whichever day "tomorrow" happens to be.
    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      await page.getByLabel(`${day} closing time`).fill('12:00')
    }
    await page.getByRole('button', { name: /Save working hours/i }).click()

    await expect
      .poll(async () => {
        const rows = await sql<{ n: string }[]>`
          select count(*)::text as n from vendor_working_hours
           where vendor_id = ${VENDORS.second.id} and close_time = '12:00:00'
        `
        return Number(rows[0].n)
      })
      .toBe(7)

    // Now the customer's side. The 30-minute wash must no longer be offered
    // past 11:30, because it would run over the new closing time.
    const customer = await context.newPage()
    await customer.goto(
      `http://localhost:3000/book/${VENDORS.second.id}?service=${SERVICES.secondOnly.id}`
    )
    await customer.getByRole('button', { name: /Tmrw/ }).click()

    const slots = customer.getByRole('button', { name: /^\d{1,2}:\d{2}\s(AM|PM)$/ })
    await expect(slots.last()).toHaveText('11:30 AM')
    await customer.close()
  })

  test('a day marked closed offers no slots at all', async ({ page, context }) => {
    await setActiveVendor(context, VENDORS.second.id)
    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Hours' }).click()

    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      const toggle = page.getByRole('button', { name: `${day} closed all day` })
      if ((await toggle.getAttribute('aria-pressed')) === 'false') {
        await toggle.click()
      }
    }
    await page.getByRole('button', { name: /Save working hours/i }).click()

    await expect
      .poll(async () => {
        const rows = await sql<{ n: string }[]>`
          select count(*)::text as n from vendor_working_hours
           where vendor_id = ${VENDORS.second.id} and is_closed = true
        `
        return Number(rows[0].n)
      })
      .toBe(7)

    const customer = await context.newPage()
    await customer.goto(
      `http://localhost:3000/book/${VENDORS.second.id}?service=${SERVICES.secondOnly.id}`
    )

    // The picker greys the day out rather than letting the customer pick it and
    // then showing an empty grid — a closed day is not a day with no free time.
    await expect(customer.getByRole('button', { name: /Tmrw/ })).toBeDisabled()
    await expect(
      customer.getByRole('button', { name: /^\d{1,2}:\d{2}\s(AM|PM)$/ })
    ).toHaveCount(0)
    await customer.close()
  })
})
