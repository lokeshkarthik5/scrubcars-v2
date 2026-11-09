/**
 * The customer UI round, stage 2 (docs/ui-round-2026-11.md §5–§7): the
 * garage page's red-light Add, glass booking bar and Book now; the booking
 * page's grey button that names the missing step and turns into Pay; the
 * road as the booking's progress; the ticket at the top of Bookings; and
 * the sign-in code boxes.
 *
 * Read-only throughout: nothing here pays (the specs stop at Pay, as every
 * checkout spec does), books or saves. The browse customer has never
 * booked; the my-bookings customer's fixtures are never written; the code
 * boxes use a number of their own that is never verified, so no account is
 * made for it.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { forgetOtps, latestOtp } from '../../support/db'
import { CheckoutPage } from '../../pages/checkout.page'
import { GaragePage } from '../../pages/garage.page'
import { BOOKINGS, SERVICES, VENDORS } from '../../support/seed-ids'

test.describe('the garage page @p0', () => {
  test.use({ storageState: asRole('customer-browse') })

  test('Add lights up, the booking bar rises, and Book now opens the booking with it', async ({ page }) => {
    const garage = new GaragePage(page)
    await garage.goto(VENDORS.main.id)
    await expect(page.getByRole('heading', { level: 1, name: VENDORS.main.name })).toBeVisible()

    // Nothing picked: no bar, no Book now.
    await expect(garage.bookButton()).toHaveCount(0)

    const add = garage.toggle(SERVICES.wash.name)
    await expect(add).toHaveAttribute('aria-pressed', 'false')
    await expect(add).toHaveText('Add')
    await garage.add(SERVICES.wash.name)
    await expect(add).toHaveAttribute('aria-pressed', 'true')
    await expect(add).toHaveText('Added')

    // The glass bar: what is picked, its total, and the solid red Book now.
    const book = garage.bookButton()
    await expect(book).toBeVisible()
    await expect(book).toHaveAccessibleName('Book now')
    await expect(page.locator('[data-fly-target]')).toContainText(SERVICES.wash.name)
    await expect(page.locator('[data-fly-target]')).toContainText('₹')

    await garage.book()
    await page.waitForURL(
      (url) =>
        url.pathname === `/book/${VENDORS.main.id}` &&
        url.searchParams.get('service') === SERVICES.wash.id
    )
    await expect(page.getByRole('region', { name: 'Your booking' }).getByText(SERVICES.wash.name)).toBeVisible()
  })

  test('Added goes back to Add, and the bar goes with the last pick', async ({ page }) => {
    const garage = new GaragePage(page)
    await garage.goto(VENDORS.main.id)
    await garage.add(SERVICES.wash.name)
    await expect(garage.bookButton()).toBeVisible()
    await garage.remove(SERVICES.wash.name)
    await expect(garage.toggle(SERVICES.wash.name)).toHaveText('Add')
    await expect(garage.bookButton()).toHaveCount(0)
  })
})

test.describe('the booking page @p0', () => {
  test.use({ storageState: asRole('customer-browse') })

  test('the grey button names the missing step and goes to it; then it is Pay', async ({ page }) => {
    const checkout = new CheckoutPage(page)
    await checkout.goto(VENDORS.main.id, [SERVICES.wash.id])

    // Grey, naming what is missing. A tap scrolls to the times and nudges them.
    const cta = checkout.cta()
    await expect(cta).toHaveText(/^Pick a time/)
    await expect(cta).not.toHaveClass(/cta-hero/)
    await cta.click()
    const when = page.getByRole('region', { name: 'Date and time' })
    await expect(when).toBeInViewport()
    await expect(when).toHaveClass(/bk-nudge/)

    // A time picked: the solid red Pay, which pops once as it arrives.
    await checkout.pickTomorrowSlot()
    await expect(cta).toHaveText(/^Pay ₹/)
    await expect(cta).toHaveClass(/cta-hero/)
    await expect(page.locator('.bk-cta')).toHaveAttribute('data-pop', '')
    // Stopped here: nothing is paid.
  })
})

test.describe('the booking’s road @p0', () => {
  test.use({ storageState: asRole('customer-myBookings') })

  test('an accepted booking shows its road, the car at Accepted', async ({ page }) => {
    await page.goto(`/bookings/${BOOKINGS.historyUpcomingLater}`)
    // "Booking status": "Booking progress" is the full timeline further down.
    const road = page.getByRole('list', { name: 'Booking status' })
    await expect(road).toBeVisible()
    await expect(road.getByRole('listitem')).toHaveText(['Requested', 'Accepted', 'In progress', 'Done'])
    await expect(road.locator('[aria-current="step"]')).toHaveText('Accepted')
  })

  test('the next booking leads Upcoming as a ticket with its countdown', async ({ page }) => {
    await page.goto('/bookings')
    const panel = page.getByRole('tabpanel')
    await expect(panel.getByText('Next booking', { exact: true })).toBeVisible()
    // Its countdown is read as one line.
    await expect(panel.getByText(/^Starts in /)).toBeAttached()
    // The ticket is the soonest booking, still a link to it.
    await expect(panel.getByRole('link').first()).toHaveText(SERVICES.wash.name)
  })
})

test.describe('the sign-in code boxes @p0', () => {
  // A number of this file's own, never verified: no account is made for it.
  const PHONE = '6999900071'
  test.beforeEach(async () => {
    await forgetOtps(PHONE)
  })

  test('each digit lights its box; the sixth joins them; Backspace parts them', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#sc-phone').fill(PHONE)
    await page.getByRole('button', { name: /Send OTP/i }).click()
    await page.waitForURL(/\/verify-otp/)

    const group = page.getByRole('group', { name: 'Verification code' })
    const boxes = group.locator('input[maxlength="1"][inputmode="numeric"]')
    await expect(boxes).toHaveCount(6)
    const code = await latestOtp(PHONE)

    await boxes.first().click()
    // One digit at a time, as a person types (see auth.spec.ts's enterOtp).
    await page.keyboard.type(code.slice(0, 3), { delay: 50 })
    await expect(group.locator('[data-lit]')).toHaveCount(3)
    await expect(group).not.toHaveAttribute('data-joined', '')

    await page.keyboard.type(code.slice(3), { delay: 50 })
    await expect(group.locator('[data-lit]')).toHaveCount(6)
    await expect(group).toHaveAttribute('data-joined', '')
    await expect(boxes.last()).toHaveValue(code.at(-1)!)
    await expect(page.getByRole('button', { name: /^Verify/i })).toBeEnabled()

    // The boxes stay in the page while joined: a digit can still come off.
    await page.keyboard.press('Backspace')
    await expect(group).not.toHaveAttribute('data-joined', '')
    await expect(group.locator('[data-lit]')).toHaveCount(5)
  })
})
