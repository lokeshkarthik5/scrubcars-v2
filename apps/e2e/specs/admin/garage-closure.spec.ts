/**
 * "Close my garage" (0066), the team's side: the Garages list names a
 * garage whose owner asked to close it; its page shows the request with
 * Move to Bin, the reason filled in; moving it to the Bin confirms the
 * request in the same transaction. PREIOS.closing, which nobody else reads.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { PREIOS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const C = PREIOS.closing

test('an owner’s request to close is listed, and Move to Bin confirms it @p0', async ({ page }) => {
  // The API lists it for the team.
  const open = await page.request.get(`${API}/api/v1/admin/garage-closures`)
  expect(open.status()).toBe(200)
  expect((await open.json()).data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ vendorId: C.id, garageName: C.name, reason: PREIOS.closure.reason, status: 'open' }),
    ])
  )

  await page.goto('/vendors')
  const notice = page.getByRole('region', { name: 'Garages asking to close' })
  await expect(notice).toBeVisible()
  await notice.getByRole('link', { name: C.name }).click()
  await expect(page).toHaveURL(new RegExp(`/vendors/${C.id}/edit`))

  await expect(page.getByText('The owner asked to close this garage')).toBeVisible()
  await expect(page.getByText(`“${PREIOS.closure.reason}”`)).toBeVisible()
  await page.getByRole('button', { name: 'Move to Bin', exact: true }).click()

  const sheet = page.getByRole('dialog', { name: `Move ${C.name} to the Bin` })
  await expect(sheet.getByLabel('Reason (optional)')).toHaveValue(`Owner asked to close: ${PREIOS.closure.reason}`)
  await expect(sheet.getByText('No upcoming bookings to cancel.')).toBeVisible()
  await sheet.getByRole('button', { name: 'Move to bin' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Moved to the Bin.' })).toBeVisible()
  await expect(page.getByText('In the Bin, read-only')).toBeVisible()

  const [row] = await sql<{ binned: boolean; reason: string; status: string; confirmed_by_name: string }[]>`
    select v.deleted_at is not null as binned, v.deleted_reason as reason, r.status, r.confirmed_by_name
      from vendors v join garage_closure_requests r on r.vendor_id = v.id
     where v.id = ${C.id} and r.id = ${PREIOS.closure.id}
  `
  expect(row).toEqual({
    binned: true,
    reason: `Owner asked to close: ${PREIOS.closure.reason}`,
    status: 'confirmed',
    confirmed_by_name: 'E2E Admin',
  })
  const [audit] = await sql<{ closure: string | null }[]>`
    select summary->>'closureRequestId' as closure from admin_audit_log
     where action = 'garage_binned' and summary->>'vendorId' = ${C.id}
     order by created_at desc limit 1
  `
  expect(audit).toEqual({ closure: PREIOS.closure.id })

  // Off the list once confirmed.
  await page.goto('/vendors')
  await expect(page.getByRole('link', { name: C.name, exact: true })).toHaveCount(0)
})
