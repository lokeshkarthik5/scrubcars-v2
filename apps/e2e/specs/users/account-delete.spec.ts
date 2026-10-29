/**
 * Deleting an account (0066; Apple 5.1.1(v)): Profile → Delete account.
 *
 * The account is anonymised, never cascaded: bookings, receipts and money
 * records stay, the person is blanked, the phone is freed, every session
 * ends. Refused only while something is open, and then the sheet says what
 * to do first. A garage owner is refused: closing a garage is "Close my
 * garage", never a side effect of deleting a login.
 *
 * Its own people (PREIOS.leaving, PREIOS.blocked) and CUSTOMERS.garageOwner,
 * whose numbers this file alone uses; each signs in fresh.
 */
import type { BrowserContext } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { forgetOtps, getReceiptNumber, sql } from '../../support/db'
import { CUSTOMERS, PREIOS, VENDORS } from '../../support/seed-ids'

/** Signs the page's own context in as this customer (their cookies only). */
async function signIn(context: BrowserContext, phone: string) {
  const api = await loginViaApi(phone)
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
}

test.describe('account deletion', () => {
  test('a garage owner cannot delete their account into their garage @p0', async () => {
    const owner = await loginViaApi(CUSTOMERS.garageOwner.phone)

    const preview = await owner.get(`${API}/api/v1/account/deletion`)
    expect(preview.status()).toBe(200)
    expect((await preview.json()).data).toMatchObject({
      canDelete: false,
      blockers: [{ code: 'VENDOR_OWNER_ACCOUNT', message: expect.stringContaining('Close my garage') }],
    })

    const refused = await owner.delete(`${API}/api/v1/users/me`)
    expect(refused.status()).toBe(409)
    expect(await refused.json()).toMatchObject({ success: false, code: 'VENDOR_OWNER_ACCOUNT' })

    // Nothing went: not the account, and not the garage.
    const [counts] = await sql<{ users: string; vendors: string; deleted: string }[]>`
      select
        (select count(*) from users where id = ${CUSTOMERS.garageOwner.id})::text as users,
        (select count(*) from users where id = ${CUSTOMERS.garageOwner.id} and deleted_at is not null)::text as deleted,
        (select count(*) from vendors where id = ${VENDORS.ownerAccount.id})::text as vendors
    `
    expect(counts).toEqual({ users: '1', deleted: '0', vendors: '1' })

    // Still signed in: the refusal changed nothing about the session.
    expect((await owner.get(`${API}/api/v1/users/me`)).status()).toBe(200)
    await owner.dispose()
  })

  test('a booking still to come stops it, and the sheet says what to do first', async ({ page, context }) => {
    await signIn(context, PREIOS.blocked.phone)
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Delete account', exact: true }).click()

    const sheet = page.getByRole('dialog', { name: 'Delete account' })
    await expect(sheet.getByRole('heading', { name: 'Delete your account?' })).toBeVisible()
    const before = sheet.getByRole('list', { name: 'Before you can delete' })
    await expect(before.getByRole('listitem')).toHaveText([
      `Your booking #${PREIOS.blockedOpen.slice(0, 8).toUpperCase()} is still open. Cancel it, or wait until it is done, then delete your account.`,
    ])
    // No way to delete from here; Close leaves everything as it was.
    await expect(sheet.getByRole('button', { name: 'Delete my account' })).toHaveCount(0)
    await sheet.getByRole('button', { name: 'Close' }).click()
    await expect(sheet).toHaveCount(0)

    const [user] = await sql<{ deleted_at: Date | null; name: string }[]>`
      select deleted_at, name from users where id = ${PREIOS.blocked.id}
    `
    expect(user).toEqual({ deleted_at: null, name: PREIOS.blocked.name })
  })

  test('deleting blanks the person, keeps the records, ends every session and frees the number @p0', async ({
    page,
    context,
  }) => {
    const P = PREIOS.leaving
    // A second device, signed in before: its session must end too.
    const otherDevice = await loginViaApi(P.phone)
    await signIn(context, P.phone)

    // The completed job's receipt number exists before (opening it issues it).
    const receipt = await page.request.get(`${API}/api/v1/bookings/${PREIOS.leavingDone}/receipt`)
    expect(receipt.status()).toBe(200)
    const number = (await getReceiptNumber(PREIOS.leavingDone))?.number
    expect(number).toBeTruthy()

    await page.goto('/profile')
    await page.getByRole('button', { name: 'Delete account', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Delete account' })
    await expect(sheet.getByRole('region', { name: 'What is deleted' })).toContainText('phone number')
    await expect(sheet.getByRole('region', { name: 'What is kept' })).toContainText('receipts')

    // The button waits for the typed word.
    const remove = sheet.getByRole('button', { name: 'Delete my account' })
    await expect(remove).toBeDisabled()
    await sheet.getByLabel('Type DELETE to confirm').fill('DELETE')
    await expect(remove).toBeEnabled()
    await remove.click()

    await expect(sheet.getByRole('heading', { name: 'Your account is deleted' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(page).toHaveURL(/localhost:3000\/$/)

    // Blanked, not deleted.
    const [user] = await sql<{ name: string; phone: string; email: string | null; deleted_at: Date | null }[]>`
      select name, phone, email, deleted_at from users where id = ${P.id}
    `
    expect(user!.name).toBe('Deleted account')
    expect(user!.phone).toMatch(/^deleted-[a-z]{12}$/)
    expect(user!.email).toBeNull()
    expect(user!.deleted_at).not.toBeNull()

    // Every session gone; saved addresses gone; the booked car kept without
    // its plate, the spare deleted.
    const [left] = await sql<{ sessions: string; addresses: string }[]>`
      select
        (select count(*) from refresh_tokens where user_id = ${P.id})::text as sessions,
        (select count(*) from user_addresses where user_id = ${P.id})::text as addresses
    `
    expect(left).toEqual({ sessions: '0', addresses: '0' })
    const cars = await sql<{ id: string; license_plate: string | null; color: string | null; archived: boolean }[]>`
      select id, license_plate, color, archived_at is not null as archived from user_vehicles where user_id = ${P.id}
    `
    expect(cars).toEqual([{ id: P.vehicleId, license_plate: null, color: null, archived: true }])

    // The job, its money and its receipt stay; where they live does not.
    const [job] = await sql<{ status: string; address: string | null; lat: number | null; payment: string }[]>`
      select b.status, b.address, b.lat, p.status as payment
        from bookings b join payments p on p.booking_id = b.id
       where b.id = ${PREIOS.leavingDone}
    `
    expect(job).toEqual({ status: 'completed', address: null, lat: null, payment: 'paid' })
    expect((await getReceiptNumber(PREIOS.leavingDone))?.number).toBe(number)

    // The review stays, signed "Former customer".
    const reviews = await page.request.get(`${API}/api/v1/reviews/vendors/${PREIOS.garage.id}`)
    const listed = ((await reviews.json()).data as Array<{ id: string; user: { name: string } | null }>).find(
      (r) => r.id === PREIOS.leavingReview
    )
    expect(listed?.user).toEqual({ name: 'Former customer' })

    // The other device: its refresh is refused, and its access token reads nothing.
    expect((await otherDevice.post(`${API}/api/v1/auth/refresh`)).status()).toBe(401)
    expect((await otherDevice.get(`${API}/api/v1/users/me`)).status()).toBe(404)
    await otherDevice.dispose()

    // The number is free: it can sign up again, as a new account.
    await forgetOtps(P.phone)
    const signUp = await page.request.post(`${API}/api/v1/auth/otp/send`, {
      data: { phone: P.phone, purpose: 'register', audience: 'customer' },
    })
    expect(signUp.status()).toBe(200)
    await forgetOtps(P.phone)
  })
})
