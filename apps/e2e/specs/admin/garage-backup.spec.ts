/**
 * Back up all garages (owner-approved screens, 18 Nov 2026). As the owner
 * ('admin', E2E Admin): Download backup beside Add garage opens the sheet,
 * which lists each spreadsheet with its row count; the red button downloads
 * a .zip holding every spreadsheet and the Read me, with phones and bank
 * numbers masked; the download is recorded and "Last backup" says so. With
 * the switch on, the same .zip holds the full numbers. The teammate (a
 * personal login that is not the owner) sees no button and the API refuses
 * them.
 *
 * GARAGE_BACKUP's garage (ids 7850–7899) carries the numbers looked for. The
 * two downloads run in order: each moves "Last backup".
 */
import { readFileSync } from 'node:fs'
import type { Download, Page } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { GARAGE_BACKUP } from '../../support/seed-ids'

const B = GARAGE_BACKUP

const FILES = [
  'garages.csv',
  'services.csv',
  'opening-hours.csv',
  'photos.csv',
  'bank-and-payout-details.csv',
  'bookings.csv',
  'booking-items.csv',
  'reviews.csv',
  'payouts.csv',
  'payout-lines.csv',
  'garage-book-customers.csv',
  'garage-book-bills.csv',
  'garage-book-expenses.csv',
  'garage-book-stock.csv',
  'documents.csv',
  'read-me.txt',
]

const LINES = [
  'Garages and their details',
  'Services and prices',
  'Opening hours',
  'Photos (links)',
  'Bank and payout details',
  'Bookings',
  'Reviews',
  'Payouts',
  'Garage Book: customers, bills, expenses, stock',
  'Documents (links)',
]

/** The .zip's files as text, by name. */
async function unzip(download: Download): Promise<Record<string, string>> {
  const files = unzipSync(new Uint8Array(readFileSync((await download.path())!)))
  return Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, strFromU8(bytes)]))
}

/** The CSV line for a row whose cells include `text`. */
const lineWith = (csv: string, text: string) => csv.split('\r\n').find((line) => line.includes(text)) ?? ''

async function openSheet(page: Page) {
  await page.goto('/vendors')
  await page.getByRole('button', { name: 'Download backup', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Back up all garages' })
  await expect(sheet.getByText('One .zip file. Inside, a spreadsheet (CSV) for each kind of data.', { exact: false })).toBeVisible()
  return sheet
}

const newestBackup = async () =>
  (
    await sql<{ actor_name: string; detail: { full: boolean } }[]>`
      select actor_name, detail from admin_audit_log
       where action = 'garage_backup_downloaded'
       order by created_at desc limit 1
    `
  )[0]

test.describe('back up all garages, as the owner @p0', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: asRole('admin') })

  test('the sheet lists every spreadsheet; the .zip holds them all, numbers masked', async ({ page }) => {
    const sheet = await openSheet(page)

    // The counts, then one line per spreadsheet with its rows.
    await expect(sheet.getByTestId('backup-totals')).toHaveText(/^[\d,]+ garages · [\d,]+ bookings · [\d,]+ Garage Book bills$/)
    const inside = sheet.getByRole('list', { name: 'What’s inside' })
    for (const line of LINES) {
      await expect(inside.getByRole('listitem').filter({ hasText: line })).toHaveCount(1)
    }
    await expect(inside.getByRole('listitem').filter({ hasText: 'Garage Book' })).toContainText('4 sheets')
    await expect(inside.getByRole('listitem').filter({ hasText: 'Garages and their details' })).toContainText(/\d/)
    await expect(sheet.getByText('“Read me”: what each column means')).toBeVisible()

    // Full numbers are off by default.
    const numbers = sheet.getByRole('switch', { name: 'Include full phone numbers and bank account numbers' })
    await expect(numbers).toHaveAttribute('aria-checked', 'false')
    await expect(sheet.getByText('Off: they’re shown as 98•••••210')).toBeVisible()
    await expect(
      sheet.getByText('Each download is recorded in the activity log: who, when, and whether full numbers were included.')
    ).toBeVisible()
    await expect(sheet.getByText('Signed as E2E Admin')).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      sheet.getByRole('button', { name: 'Download backup (.zip)' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^detlio-backup-\d{4}-\d{2}-\d{2}\.zip$/)
    const files = await unzip(download)
    expect(Object.keys(files)).toEqual(FILES)

    // Every sheet starts with the garage; this garage's numbers are masked.
    expect(files['garages.csv'].split('\r\n')[0]).toMatch(/^Garage ID,Garage,/)
    const garage = lineWith(files['garages.csv'], B.garage.id)
    expect(garage).toContain(B.garage.name)
    expect(garage).toContain('90•••••851')
    expect(garage).toContain('90•••••850')
    expect(garage).not.toContain(B.garage.phone)
    expect(garage).not.toContain(B.owner.phone)
    expect(garage).not.toContain(B.noteNumber)
    const bank = lineWith(files['bank-and-payout-details.csv'], B.garage.id)
    expect(bank).toContain(B.bank.ifsc)
    expect(bank).toContain('50•••••789')
    expect(bank).toContain('90•••••@ybl')
    expect(bank).not.toContain(B.bank.accountNumber)
    const customer = lineWith(files['garage-book-customers.csv'], B.bookCustomer.id)
    expect(customer).toContain(B.bookCustomer.name)
    expect(customer).toContain('90•••••853')
    expect(customer).not.toContain(B.bookCustomer.phone)
    // Nothing anywhere in the .zip holds the fixture's full numbers.
    const everything = Object.values(files).join('\n')
    for (const number of [B.garage.phone, B.owner.phone, B.noteNumber, B.bookCustomer.phone, B.bank.accountNumber]) {
      expect(everything).not.toContain(number)
    }
    expect(files['read-me.txt']).toContain('Phone numbers and bank account numbers: hidden, shown like 98•••••210.')
    expect(files['read-me.txt']).toContain('Email addresses, UPI IDs and ID numbers written in notes are hidden the same way.')
    expect(files['read-me.txt']).toContain('garage-book-stock.csv (')
    expect(files['read-me.txt']).toContain('  Garage ID: ')

    // Done: the file, the numbers and the record.
    await expect(sheet.getByText('Your backup is ready.')).toBeVisible()
    await expect(sheet.getByTestId('backup-file')).toHaveText(/^detlio-backup-\d{4}-\d{2}-\d{2}\.zip · [\d.]+ (KB|MB)$/)
    await expect(sheet.getByText(/^\d+ spreadsheets \+ Read me$/)).toBeVisible()
    await expect(sheet.getByText('masked numbers')).toBeVisible()
    await expect(sheet.getByText('Recorded in the activity log')).toBeVisible()
    await expect(sheet.getByText(/· E2E Admin$/)).toBeVisible()

    // Download again saves the same file once more, without a new record.
    const before = await newestBackup()
    const [again] = await Promise.all([
      page.waitForEvent('download'),
      sheet.getByRole('button', { name: 'Download again' }).click(),
    ])
    expect(again.suggestedFilename()).toBe(download.suggestedFilename())
    expect(await newestBackup()).toEqual(before)

    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toBeHidden()
    expect(before).toEqual({ actor_name: 'E2E Admin', detail: { full: false } })
    await expect(page.getByTestId('last-backup')).toHaveText(/^Last backup: \d{1,2} \w{3}, \d{1,2}:\d{2} [ap]m by E2E Admin$/)
  })

  test('with the switch on, the full numbers, and the record says so', async ({ page }) => {
    const sheet = await openSheet(page)
    const numbers = sheet.getByRole('switch', { name: 'Include full phone numbers and bank account numbers' })
    await numbers.click()
    await expect(numbers).toHaveAttribute('aria-checked', 'true')
    await expect(sheet.getByText('On: full numbers, for this download only')).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      sheet.getByRole('button', { name: 'Download backup (.zip)' }).click(),
    ])
    const files = await unzip(download)
    const garage = lineWith(files['garages.csv'], B.garage.id)
    expect(garage).toContain(B.garage.phone)
    expect(garage).toContain(B.owner.phone)
    expect(garage).toContain(B.noteNumber)
    expect(lineWith(files['bank-and-payout-details.csv'], B.garage.id)).toContain(B.bank.accountNumber)
    expect(lineWith(files['garage-book-customers.csv'], B.bookCustomer.id)).toContain(B.bookCustomer.phone)
    expect(files['read-me.txt']).toContain('Phone numbers and bank account numbers: included in full.')

    await expect(sheet.getByText('full numbers', { exact: true })).toBeVisible()
    expect(await newestBackup()).toEqual({ actor_name: 'E2E Admin', detail: { full: true } })

    // The switch is off again next time.
    await sheet.getByRole('button', { name: 'Done' }).click()
    await page.getByRole('button', { name: 'Download backup', exact: true }).click()
    await expect(
      page
        .getByRole('dialog', { name: 'Back up all garages' })
        .getByRole('switch', { name: 'Include full phone numbers and bank account numbers' })
    ).toHaveAttribute('aria-checked', 'false')
  })
})

test.describe('back up all garages, as a teammate', () => {
  test.use({ storageState: asRole('admin-teammate') })

  test('no button, no last-backup line, and the API says owner only', async ({ page }) => {
    await page.goto('/vendors')
    await expect(page.getByRole('link', { name: 'Add garage' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download backup', exact: true })).toHaveCount(0)
    await expect(page.getByTestId('last-backup')).toHaveCount(0)

    for (const res of [
      await page.request.get(`${API}/api/v1/admin/backup`),
      await page.request.get(`${API}/api/v1/admin/backup/last`),
      await page.request.post(`${API}/api/v1/admin/backup/started`, { data: { full: true } }),
    ]) {
      expect(res.status()).toBe(403)
      expect((await res.json()).code).toBe('ADMIN_OWNER_ONLY')
    }
  })
})
