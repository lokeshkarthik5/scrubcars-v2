/**
 * Start pilot clean, on screen: marking a booking Test and deleting it from
 * its page, and the three steps of the page itself (scope, dry run with its
 * required download, confirm), with the copy the owner reads.
 *
 * Only CUSTOMERS.dataResetUi's two bookings at VENDORS.reset are deleted.
 * The page's list is "only bookings marked Test", which other specs mark
 * too, so the run unticks everything and ticks its own booking alone; its
 * third (resetUiKeep) stays unticked and must survive. The API's rules are
 * in data-reset-api.spec.ts.
 */
import { readFileSync } from 'node:fs'
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { BOOKINGS } from '../../support/seed-ids'

/** "#DA7A0008": the reference as the panel shows it. */
const reference = (id: string) => id.slice(0, 8).toUpperCase()

const bookingExists = async (id: string) =>
  (await sql`select 1 from bookings where id = ${id}`).length === 1

test.use({ storageState: asRole('admin') })

test.describe('start pilot clean, screens @p0', () => {
  test('a booking is marked Test on its page and deleted from there', async ({
    page,
  }) => {
    const id = BOOKINGS.resetUiSingle
    const ref = reference(id)

    await page.goto(`/bookings/${id}`)
    await expect(
      page.getByRole('heading', { name: `Booking #${ref}` })
    ).toBeVisible()
    // Paid through the E2E stand-in for Razorpay: no real money moved.
    await expect(page.getByText('Test-mode payment')).toBeVisible()

    const mark = page.getByRole('switch', { name: 'Mark as test' })
    await expect(mark).toHaveAttribute('aria-checked', 'false')
    await expect(
      page.getByRole('button', { name: 'Delete test booking…' })
    ).toHaveCount(0)
    // Marking changes the pilot numbers, so it is confirmed first, on a
    // sheet that says what happens; the switch waits for the answer.
    await mark.click()
    const sheet = page.getByRole('dialog', {
      name: `Mark #${ref} as a test booking?`,
    })
    await expect(
      sheet.getByText('It leaves Statistics and the pilot numbers.')
    ).toBeVisible()
    // Paid in test mode, so no real-money warning.
    await expect(sheet.getByText('real money', { exact: false })).toHaveCount(0)
    await expect(mark).toHaveAttribute('aria-checked', 'false')
    await sheet.getByRole('button', { name: 'Mark as test' }).click()
    await expect(sheet).toBeHidden()
    await expect(mark).toHaveAttribute('aria-checked', 'true')
    await expect(
      page.getByText('Left out of the pilot numbers. Marked by E2E Admin.')
    ).toBeVisible()
    // Its note, like every action ops takes on a booking.
    await expect(
      page.getByText(
        'Marked as a test booking. It is left out of the pilot numbers.'
      )
    ).toBeVisible()

    await page.getByRole('button', { name: 'Delete test booking…' }).click()
    const dialog = page.getByRole('dialog', {
      name: `Delete test booking #${ref}`,
    })
    await expect(dialog.getByText('This deletes, for good:')).toBeVisible()
    await expect(dialog.getByText('1 booking', { exact: true })).toBeVisible()

    // The red button waits for both. No name to type: the session signs it.
    const confirm = dialog.getByRole('button', { name: 'Delete 1 booking' })
    await expect(confirm).toBeDisabled()
    await expect(dialog.getByLabel('Your name')).toHaveCount(0)
    await dialog.getByLabel('I have a database backup from today').check()
    await dialog
      .getByLabel('Type DELETE 1 BOOKING to confirm')
      .fill('delete 1 booking')
    await expect(confirm).toBeDisabled()
    await dialog
      .getByLabel('Type DELETE 1 BOOKING to confirm')
      .fill('DELETE 1 BOOKING')
    await confirm.click()

    await expect(dialog.getByText('Done. Deleted by E2E Admin.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page).toHaveURL(/\/bookings$/)
    expect(await bookingExists(id)).toBe(false)
  })

  test('the page: scope, a dry run with its list to download, then the typed confirmation', async ({
    page,
  }) => {
    const id = BOOKINGS.resetUiMarked
    const ref = reference(id)
    const keep = BOOKINGS.resetUiKeep

    // While the switch is on, the page is in Settings' danger zone, out of
    // the daily menu.
    await page.goto('/settings')
    await page.getByRole('link', { name: /^Start pilot clean/ }).click()
    await expect(page).toHaveURL(/\/data-reset$/)
    await expect(
      page.getByRole('heading', { name: 'Start pilot clean' })
    ).toBeVisible()
    await expect(
      page.getByText('Real payments are always kept.', { exact: false })
    ).toBeVisible()

    // 1. Scope: the bookings marked Test, then only this one ticked.
    await page.getByRole('radio', { name: 'Only bookings marked Test' }).click()
    await page.getByRole('button', { name: /Show what.s in scope/ }).click()
    const box = page.getByRole('checkbox', { name: `Delete booking #${ref}` })
    await expect(box).toBeChecked()
    await page.getByRole('button', { name: 'Tick none' }).click()
    await expect(box).not.toBeChecked()
    await expect(page.getByRole('button', { name: 'Dry run' })).toBeDisabled()
    await box.check()

    // Loading the list again keeps the owner's unticks: a real booking they
    // protected is never quietly ticked again.
    const keepBox = page.getByRole('checkbox', {
      name: `Delete booking #${reference(keep)}`,
    })
    await expect(keepBox).not.toBeChecked()
    await page.getByRole('button', { name: 'Load again' }).click()
    await expect(page.getByRole('button', { name: 'Load again' })).toBeEnabled()
    await expect(box).toBeChecked()
    await expect(keepBox).not.toBeChecked()

    // The whole row is the box's label: a tap on its text ticks it. Ticks
    // are cleared first: a booking another spec marked Test since the first
    // load is new to the list and comes back ticked, and must not be in this
    // run.
    await page.getByRole('button', { name: 'Tick none' }).click()
    await page.getByText(`#${ref}`, { exact: true }).click()
    await expect(box).toBeChecked()
    await expect(keepBox).not.toBeChecked()

    await page.getByRole('button', { name: 'Dry run' }).click()

    // 2. The dry run, and the list it will not go on without.
    await expect(page.getByText('Nothing has been deleted yet.')).toBeVisible()
    await expect(page.getByText('1 booking', { exact: true })).toBeVisible()
    const next = page.getByRole('button', { name: 'Continue' })
    await expect(next).toBeDisabled()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download list (CSV)' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(
      /^detlio-test-data-\d{4}-\d{2}-\d{2}\.csv$/
    )
    const csv = readFileSync((await download.path())!, 'utf8')
    expect(csv).toContain('Reference,Outcome')
    expect(csv).toContain(`#${ref},Deleted`)
    // Every row in scope is in the file, the unticked ones too.
    expect(csv).toContain(`#${reference(keep)},Unticked — kept`)
    await next.click()

    // 3. Confirm: the backup and the phrase (the session signs it). The one red button.
    await page.getByLabel('I have a database backup from today').check()
    await page
      .getByLabel('Type DELETE 1 BOOKING to confirm')
      .fill('DELETE 1 BOOKING')
    await page.getByRole('button', { name: 'Delete 1 booking' }).click()

    await expect(page.getByText('Done. Deleted by E2E Admin.')).toBeVisible()
    await expect(page.getByText(/Audit record [0-9a-f-]{36}/)).toBeVisible()
    expect(await bookingExists(id)).toBe(false)
    expect(await bookingExists(keep)).toBe(true)
  })
})
