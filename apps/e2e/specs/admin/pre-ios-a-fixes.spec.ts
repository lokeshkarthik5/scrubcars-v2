/**
 * Pre-iOS, part A (0065): what can be added can be removed or undone, in
 * admin. Documents' Remove; a logged complaint's "Logged in error" and its
 * Undo; a typed booking note edited and deleted by its author; the photo
 * waiver's Undo; collection lists' Reopen and Delete list; a dismissed
 * recommendation's Restore; and what only the garage could remove: a
 * holiday, the drawn doorstep area, unpaid extra work.
 *
 * Only PRE_IOS rows are touched (see e2e-ids.ts); each test its own.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { PRE_IOS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const P = PRE_IOS

test.describe('remove and undo in admin @p0', () => {
  test('Documents: Remove an optional one straight away, a required one after the Silver warning', async ({ page }) => {
    await page.goto(`/vendors/${P.garage.id}/edit?tab=documents`)
    const gst = page.getByRole('group', { name: 'GST certificate', exact: true })
    await gst.getByRole('button', { name: 'Remove GST certificate' }).click()
    const askGst = page.getByRole('group', { name: 'Remove GST certificate?' })
    await expect(askGst).not.toContainText('Silver')
    await askGst.getByRole('button', { name: 'Remove GST certificate' }).click()
    await expect(gst.getByText('Not uploaded', { exact: true })).toBeVisible()
    expect((await sql`select 1 from vendor_documents where id = ${P.documents.gst}`).length).toBe(0)

    const id = page.getByRole('group', { name: 'Owner ID', exact: true })
    await id.getByRole('button', { name: 'Remove Owner ID' }).click()
    const askId = page.getByRole('group', { name: 'Remove Owner ID?' })
    await expect(askId).toContainText('Owner ID is one of Silver’s steps: without it approved, the garage may lose Silver.')
    // Keep it changes nothing.
    await askId.getByRole('button', { name: 'Keep it' }).click()
    await expect(id.getByText('Approved', { exact: true })).toBeVisible()
    await id.getByRole('button', { name: 'Remove Owner ID' }).click()
    await page.getByRole('group', { name: 'Remove Owner ID?' }).getByRole('button', { name: 'Remove Owner ID' }).click()
    await expect(id.getByText('Not uploaded', { exact: true })).toBeVisible()
    const audit = await sql<{ actor_name: string; type: string }[]>`
      select actor_name, summary->>'type' as type from admin_audit_log
       where action = 'garage_document_removed' and summary->>'vendorId' = ${P.garage.id}
       order by created_at
    `
    expect(audit).toEqual([
      { actor_name: 'E2E Admin', type: 'gst_certificate' },
      { actor_name: 'E2E Admin', type: 'owner_id' },
    ])
  })

  test('a logged complaint: Logged in error, with why, and Undo', async ({ page }) => {
    await page.goto(`/complaints/${P.complaint}`)
    await page.getByRole('button', { name: 'Logged in error…' }).click()
    const mark = page.getByRole('button', { name: 'Mark as logged in error' })
    await expect(mark).toBeDisabled()
    await page.getByLabel('Why was it logged in error?').fill('Logged against the wrong caller')
    await mark.click()
    await expect(page.getByText(/^Marked by E2E Admin, .+: Logged against the wrong caller$/)).toBeVisible()
    await expect(page.getByText('Logged in error', { exact: true }).first()).toBeVisible()
    const marked = await sql<{ error_marked_by: string | null }[]>`
      select error_marked_by from complaints where id = ${P.complaint}
    `
    expect(marked[0]!.error_marked_by).toBe('E2E Admin')

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('button', { name: 'Logged in error…' })).toBeVisible()
    const undone = await sql<{ error_marked_at: Date | null }[]>`
      select error_marked_at from complaints where id = ${P.complaint}
    `
    expect(undone[0]!.error_marked_at).toBeNull()
  })

  test('a booking: a typed note edited and deleted by its author, and the photo waiver undone', async ({ page }) => {
    await page.goto(`/bookings/${P.bookings.waived}`)
    const notes = page.getByRole('list', { name: 'Notes, newest first' })

    await page.getByLabel('Add a note').fill('Called the customer about parking')
    await page.getByRole('button', { name: 'Add note' }).click()
    const note = notes.getByRole('listitem').filter({ hasText: 'Called the customer about parking' })
    await note.getByRole('button', { name: 'Edit your note' }).click()
    await note.getByLabel('Edit your note').fill('Called the customer about parking, twice')
    await note.getByRole('button', { name: 'Save note' }).click()
    const edited = notes.getByRole('listitem').filter({ hasText: 'Called the customer about parking, twice' })
    await expect(edited.getByText('· edited', { exact: false })).toBeVisible()
    await edited.getByRole('button', { name: 'Delete your note' }).click()
    await edited.getByRole('button', { name: 'Delete note' }).click()
    await expect(edited).toHaveCount(0)
    expect(
      (await sql`select 1 from booking_notes where booking_id = ${P.bookings.waived} and kind = 'typed'`).length
    ).toBe(0)

    // The waiver: Undo, and a note (an action's, so not editable) says so.
    await page.getByRole('button', { name: 'Undo waiver' }).click()
    await expect(page.getByRole('button', { name: 'Undo waiver' })).toHaveCount(0)
    const system = notes.getByRole('listitem').filter({ hasText: 'Photo waiver undone by E2E Admin' })
    await expect(system).toBeVisible()
    await expect(system.getByRole('button', { name: 'Edit your note' })).toHaveCount(0)
    const [row] = await sql<{ photos_waived_at: Date | null }[]>`
      select photos_waived_at from bookings where id = ${P.bookings.waived}
    `
    expect(row!.photos_waived_at).toBeNull()
  })

  test('extra work the customer has not paid is withdrawn for the garage', async ({ page }) => {
    await page.goto(`/bookings/${P.bookings.extraWork}`)
    await page.getByRole('button', { name: 'Withdraw PreiOS wiper blades' }).click()
    await page
      .getByRole('group', { name: 'Withdraw PreiOS wiper blades?' })
      .getByRole('button', { name: 'Withdraw extra work' })
      .click()
    await expect(page.getByText('Withdrawn', { exact: true })).toBeVisible()
    const [charge] = await sql<{ status: string; cancel_reason: string }[]>`
      select status, cancel_reason from booking_charges where id = ${P.extraWorkCharge}
    `
    expect(charge).toEqual({ status: 'cancelled', cancel_reason: 'withdrawn' })
  })

  test('a garage: its holiday removed and its drawn doorstep area cleared', async ({ page }) => {
    await page.goto(`/vendors/${P.garage.id}/edit?tab=operations`)
    await page.getByRole('button', { name: /^Remove the holiday on / }).click()
    await expect(page.getByText('None set.')).toBeVisible()
    expect((await sql`select 1 from vendor_closures where id = ${P.closure}`).length).toBe(0)

    await page.getByRole('tab', { name: 'Location' }).click()
    await expect(page.getByText('The garage drew its own doorstep area.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear drawn area…' }).click()
    await page.getByRole('button', { name: 'Clear drawn area', exact: true }).click()
    await expect(page.getByText('The garage drew its own doorstep area.')).toHaveCount(0)
    const [garage] = await sql<{ drawn: boolean }[]>`
      select doorstep_area is not null as drawn from vendors where id = ${P.garage.id}
    `
    expect(garage!.drawn).toBe(false)
    const audits = await sql<{ action: string }[]>`
      select action from admin_audit_log where summary->>'vendorId' = ${P.garage.id}
         and action in ('garage_closure_removed', 'garage_doorstep_area_cleared') order by created_at
    `
    expect(audits.map((a) => a.action)).toEqual(['garage_closure_removed', 'garage_doorstep_area_cleared'])
  })

  test('collection lists: a closed one reopened, an open one deleted', async ({ page }) => {
    await page.goto('/today?view=all')
    await page.getByRole('button', { name: 'Show closed lists' }).click()
    const closed = page.getByRole('region', { name: 'Closed lists' }).locator(`#collection-list-${P.collection.closedList}`)
    await closed.getByRole('button', { name: 'Reopen' }).click()
    await expect(page.getByText('List reopened')).toBeVisible()
    const [list] = await sql<{ closed_at: Date | null }[]>`
      select closed_at from collection_lists where id = ${P.collection.closedList}
    `
    expect(list!.closed_at).toBeNull()

    const open = page.locator(`#collection-list-${P.collection.openList}`).first()
    await open.getByRole('button', { name: 'Delete list' }).click()
    await page
      .getByRole('dialog', { name: `Delete ${P.collection.assignee}’s list?` })
      .getByRole('button', { name: 'Delete list' })
      .click()
    await expect(page.locator(`#collection-list-${P.collection.openList}`)).toHaveCount(0)
    expect((await sql`select 1 from collection_lists where id = ${P.collection.openList}`).length).toBe(0)
    expect((await sql`select 1 from collection_items where id = ${P.collection.openItem}`).length).toBe(0)
  })

  test('Coverage: a dismissed recommendation restored to act on', async ({ page }) => {
    await page.goto('/coverage?zone=none')
    const drawer = page.getByRole('dialog', { name: 'Not in a zone' })
    await drawer.getByRole('button', { name: /^Dismissed · / }).click()
    await drawer
      .getByRole('list', { name: 'Dismissed recommendations for Not in a zone' })
      .getByRole('button', { name: `Restore ${P.dismissed.name}` })
      .click()
    await expect(
      drawer.getByRole('list', { name: 'Recommendations for Not in a zone' }).getByText(P.dismissed.name)
    ).toBeVisible()
    const [rec] = await sql<{ status: string; handled_by: string | null }[]>`
      select status, handled_by from garage_recommendations where id = ${P.dismissed.id}
    `
    expect(rec).toEqual({ status: 'new', handled_by: null })
  })
})
