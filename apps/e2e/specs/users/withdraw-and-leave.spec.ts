/**
 * Taking things back (0066), on the customer's side: a complaint nobody has
 * answered (Profile → My complaints → Withdraw), an area's free-wash list
 * (Home → On the list for <Area> → Leave), a request the garage took back,
 * and a booking the garage cancelled after accepting it, as the customer
 * reads them. PREIOS.withdrawer and PREIOS.customer, whose numbers this
 * file alone signs in with.
 */
import type { BrowserContext } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { PREIOS } from '../../support/seed-ids'

async function signIn(context: BrowserContext, phone: string) {
  const api = await loginViaApi(phone)
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
}

test.describe('withdraw and leave', () => {
  test('a complaint nobody has answered is withdrawn, and leaves the list of open ones', async ({ page, context }) => {
    await signIn(context, PREIOS.withdrawer.phone)
    await page.goto('/profile#my-complaints')

    const [{ number }] = await sql<{ number: number }[]>`select number from complaints where id = ${PREIOS.complaint}`
    const label = `C-${String(number).padStart(6, '0')}`
    await page.getByRole('button', { name: `Withdraw complaint ${label}` }).click()
    const sheet = page.getByRole('dialog', { name: `Withdraw complaint ${label}?` })
    await sheet.getByRole('button', { name: 'Withdraw complaint' }).click()

    await expect(page.getByText('Complaint withdrawn')).toBeVisible()
    const list = page.getByRole('list', { name: 'My complaints, newest first' })
    await expect(list.getByText('Withdrawn', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: `Withdraw complaint ${label}` })).toHaveCount(0)

    const [row] = await sql<{ status: string; withdrawn: boolean; closed_by: string }[]>`
      select status, withdrawn_at is not null as withdrawn, closed_by from complaints where id = ${PREIOS.complaint}
    `
    expect(row).toEqual({ status: 'closed', withdrawn: true, closed_by: 'Customer (withdrawn)' })

    // Once closed, the API refuses a second withdraw, saying why.
    const again = await page.request.post(`${API}/api/v1/users/me/complaints/${PREIOS.complaint}/withdraw`)
    expect(again.status()).toBe(409)
    expect((await again.json()).code).toBe('COMPLAINT_NOT_WITHDRAWABLE')
  })

  test("leaving an area's list ends its messages and its card on Home", async ({ page, context }) => {
    await signIn(context, PREIOS.withdrawer.phone)
    await page.goto('/home')

    const status = page.locator('[data-reach-status]')
    await expect(status.getByText(`On the list for ${PREIOS.area.name}`)).toBeVisible()
    await status.getByRole('button', { name: `Leave the list for ${PREIOS.area.name}` }).click()
    const sheet = page.getByRole('dialog', { name: `Leave the list for ${PREIOS.area.name}?` })
    // Its saved free wash is said before it goes.
    await expect(sheet).toContainText('your saved free wash goes with it')
    await sheet.getByRole('button', { name: 'Leave the list' }).click()

    await expect(page.getByText(`You left the list for ${PREIOS.area.name}`)).toBeVisible()
    await expect(page.getByText(`On the list for ${PREIOS.area.name}`)).toHaveCount(0)
    const [{ count }] = await sql<{ count: string }[]>`
      select count(*)::text as count from zone_signups s join zones z on z.id = s.zone_id
       where s.user_id = ${PREIOS.withdrawer.id} and z.slug = ${PREIOS.area.slug}
    `
    expect(count).toBe('0')
  })

  test('a booking the garage cancelled after accepting, and a request it took back, say so', async ({
    page,
    context,
  }) => {
    await signIn(context, PREIOS.customer.phone)
    await page.goto(`/bookings/${PREIOS.garageCancelled}`)
    await expect(page.getByText('Cancelled by the garage', { exact: true })).toBeVisible()
    await expect(page.getByText(/accepted this booking, then had to cancel it/)).toBeVisible()

    const booking = await page.request.get(`${API}/api/v1/bookings/${PREIOS.garageCancelled}`)
    expect((await booking.json()).data.garageCancelled).toEqual({ at: expect.any(String), late: false })

    const request = await page.request.get(`${API}/api/v1/users/me/requests/${PREIOS.requestWithdrawn}`)
    expect((await request.json()).data).toMatchObject({ state: 'cancelled', withdrawnByGarage: true })
    await page.goto('/requests')
    await expect(
      page.getByText(`${PREIOS.garage.name} can no longer come. Nothing was paid; send a new request any time.`)
    ).toBeVisible()
  })
})
