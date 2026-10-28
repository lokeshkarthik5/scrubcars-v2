/**
 * Requests (0064): customers' "Request a visit" / "Request a pickup" for
 * the team, reached from the menu: Open by default with the countdown,
 * the customer's phone masked and "Call garage" while a garage hasn't
 * answered; Failed with the chain it went through, Accepted, All, one
 * zone's and every zone; and Cancel with a reason (Keep it first), after
 * which the customer is told and the request shows as Detlio's cancel.
 *
 * Works on DEMAND's requests (Request Raghav's, from Perambur) only, and
 * puts the open one back before and after; customer reach's own specs
 * send and answer requests at the same time, so rows are found by name.
 * The rules are unit-tested in
 * apps/server/src/modules/booking-requests/booking-requests.admin.routes.test.ts
 * and apps/admin/lib/requests.test.ts.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { DEMAND } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const R = DEMAND.requests
const ONE = DEMAND.garages.one
const TWO = DEMAND.garages.two
const REASON = 'Garage closed for Diwali'

const putBack = async () => {
  await sql`update booking_requests set status = 'pending', closed_at = null, cancelled_by_name = null,
    cancel_reason = null, customer_told_at = null, respond_by = now() + interval '80 minutes',
    created_at = now() - interval '40 minutes', updated_at = now() - interval '40 minutes'
    where id = ${R.open}`
  await sql`update booking_requests set confirm_by = now() + interval '3 hours' where id = ${R.accepted}`
}

/** A request's card, by its customer and the garage asked now. */
const card = (page: Page, garage: string) =>
  page.getByRole('list', { name: 'Requests' }).getByRole('article', {
    name: `Request from ${DEMAND.requester.name} to ${garage}`,
  })

test.describe.serial('Requests @p0', () => {
  test.beforeAll(putBack)
  test.afterAll(putBack)

  test('from the menu: Open, with the countdown, the phone masked and Call garage', async ({
    page,
  }) => {
    await page.goto('/today')
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: /^Requests\b/ })
      .click()
    await expect(page).toHaveURL(/\/requests$/)
    await expect(
      page.getByRole('heading', { name: 'Requests', exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /^Open \d+$/ })
    ).toHaveAttribute('aria-pressed', 'true')

    const waiting = card(page, ONE.name)
    await expect(waiting).toHaveCount(1)
    await expect(waiting).toContainText('Waiting for the garage')
    await expect(waiting).toContainText('••••••5040')
    await expect(waiting).toContainText('Doorstep visit · Perambur')
    await expect(waiting).toContainText(DEMAND.service.name)
    // Put back 40 minutes old; a minute or two may have gone by since.
    await expect(waiting).toContainText(
      new RegExp(`Sent to ${ONE.name} 4\\d min ago, no answer yet`)
    )
    await expect(waiting).toContainText('left to answer')
    await expect(
      waiting.getByRole('link', { name: `Call garage ${ONE.name}` })
    ).toHaveAttribute('href', `tel:+91${ONE.phone}`)
    await expect(
      waiting.getByRole('button', { name: 'Cancel request' })
    ).toBeVisible()

    // A yes waiting for the customer: its fee and deadline; no call.
    const accepted = card(page, TWO.name)
    await expect(accepted).toContainText('Accepted, not paid yet')
    await expect(accepted).toContainText('travel fee ₹100')
    await expect(accepted).toContainText('customer to confirm by')
    await expect(
      accepted.getByRole('link', { name: /^Call garage/ })
    ).toHaveCount(0)
    await expect(
      accepted.getByRole('button', { name: 'Cancel request' })
    ).toBeVisible()

    // The customer's full number is never on the page.
    await expect(page.getByText(DEMAND.requester.phone)).toHaveCount(0)
  })

  test('Failed with its chain, Accepted, All; one zone’s, then every zone', async ({
    page,
  }) => {
    await page.goto('/requests')
    await page.getByRole('button', { name: /^Failed \d+$/ }).click()
    await expect(page).toHaveURL(/\/requests\?filter=failed$/)
    const passedOn = card(page, TWO.name)
    await expect(passedOn).toContainText('Nobody accepted')
    await expect(passedOn).toContainText(
      `Passed on from ${ONE.name} (couldn’t take it)`
    )
    await expect(
      passedOn.getByRole('button', { name: 'Cancel request' })
    ).toHaveCount(0)
    // The one nobody answered at all.
    await expect(card(page, ONE.name)).toContainText('Nobody accepted')

    await page.getByRole('button', { name: /^Accepted \d+$/ }).click()
    await expect(page).toHaveURL(/\/requests\?filter=accepted$/)
    await expect(
      page.getByRole('article', { name: new RegExp(DEMAND.requester.name) })
    ).toHaveCount(0)

    await page.getByRole('button', { name: /^All \d+$/ }).click()
    await expect(page).toHaveURL(/\/requests\?filter=all$/)
    await expect(
      page.getByRole('article', { name: new RegExp(DEMAND.requester.name) })
    ).toHaveCount(4)

    // One zone's (Coverage links here), straight to the address.
    await page.goto('/requests?filter=all&zone=perambur')
    await expect(
      page.getByText('Only requests sent from Perambur.')
    ).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(4)
    await expect(page.getByRole('button', { name: /^All 4$/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await page.getByRole('button', { name: 'Show every zone' }).click()
    await expect(page).toHaveURL(/\/requests\?filter=all$/)
    await expect(page.getByText('Only requests sent from')).toHaveCount(0)

    // Back to Open: the bare address (a prerendered page's router.replace
    // there did nothing once).
    await page.getByRole('button', { name: /^Open \d+$/ }).click()
    await expect(page).toHaveURL(/\/requests$/)
    await expect(
      page.getByRole('button', { name: /^Open \d+$/ })
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(card(page, ONE.name)).toContainText('Waiting for the garage')
  })

  test('Cancel with a reason: Keep it first; the customer is told; it shows as Detlio’s', async ({
    page,
  }) => {
    // The audit log is append-only: this run's row is the one after this.
    const [{ started }] = await sql<
      { started: Date }[]
    >`select now() as started`
    await page.goto('/requests')
    await card(page, ONE.name)
      .getByRole('button', { name: 'Cancel request' })
      .click()
    let dialog = page.getByRole('dialog', { name: 'Cancel this request' })
    await expect(dialog).toContainText(
      `${DEMAND.requester.name} asked ${ONE.name}.`
    )
    await dialog.getByRole('button', { name: 'Keep it' }).click()
    await expect(dialog).toHaveCount(0)

    await card(page, ONE.name)
      .getByRole('button', { name: 'Cancel request' })
      .click()
    dialog = page.getByRole('dialog', { name: 'Cancel this request' })
    const submit = dialog.getByRole('button', { name: 'Cancel request' })
    await expect(submit).toBeDisabled()
    await dialog.getByLabel('Reason (for the team)').fill('ab')
    await expect(submit).toBeDisabled()
    await dialog.getByLabel('Reason (for the team)').fill(REASON)
    await submit.click()
    await expect(dialog).toHaveCount(0)
    await expect(card(page, ONE.name)).toHaveCount(0)

    const [row] = await sql<
      { status: string; cancelled_by_name: string; cancel_reason: string }[]
    >`select status, cancelled_by_name, cancel_reason from booking_requests where id = ${R.open}`
    expect(row).toEqual({
      status: 'cancelled',
      cancelled_by_name: 'E2E Admin',
      cancel_reason: REASON,
    })
    // Told the way an expiry is, just after the answer.
    await expect
      .poll(
        async () =>
          (
            await sql<
              { told: boolean }[]
            >`select customer_told_at is not null as told from booking_requests where id = ${R.open}`
          )[0]?.told
      )
      .toBe(true)
    const [audit] = await sql<
      { actor_name: string }[]
    >`select actor_name from admin_audit_log where action = 'booking_request_cancelled'
      and summary->>'requestId' = ${R.open} and created_at >= ${started}
      order by created_at desc limit 1`
    expect(audit).toEqual({ actor_name: 'E2E Admin' })

    await page.getByRole('button', { name: /^All \d+$/ }).click()
    await expect(card(page, ONE.name).first()).toBeVisible()
    await expect(
      page
        .getByRole('article', {
          name: `Request from ${DEMAND.requester.name} to ${ONE.name}`,
        })
        .filter({ hasText: `Cancelled by E2E Admin: “${REASON}”` })
    ).toHaveCount(1)
  })
})
