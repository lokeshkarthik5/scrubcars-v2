/**
 * Login and signup through the UI.
 *
 * Every other spec starts from a saved storageState, so this is the one place
 * the OTP exchange is actually driven end to end. If it breaks, the rest of
 * the suite fails at setup — which is the right blast radius, but it means the
 * failure needs a spec of its own to be legible.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { latestOtp, sql } from '../../support/db'
import { CUSTOMERS, UNREGISTERED_PHONE, VENDORS } from '../../support/seed-ids'

/**
 * Types the code into the six single-character boxes.
 *
 * One digit at a time with a small delay, rather than filling all six at once.
 * OtpInput's handleChange rebuilds the array from a `values` closure captured
 * at render (packages/ui/src/sc/otp-input.tsx:17), so two changes landing in
 * one React batch make the second overwrite the first and a digit is silently
 * lost. Human typing does not hit that; a test filling six boxes in a tight
 * loop does.
 */
async function enterOtp(page: import('@playwright/test').Page, code: string) {
  // Waits for the verify screen first. The phone field on /login is also
  // inputmode="numeric", so grabbing the boxes before navigation lands types
  // the code into the phone number instead — silently, since both accept
  // digits.
  await page.waitForURL(/\/verify-otp/)

  // maxlength="1" is what actually distinguishes an OTP box from any other
  // numeric field on the page.
  const boxes = page.locator('input[maxlength="1"][inputmode="numeric"]')
  await expect(boxes).toHaveCount(6)

  await boxes.first().click()
  // Typed into whichever box has focus, as a person does it: the component
  // advances focus itself after each digit.
  await page.keyboard.type(code, { delay: 50 })

  await expect(boxes.last()).toHaveValue(code.at(-1)!)
}

test.describe('customer auth', () => {
  test('a returning customer signs in with the code they were sent', async ({ page }) => {
    await page.goto('/login')

    await page.locator('#sc-phone').fill(CUSTOMERS.browse.phone)
    await page.getByRole('button', { name: /Send OTP/i }).click()

    await expect(page).toHaveURL(/\/verify-otp/)
    await enterOtp(page, await latestOtp(CUSTOMERS.browse.phone))
    await page.getByRole('button', { name: /^Verify/i }).click()

    // A known customer skips profile setup and lands in the app.
    await expect(page).toHaveURL(/\/home/)
    await expect(page.getByText(VENDORS.main.name).first()).toBeVisible()
  })

  test('a wrong code is refused and the customer stays put', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#sc-phone').fill(CUSTOMERS.browse.phone)
    await page.getByRole('button', { name: /Send OTP/i }).click()

    await enterOtp(page, '000000')
    await page.getByRole('button', { name: /^Verify/i }).click()

    await expect(page.getByText(/invalid|incorrect|expired/i).first()).toBeVisible()
    await expect(page).toHaveURL(/\/verify-otp/)
  })

  test('the CTA stays disabled until the number is complete', async ({ page }) => {
    await page.goto('/login')
    const send = page.getByRole('button', { name: /Send OTP/i })

    await expect(send).toBeDisabled()
    await page.locator('#sc-phone').fill('98765')
    await expect(send).toBeDisabled()
    await page.locator('#sc-phone').fill('9876543210')
    await expect(send).toBeEnabled()
  })

  test('a number nobody has used is taken through profile setup', async ({ page }) => {
    // Cleaned first so the spec is repeatable: a previous run would have
    // turned this into a returning customer.
    await sql`delete from users where phone = ${UNREGISTERED_PHONE}`

    await page.goto('/login')
    await page.locator('#sc-phone').fill(UNREGISTERED_PHONE)
    await page.getByRole('button', { name: /Send OTP/i }).click()

    await enterOtp(page, await latestOtp(UNREGISTERED_PHONE))
    await page.getByRole('button', { name: /^Verify/i }).click()

    // New customers are asked who they are before they can book.
    await expect(page).toHaveURL(/\/profile-setup/)

    // These bind only because the inputs were given ids; without them the
    // labels are decorative.
    await page.getByLabel('Full name').fill('Newly Arrived')
    await page.getByLabel('Street address').fill('1, First Street')
    await page.getByLabel('City').fill('Chennai')
    await page.getByRole('button', { name: /Continue|Save|Get Started|Finish/i }).click()

    await expect(page).toHaveURL(/\/home/)

    const [created] = await sql<{ name: string }[]>`
      select name from users where phone = ${UNREGISTERED_PHONE}
    `
    expect(created?.name).toBe('Newly Arrived')
  })

  test.describe('signing out', () => {
    // Starts from a saved session rather than logging in through the UI: this
    // test is about logout, and a third UI login in one file also walks into
    // the 3-attempts-per-5-minutes cap that lib/otp.ts enforces per phone.
    test.use({ storageState: asRole('customer-logout') })

    test('returns the customer to a guest session', async ({ page }) => {
      await page.goto('/profile')
      await page.getByRole('button', { name: /Log ?out/i }).click()

      // Logout navigates on its own; without waiting for that to land, the
      // goto below races it and aborts.
      await page.waitForURL(/\/login|\/$|\/welcome/)

      // Most of the app is browsable signed out — app-provider only guards
      // /book and /profile-setup — so the proof that the session is gone is a
      // guarded route, not the bookings list.
      await page.goto(`/book/${VENDORS.main.id}`)
      await expect(page).toHaveURL(/\/login/)
    })
  })
})
