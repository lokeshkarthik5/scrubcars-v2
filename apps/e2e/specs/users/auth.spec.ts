/**
 * Login and signup through the UI.
 *
 * Every other spec starts from a saved storageState, so this is the one place
 * the OTP exchange is actually driven end to end. If it breaks, the rest of
 * the suite fails at setup — which is the right blast radius, but it means the
 * failure needs a spec of its own to be legible.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { forgetOtps, latestOtp, sql } from '../../support/db'
import { CUSTOMERS, SERVICES, UNREGISTERED_PHONE, VENDORS } from '../../support/seed-ids'

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
  // Every UI send below forgets the number's earlier codes first: global setup
  // has just sent this one a code, and the API allows one every 30 seconds.
  test.beforeEach(async () => {
    await forgetOtps(CUSTOMERS.browse.phone)
  })

  test('a returning customer signs in with the code they were sent', async ({ page }) => {
    await page.goto('/login')

    await page.locator('#sc-phone').fill(CUSTOMERS.browse.phone)
    await page.getByRole('button', { name: /Send OTP/i }).click()

    await expect(page).toHaveURL(/\/verify-otp/)

    // The code lasts three minutes, and the screen counts down from the
    // server's own figure — it used to count five while the code died at
    // three. Resend opens after 30 seconds, not once the code has expired.
    await expect(page.getByText(/^Code expires in [23]:\d{2}$/)).toBeVisible()
    const resend = page.getByRole('button', { name: /^Resend OTP in 0:\d{2}$/ })
    await expect(resend).toBeDisabled()

    await enterOtp(page, await latestOtp(CUSTOMERS.browse.phone))
    await page.getByRole('button', { name: /^Verify/i }).click()

    // A known customer skips profile setup and lands in the app: Home, with
    // their car.
    await expect(page).toHaveURL(/\/home/)
    await expect(page.getByRole('region', { name: 'Your car', exact: true })).toBeVisible()
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

  test('a pasted +91 number is read as the ten digits', async ({ page }) => {
    await page.goto('/login')
    const phone = page.locator('#sc-phone')

    // Focused on arrival — the number is the only thing on the screen.
    await expect(phone).toBeFocused()

    // What a paste or the keyboard's autofill chip delivers. The field used
    // to cap at ten characters before stripping, which made this "9198765".
    await page.keyboard.insertText('+91 98765 43210')
    await expect(phone).toHaveValue('9876543210')
    await expect(page.getByRole('button', { name: /Send OTP/i })).toBeEnabled()
  })

  test('asking for another code too soon says when to try again', async ({ page, request }) => {
    // A code a moment ago, as from a second tab or a double tap.
    const first = await request.post(`${API}/api/v1/auth/otp/send`, {
      data: { phone: CUSTOMERS.browse.phone, purpose: 'login', audience: 'customer' },
    })
    expect(first.ok()).toBe(true)

    await page.goto('/login')
    await page.locator('#sc-phone').fill(CUSTOMERS.browse.phone)
    await page.getByRole('button', { name: /Send OTP/i }).click()

    // Said once in amber, and the customer stays put rather than being told
    // the number is "already registered" — which is what the old fallback to
    // sign-up turned every failed send into. The alert's text stays still so
    // a screen reader hears it once; the countdown ticks on the button.
    // The form's own alert: Next's route announcer is an alert too.
    await expect(page.locator('form p[role="alert"]')).toHaveText(
      /^Too many codes requested for this number\. Try again in \d+ seconds?\.$/
    )
    await expect(page.getByRole('button', { name: /^Send OTP in 0:\d{2}$/ })).toBeDisabled()
    await expect(page).toHaveURL(/\/login/)
  })

  test('a number nobody has used is asked only for a name', async ({ page }) => {
    // Cleaned first so the spec is repeatable: a previous run would have
    // turned this into a returning customer, and would have sent it a code.
    await sql`delete from users where phone = ${UNREGISTERED_PHONE}`
    await forgetOtps(UNREGISTERED_PHONE)

    await page.goto('/login')
    await page.locator('#sc-phone').fill(UNREGISTERED_PHONE)
    // The keyboard's Go key, not the button: the field sits in a real form.
    await page.locator('#sc-phone').press('Enter')

    await enterOtp(page, await latestOtp(UNREGISTERED_PHONE))
    await page.getByRole('button', { name: /^Verify/i }).click()

    // New customers are asked who they are before they can book.
    await expect(page).toHaveURL(/\/profile-setup/)

    // Only who they are. The address moved to doorstep checkout, the one
    // place it is needed. Binds only because the input was given an id;
    // without one the label is decorative.
    await expect(page.getByLabel('Street address')).toHaveCount(0)
    await page.getByLabel('Full name').fill('Newly Arrived')
    await page.getByRole('button', { name: /Get started/i }).click()

    await expect(page).toHaveURL(/\/home/)

    const [created] = await sql<{ id: string; name: string }[]>`
      select id, name from users where phone = ${UNREGISTERED_PHONE}
    `
    expect(created?.name).toBe('Newly Arrived')

    // Nothing invented on their behalf: the old form always saved an
    // address, pinned at 0,0 whenever location was refused.
    const addresses = await sql`
      select id from user_addresses where user_id = ${created.id}
    `
    expect(addresses).toHaveLength(0)
  })

  test('a new customer who started a booking is handed back to it', async ({ page }) => {
    // Same number as above, so cleaned the same way — codes included, since
    // the test above sent this number one seconds ago.
    await sql`delete from users where phone = ${UNREGISTERED_PHONE}`
    await forgetOtps(UNREGISTERED_PHONE)

    // Where Book Now on a garage page sends a guest.
    const bookPath = `/book/${VENDORS.main.id}?service=${SERVICES.wash.id}`
    await page.goto(`/login?next=${encodeURIComponent(bookPath)}`)
    await page.locator('#sc-phone').fill(UNREGISTERED_PHONE)
    await page.getByRole('button', { name: /Send OTP/i }).click()

    await enterOtp(page, await latestOtp(UNREGISTERED_PHONE))
    await page.getByRole('button', { name: /^Verify/i }).click()

    // The booking rides through setup rather than being dropped there — it
    // used to land every new customer on Home with an empty cart.
    await expect(page).toHaveURL(/\/profile-setup\?next=/)
    await page.getByLabel('Full name').fill('Booking Newcomer')
    await page.getByRole('button', { name: 'Continue to booking' }).click()

    await page.waitForURL(
      (url) =>
        url.pathname === `/book/${VENDORS.main.id}` &&
        url.searchParams.get('service') === SERVICES.wash.id
    )
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

      // Most of the app is browsable signed out — checkout too, since a
      // guest books and signs in at Pay (0062); app-provider guards
      // /profile-setup and /updates — so the proof that the session is gone
      // is a guarded route, not the bookings list.
      await page.goto('/updates')
      await expect(page).toHaveURL(/\/login/)
    })
  })
})
