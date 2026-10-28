/**
 * Guest checkout (customer reach, 0062): a guest chooses the services, the
 * car's body type, the time and (for doorstep) the address without an
 * account, kept on the phone; the number, the code and, for a new number, a
 * name are asked inside checkout at Pay. The code is the sign-in (the same
 * session as /login), then the car and address are saved to the account
 * through the ordinary APIs before the booking is made, and the existing
 * payment continues (E2E_FAKE_PAYMENTS, the stubbed sheet).
 *
 * Signed out throughout. New numbers come from GUEST_NEW_PHONES (the first
 * one no account has, so a retry still starts as a new customer); the
 * returning one is CUSTOMERS.guestExisting, who has a saved Tata Nexon and
 * belongs to this file alone.
 */
import type { Page } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { CheckoutPage } from '../../pages/checkout.page'
import { GaragePage } from '../../pages/garage.page'
import { bookingsForUser, forgetOtps, getPayment, latestOtp, sql } from '../../support/db'
import { CUSTOMERS, GUEST_NEW_PHONES, SERVICES, VENDORS } from '../../support/seed-ids'

/** The first number in the pool with no account yet. */
async function unusedPhone(): Promise<string> {
  const taken = await sql<{ phone: string }[]>`
    select phone from users where phone in ${sql(GUEST_NEW_PHONES)}
  `
  const phone = GUEST_NEW_PHONES.find((p) => !taken.some((row) => row.phone === p))
  if (!phone) throw new Error('Every GUEST_NEW_PHONES number has an account: add more to the pool')
  return phone
}

/** The sign-in card (components/checkout/checkout-sign-in.tsx). */
const signInCard = (page: Page) => page.getByRole('region', { name: 'Your phone number' })

/** A guest's car: the body type, then the names the garage needs. */
async function describeCar(page: Page, type: 'Hatchback' | 'Sedan' | 'SUV / MUV', make: string, model: string) {
  await page.getByRole('button', { name: type, exact: true }).click()
  await expect(page.getByRole('button', { name: type, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Make', { exact: true }).fill(make)
  await page.getByLabel('Model', { exact: true }).fill(model)
}

/** Sends the code to `phone` and types it into the six boxes. */
async function enterNumberAndCode(page: Page, phone: string) {
  const card = signInCard(page)
  await card.locator('#sc-phone').fill(phone)
  await card.getByRole('button', { name: 'Send code' }).click()
  await expect(card.getByText('Code sent by SMS')).toBeVisible()
  const code = await latestOtp(phone)
  await card.getByRole('textbox', { name: 'Digit 1 of 6' }).click()
  // One digit at a time, as auth.spec.ts types it (OtpInput's batching).
  await page.keyboard.type(code, { delay: 50 })
  await expect(card.getByRole('textbox', { name: 'Digit 6 of 6' })).toHaveValue(code.at(-1)!)
}

test.describe('guest checkout @p0', () => {
  test('a new number books from the landing page to paid, signing in at Pay', async ({ page }) => {
    const phone = await unusedPhone()
    await forgetOtps(phone)

    // The landing page is the app: pick an area, then a garage from the list.
    await page.goto('/')
    await page.getByRole('button', { name: 'Nungambakkam', exact: true }).click()
    await page.getByRole('link', { name: new RegExp(VENDORS.main.name) }).first().click()
    await expect(page).toHaveURL(new RegExp(`/garage/${VENDORS.main.id}`))

    // Book Now goes straight to checkout, signed out: no /login on the way.
    const garage = new GaragePage(page)
    await garage.add(SERVICES.wash.name)
    await garage.book()
    await page.waitForURL((url) => url.pathname === `/book/${VENDORS.main.id}`)

    const checkout = new CheckoutPage(page)
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    await checkout.pickTomorrowSlot()
    await describeCar(page, 'Sedan', 'Maruti', 'Ciaz')

    // Everything else chosen: the last step is the number, said on the bar.
    await expect(page.getByRole('button', { name: 'Enter your number to pay' })).toBeVisible()
    await page.getByRole('button', { name: 'Enter your number to pay' }).click()
    await expect(signInCard(page)).toBeInViewport()

    await enterNumberAndCode(page, phone)
    // A new number gives a name, for the garage.
    await signInCard(page).getByLabel('Your name (for the garage)').fill('Guest Gita')
    await signInCard(page).getByRole('button', { name: 'Verify and pay ₹499' }).click()

    await page.waitForURL(/\/bookings\/[0-9a-f-]+/)

    // The account, its car and the booking, in that order of making.
    const [user] = await sql<{ id: string; name: string }[]>`
      select id, name from users where phone = ${phone}
    `
    expect(user.name).toBe('Guest Gita')
    const cars = await sql<{ id: string; make: string; model: string; vehicle_type: string; is_default: boolean }[]>`
      select id, make, model, vehicle_type, is_default from user_vehicles where user_id = ${user.id}
    `
    expect(cars).toHaveLength(1)
    expect(cars[0]).toMatchObject({ make: 'Maruti', model: 'Ciaz', vehicle_type: 'sedan', is_default: true })

    const [booking] = await bookingsForUser(user.id)
    expect(booking.vehicle_id).toBe(cars[0].id)
    expect(booking.booking_type).toBe('dropin')
    expect(booking.amount).toBe('499.00')
    expect((await getPayment(booking.id)).status).toBe('paid')

    // Signed in by the code, as /login would have: the session is a real one.
    await page.goto('/home')
    await expect(page).toHaveURL(/\/home/)
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0)

    // The booking kept on the phone is gone once paid.
    expect(await page.evaluate(() => window.localStorage.getItem('detlio:booking-draft'))).toBeNull()
  })

  test('a doorstep booking: the guest’s address is saved to the new account and booked to', async ({ page }) => {
    const phone = await unusedPhone()
    await forgetOtps(phone)

    const checkout = new CheckoutPage(page)
    await page.goto(`/book/${VENDORS.main.id}?service=${SERVICES.wash.id}&mode=doorstep`)
    await checkout.pickTomorrowSlot()
    await describeCar(page, 'Hatchback', 'Hyundai', 'i20')

    // The address step, without an account: the sheet keeps it on the phone.
    await expect(checkout.addressStep()).toBeVisible()
    await page.getByRole('button', { name: 'Add an address' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add an address' })
    await sheet.getByRole('button', { name: /Use my current location/ }).click()
    await sheet.getByLabel('Address', { exact: true }).fill('12, Lake View Road')
    await sheet.getByLabel('City', { exact: true }).fill('Chennai')
    await sheet.getByRole('button', { name: 'Save address' }).click()
    await expect(sheet).toBeHidden()
    await expect(checkout.addressCard(/12, Lake View Road/)).toHaveAttribute('aria-pressed', 'true')

    await enterNumberAndCode(page, phone)
    await signInCard(page).getByLabel('Your name (for the garage)').fill('Doorstep Guest Dev')
    await signInCard(page).getByRole('button', { name: /^Verify and pay ₹/ }).click()
    await page.waitForURL(/\/bookings\/[0-9a-f-]+/)

    const [user] = await sql<{ id: string }[]>`select id from users where phone = ${phone}`
    const addresses = await sql<{ id: string; address: string; lat: number | null }[]>`
      select id, address, lat from user_addresses where user_id = ${user.id}
    `
    expect(addresses).toHaveLength(1)
    expect(addresses[0].address).toBe('12, Lake View Road')
    expect(addresses[0].lat).not.toBeNull()
    const [booking] = await bookingsForUser(user.id)
    expect(booking.booking_type).toBe('doorstep')
    expect(booking.address).toContain('12, Lake View Road')
  })

  test('a returning number signs in at Pay, is not asked a name, and can use a saved car', async ({ page }) => {
    await forgetOtps(CUSTOMERS.guestExisting.phone)
    const before = await sql<{ id: string }[]>`
      select id from user_vehicles where user_id = ${CUSTOMERS.guestExisting.id}
    `

    const checkout = new CheckoutPage(page)
    await page.goto(`/book/${VENDORS.main.id}?service=${SERVICES.wash.id}`)
    await checkout.pickTomorrowSlot()
    await describeCar(page, 'Hatchback', 'Kia', 'Sonet')

    await enterNumberAndCode(page, CUSTOMERS.guestExisting.phone)
    // Known number: no name box, and Verify promises no payment: a returning
    // account stops after it to see what is theirs.
    await expect(signInCard(page).getByLabel('Your name (for the garage)')).toHaveCount(0)
    await expect(signInCard(page).getByRole('button', { name: /Verify and pay/ })).toHaveCount(0)
    await signInCard(page).getByRole('button', { name: 'Verify and continue' }).click()

    // Signed in, and stopped short of paying: the account has a saved car, so
    // what was entered stays chosen and "Use saved" is offered.
    const signedIn = page.getByRole('region', { name: `Signed in as ${CUSTOMERS.guestExisting.name}` })
    await expect(signedIn).toBeVisible()
    await expect(page.getByRole('button', { name: /Kia Sonet/ })).toHaveAttribute('aria-pressed', 'true')
    await signedIn.getByRole('button', { name: 'Use saved: Tata Nexon' }).click()
    await expect(page.getByRole('button', { name: /Tata Nexon/ }).first()).toHaveAttribute('aria-pressed', 'true')

    await checkout.pay()
    await page.waitForURL(/\/bookings\/[0-9a-f-]+/)

    const [booking] = await bookingsForUser(CUSTOMERS.guestExisting.id)
    expect(booking.vehicle_id).toBe(CUSTOMERS.guestExisting.vehicleId)
    // The car entered as a guest was not saved: they used their own.
    const after = await sql<{ id: string }[]>`
      select id from user_vehicles where user_id = ${CUSTOMERS.guestExisting.id}
    `
    expect(after.length).toBe(before.length)
  })

  test('a link’s code that does not apply stops Pay once, says why, and the next Pay is the full price', async ({ page }) => {
    const phone = await unusedPhone()
    await forgetOtps(phone)

    // FLAT100 needs ₹1,000 or more; this cart is ₹499. Checked only once the
    // car is saved to the new account, at Pay.
    const checkout = new CheckoutPage(page)
    await page.goto(`/book/${VENDORS.main.id}?service=${SERVICES.wash.id}&code=FLAT100`)
    await checkout.pickTomorrowSlot()
    await describeCar(page, 'Sedan', 'Honda', 'City')
    await expect(page.getByText('Code FLAT100 is checked when you pay.')).toBeVisible()

    await enterNumberAndCode(page, phone)
    await signInCard(page).getByLabel('Your name (for the garage)').fill('Code Guest Kavi')
    await signInCard(page).getByRole('button', { name: 'Verify and pay ₹499' }).click()

    // Not paid: the coupon row says why, and the car was saved once.
    await expect(page.getByText(/FLAT100 doesn.t apply to this booking\./).first()).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/book/${VENDORS.main.id}`))
    const [user] = await sql<{ id: string }[]>`select id from users where phone = ${phone}`
    expect(await bookingsForUser(user.id)).toHaveLength(0)

    await checkout.pay()
    await page.waitForURL(/\/bookings\/[0-9a-f-]+/)
    const [booking] = await bookingsForUser(user.id)
    expect(booking.amount).toBe('499.00')
    const cars = await sql`select id from user_vehicles where user_id = ${user.id}`
    expect(cars).toHaveLength(1)
  })

  test('"Have an account? Sign in" opens the same card before anything is chosen', async ({ page }) => {
    await page.goto(`/book/${VENDORS.main.id}?service=${SERVICES.wash.id}`)
    await expect(signInCard(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(signInCard(page)).toBeVisible()
    await expect(signInCard(page).getByRole('button', { name: 'Send code' })).toBeDisabled()
    // The number is masked for Clarity, like every phone field.
    await expect(signInCard(page).locator('[data-clarity-mask="true"]').first()).toBeAttached()
  })

  test('a booking left half way is offered back on the landing page, as it was', async ({ page }) => {
    const checkout = new CheckoutPage(page)
    await page.goto(`/book/${VENDORS.main.id}?service=${SERVICES.wash.id}`)
    await checkout.pickTomorrowSlot()
    await describeCar(page, 'SUV / MUV', 'Mahindra', 'XUV700')

    await page.goto('/')
    const resume = page.getByRole('link', { name: new RegExp(`Continue your booking at ${VENDORS.main.name}`) })
    await expect(resume).toBeVisible()
    await resume.click()

    await page.waitForURL((url) => url.pathname === `/book/${VENDORS.main.id}` && url.searchParams.get('service') === SERVICES.wash.id)
    // The car comes back, and the time: Pay waits only on the number.
    await expect(page.getByLabel('Make', { exact: true })).toHaveValue('Mahindra')
    await expect(page.getByRole('button', { name: 'SUV / MUV', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Enter your number to pay' })).toBeVisible()

    // × forgets it.
    await page.goto('/')
    await page.getByRole('button', { name: 'Forget this booking' }).click()
    await expect(resume).toHaveCount(0)
    expect(await page.evaluate(() => window.localStorage.getItem('detlio:booking-draft'))).toBeNull()
  })
})
