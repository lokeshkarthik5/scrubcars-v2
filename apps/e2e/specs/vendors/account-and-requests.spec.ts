/**
 * The ways out of a garage, and taking back a yes (0066):
 *
 *   - the owner asks Detlio to close the garage, and cancels the request
 *   - an operator leaves the garage (from /account, reached from Home)
 *   - an operator deletes their own login
 *   - a login with no garage signs out of the first sign-up step
 *   - the garage withdraws its yes to a visit request before the customer pays
 *
 * PREIOS's quitter, leaver, deleter, noGarage and answerer, each signed in
 * fresh by this file only.
 */
import type { BrowserContext } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi, setActiveVendor } from '../../support/auth'
import { sql } from '../../support/db'
import { PREIOS } from '../../support/seed-ids'

async function signIn(context: BrowserContext, phone: string, garageId?: string) {
  const api = await loginViaApi(phone, 'vendor')
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
  if (garageId) await setActiveVendor(context, garageId)
}

const G = PREIOS.garage

test.describe('ways out of a garage', () => {
  test('the owner asks to close the garage, then cancels the request', async ({ page, context }) => {
    const Q = PREIOS.quitting
    await signIn(context, PREIOS.quitter.phone, Q.id)
    await page.goto('/settings?tab=account')

    await page.getByRole('button', { name: 'Close my garage', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Close my garage' })
    await sheet.getByLabel('Why are you closing?').fill('Retiring at the end of the month')
    await sheet.getByRole('button', { name: 'Send request' }).click()

    await expect(page.getByText('Request sent. Detlio will call you.')).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: `You asked to close ${Q.name}` })).toBeVisible()
    const open = await sql<{ status: string; reason: string; requested_by_name: string }[]>`
      select status, reason, requested_by_name from garage_closure_requests where vendor_id = ${Q.id} and status = 'open'
    `
    expect(open).toEqual([
      { status: 'open', reason: 'Retiring at the end of the month', requested_by_name: PREIOS.quitter.name },
    ])

    await page.getByRole('button', { name: 'Cancel the request' }).click()
    const confirm = page.getByRole('dialog', { name: 'Keep your garage open?' })
    await confirm.getByRole('button', { name: 'Cancel the request' }).click()
    await expect(page.getByText('Request cancelled. Your garage stays open.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Close my garage', exact: true })).toBeVisible()
    const [{ open: stillOpen }] = await sql<{ open: string }[]>`
      select count(*)::text as open from garage_closure_requests where vendor_id = ${Q.id} and status = 'open'
    `
    expect(stillOpen).toBe('0')
  })

  test('an operator leaves the garage from Your account, and is signed out', async ({ page, context }) => {
    await signIn(context, PREIOS.leaver.phone, G.id)
    await page.goto('/home')
    await page.getByRole('link', { name: 'Your account' }).click()
    await expect(page).toHaveURL(/\/account$/)

    await page.getByRole('button', { name: `Leave ${G.name}` }).click()
    await page.getByRole('dialog', { name: `Leave ${G.name}?` }).getByRole('button', { name: 'Leave garage' }).click()
    await expect(page).toHaveURL(/\/login$/)

    const [row] = await sql<{ seats: string; flag: boolean }[]>`
      select (select count(*) from user_member_mapping where user_id = ${PREIOS.leaver.id})::text as seats,
             (select is_vendor_owner from users where id = ${PREIOS.leaver.id}) as flag
    `
    expect(row).toEqual({ seats: '0', flag: false })
  })

  test('an operator deletes their own login', async ({ page, context }) => {
    await signIn(context, PREIOS.deleter.phone, G.id)
    await page.goto('/account')

    await page.getByRole('button', { name: 'Delete my account', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Delete my account' })
    const remove = sheet.getByRole('button', { name: 'Delete my account' })
    await expect(remove).toBeDisabled()
    await sheet.getByLabel('Type DELETE to confirm').fill('delete')
    await remove.click()
    await expect(page).toHaveURL(/\/login$/)

    const [user] = await sql<{ name: string; deleted: boolean; seats: string }[]>`
      select name, deleted_at is not null as deleted,
             (select count(*) from user_member_mapping where user_id = ${PREIOS.deleter.id})::text as seats
        from users where id = ${PREIOS.deleter.id}
    `
    expect(user).toEqual({ name: 'Deleted account', deleted: true, seats: '0' })
  })

  test('a login with no garage can sign out of the first sign-up step', async ({ page, context }) => {
    await signIn(context, PREIOS.noGarage.phone)
    await page.goto('/home')
    await expect(page).toHaveURL(/\/onboarding\/step-1$/)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    const [{ sessions }] = await sql<{ sessions: string }[]>`
      select count(*)::text as sessions from refresh_tokens where user_id = ${PREIOS.noGarage.id} and not revoked
    `
    expect(sessions).toBe('0')
  })
})

test.describe('requests', () => {
  test('the garage withdraws its yes before the customer pays; the customer is told', async ({ page, context }) => {
    // An operator: whoever answers the garage's requests may take a yes back.
    await signIn(context, PREIOS.answerer.phone, G.id)
    await page.goto('/requests')

    await page.getByRole('button', { name: /^Withdraw your yes to / }).click()
    const sheet = page.getByRole('dialog', { name: 'Withdraw your yes?' })
    await sheet.getByRole('button', { name: 'Withdraw' }).click()
    await expect(page.getByText('Withdrawn. We told the customer.')).toBeVisible()

    const [row] = await sql<{ status: string; reply: string | null; withdrawn: boolean }[]>`
      select status, reply, withdrawn_at is not null as withdrawn from booking_requests where id = ${PREIOS.request}
    `
    expect(row).toEqual({ status: 'cancelled', reply: 'accepted', withdrawn: true })

    // The garage's own list now shows it closed, as withdrawn (the
    // customer's words: specs/users/withdraw-and-leave.spec.ts).
    const closed = await page.request.get(`${API}/api/v1/vendors/me/requests?scope=closed`, {
      headers: { 'x-vendor-id': G.id },
    })
    const item = ((await closed.json()).data.items as Array<{ id: string; withdrawn: boolean }>).find(
      (r) => r.id === PREIOS.request
    )
    expect(item?.withdrawn).toBe(true)
  })
})
