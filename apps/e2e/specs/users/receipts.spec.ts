/**
 * The customer's payment receipt: opened from the booking page, saved as a
 * PDF through the print screen, and only ever the customer's own.
 *
 * Reads CUSTOMERS.receipts' two bookings at MAIN (see seedBookingRows): a
 * completed one with two services and SAVE20, and one the garage declined
 * that ops refunded in full. The seed writes their payments directly, as a
 * row written by hand would be, so neither has a receipt number until this
 * file first opens it: that is the receipt read's safety net issuing one
 * (bookings.service getReceipt). The numbers, and the counters in
 * receipt_counters, are the only rows this file writes, and no other file
 * reads these two. The last two tests run migration 0030's SQL: its backfill
 * against the seeded rows, in temporary tables inside a transaction it rolls
 * back, and its financial-year expression on its own. What goes on a
 * receipt, and every figure, is unit-tested in
 * apps/server/src/lib/receipts.test.ts; this pins that the page shows it,
 * that the number is issued once, and that the API keeps it to its owner.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { request } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { getReceiptNumber, receiptCounters, sql } from '../../support/db'
import { BOOKINGS, CUSTOMERS } from '../../support/seed-ids'
import { financialYearOf, formatReceiptSerial } from '../../../server/src/lib/receipts'

/** The migration whose backfill the last test runs (see there). */
const MIGRATION_0030 = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../server/drizzle/0030_receipt_numbers.sql'
)

const receiptUrl = (id: string) => `${API}/api/v1/bookings/${id}/receipt`

/** "2EC10001": the booking reference. */
const reference = (id: string) => id.slice(0, 8).toUpperCase()

/** DTL/<financial year>/<six-digit serial>, as formatReceiptSerial writes it. */
const RECEIPT_NUMBER = /^DTL\/\d{2}-\d{2}\/\d{6}$/

test.describe('receipts @p0', () => {
  test.describe('the customer', () => {
    // A 390px phone, the width the receipt is designed down to.
    test.use({ storageState: asRole('customer-receipts'), viewport: { width: 390, height: 844 } })

    test('opens the receipt from the booking: number, services, amounts, payment id, not a tax invoice', async ({
      page,
    }) => {
      await page.goto(`/bookings/${BOOKINGS.receiptPaid}`)
      await page.getByRole('link', { name: 'View receipt' }).click()
      await expect(page).toHaveURL(new RegExp(`/bookings/${BOOKINGS.receiptPaid}/receipt$`))

      const receipt = page.getByRole('article', { name: /^Payment receipt / })
      await expect(receipt).toBeVisible()
      await expect(receipt.getByRole('heading', { name: 'Payment receipt' })).toBeVisible()

      // The seed leaves the booking unnumbered, so the first open issued its
      // number; the page shows the one stored for the booking.
      const stored = await getReceiptNumber(BOOKINGS.receiptPaid)
      expect(stored?.number).toMatch(RECEIPT_NUMBER)
      const number = stored!.number
      expect(number.length).toBeLessThanOrEqual(16)
      await expect(receipt).toHaveAccessibleName(`Payment receipt ${number}`)
      // Printed as issued, slashes and all, in the header and the footer.
      await expect(receipt.getByText(number, { exact: true })).toHaveCount(2)

      // The customer, masked: a receipt is made to be shared.
      await expect(receipt).toContainText(CUSTOMERS.receipts.name)
      await expect(receipt).toContainText(`+91 ******${CUSTOMERS.receipts.phone.slice(-4)}`)
      await expect(receipt).not.toContainText(CUSTOMERS.receipts.phone)

      // Each service beside the price it was sold at, then the code and what
      // was charged.
      await expect(receipt).toContainText('Express Wash₹499.00')
      await expect(receipt).toContainText('Full Body Detail₹1,999.00')
      await expect(receipt).toContainText('Subtotal₹2,498.00')
      await expect(receipt).toContainText('Discount (SAVE20)−₹200.00')
      await expect(receipt).toContainText('Paid at booking₹2,298.00')
      await expect(receipt).toContainText('Online (Razorpay)')
      await expect(receipt).toContainText('pay_seed_receipt_paid')
      await expect(receipt).toContainText('Net amount paid₹2,298.00')

      await expect(receipt.getByText('Operated by ScrubCars')).toBeVisible()
      await expect(receipt.getByText(/Radha Nagar Main Road, Chromepet/)).toBeVisible()
      await expect(receipt).toContainText('or write to contact.scrubcars@gmail.com')
      await expect(receipt.getByText('This is a payment receipt, not a tax invoice.')).toBeVisible()
      // Receipt now, GST later: nothing on it may claim to be a tax document.
      await expect(receipt).not.toContainText('GSTIN')
      await expect(receipt.getByText(/^Tax invoice/i)).toHaveCount(0)

      await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()

      // On paper, only the receipt: the buttons and the hint are gone.
      await page.emulateMedia({ media: 'print' })
      await expect(page.getByRole('button', { name: 'Download PDF' })).toBeHidden()
      await expect(receipt).toBeVisible()
      await page.emulateMedia({ media: 'screen' })

      // Fits the phone: nothing scrolls sideways.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow).toBeLessThanOrEqual(0)

      // And the API behind it, in its envelope. The page has just refreshed
      // this context's session, so the request is signed in.
      const response = await page.request.get(receiptUrl(BOOKINGS.receiptPaid))
      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data).toMatchObject({
        receiptNumber: number,
        subtotal: '2498.00',
        discount: { code: 'SAVE20', amount: '200.00' },
        bookingPayment: { amount: '2298.00', paymentId: 'pay_seed_receipt_paid' },
        refunds: [],
        netPaid: '2298.00',
      })
    })

    test('a refunded booking shows the refund line', async ({ page }) => {
      await page.goto(`/bookings/${BOOKINGS.receiptRefunded}/receipt`)

      const receipt = page.getByRole('article', { name: /^Payment receipt DTL\/\d{2}-\d{2}\/\d{6}$/ })
      await expect(receipt).toBeVisible()
      await expect(receipt).toContainText(reference(BOOKINGS.receiptRefunded))
      await expect(receipt).toContainText('Cancelled')
      await expect(receipt).toContainText('Paid at booking₹499.00')
      await expect(receipt).toContainText('Refund−₹499.00')
      await expect(receipt).toContainText('Refunded to original payment method')
      await expect(receipt).toContainText('rfnd_E2ERECEIPT0001')
      await expect(receipt).toContainText('Net amount paid₹0.00')
    })

    test('a number is issued once: the same on every load, one per receipt, and the counter keeps up', async ({
      page,
    }) => {
      const read = async (id: string) => {
        const response = await page.request.get(receiptUrl(id))
        expect(response.status()).toBe(200)
        const body = await response.json()
        expect(body.success).toBe(true)
        return body.data.receiptNumber as string
      }

      // The page is opened first so the request below is signed in (it has
      // just refreshed this context's session).
      await page.goto(`/bookings/${BOOKINGS.receiptPaid}/receipt`)
      const receipt = page.getByRole('article', { name: /^Payment receipt / })
      await expect(receipt).toBeVisible()

      const paid = await read(BOOKINGS.receiptPaid)
      const refunded = await read(BOOKINGS.receiptRefunded)

      for (const number of [paid, refunded]) {
        expect(number).toMatch(RECEIPT_NUMBER)
        expect(number.length).toBeLessThanOrEqual(16)
      }
      // One per receipt.
      expect(paid).not.toBe(refunded)
      // The page prints what the API sends.
      await expect(receipt).toHaveAccessibleName(`Payment receipt ${paid}`)
      await expect(receipt.getByText(paid, { exact: true }).first()).toBeVisible()

      // Never changed: a second load, of the API and of the page, gives the
      // same number, and it is the one stored.
      expect(await read(BOOKINGS.receiptPaid)).toBe(paid)
      expect(await read(BOOKINGS.receiptRefunded)).toBe(refunded)
      await page.reload()
      await expect(page.getByRole('article', { name: `Payment receipt ${paid}` })).toBeVisible()
      // The saved PDF is named after it, with hyphens: a file name cannot
      // hold a slash.
      await expect(page).toHaveTitle(`Detlio receipt ${paid.replaceAll('/', '-')}`)
      expect((await getReceiptNumber(BOOKINGS.receiptPaid))?.number).toBe(paid)
      expect((await getReceiptNumber(BOOKINGS.receiptRefunded))?.number).toBe(refunded)

      // Gapless: in every financial year, the counter is the number of
      // receipts issued and the highest serial. Other files issue receipts at
      // the same time; the helper reads all three in one snapshot.
      const years = await receiptCounters()
      expect(years.map((year) => year.financial_year)).toContain(
        (await getReceiptNumber(BOOKINGS.receiptPaid))!.financial_year
      )
      for (const year of years) {
        expect(year, `receipt_counters for ${year.financial_year}`).toEqual({
          financial_year: year.financial_year,
          last_seq: year.issued,
          issued: year.issued,
          max_seq: year.issued,
        })
      }
    })

    test('a receipt number no longer stops an account being deleted (0066), and stays with the booking', async ({ page }) => {
      // Opening the receipt issues its number (if no earlier test has) and
      // refreshes this context's session for the requests below.
      await page.goto(`/bookings/${BOOKINGS.receiptPaid}/receipt`)
      await expect(page.getByRole('article', { name: /^Payment receipt / })).toBeVisible()

      // Deletion anonymises now and keeps the bookings a number was issued
      // on, so a receipt is never a reason to refuse. Only asked, never
      // done: this customer's session serves the rest of the file
      // (account-delete.spec.ts deletes an account of its own).
      const preview = await page.request.get(`${API}/api/v1/account/deletion`)
      expect(preview.status()).toBe(200)
      const blockers = (await preview.json()).data.blockers as Array<{ code: string }>
      expect(blockers.map((b) => b.code)).not.toContain('ACCOUNT_HAS_RECEIPTS')

      const still = await page.request.get(receiptUrl(BOOKINGS.receiptPaid))
      expect(still.status()).toBe(200)
    })
  })

  test('another customer gets a 404, and a booking with nothing paid has no receipt yet', async () => {
    // A fresh login rather than a saved state: a bare request context cannot
    // refresh a 15-minute token, and a 401 would pass for the wrong reason.
    // This number belongs to this file alone.
    const stranger = await loginViaApi(CUSTOMERS.receiptsStranger.phone)

    const theirs = await stranger.get(receiptUrl(BOOKINGS.receiptPaid))
    expect(theirs.status()).toBe(404)
    expect(await theirs.json()).toEqual({
      success: false,
      message: 'Booking not found',
      code: 'BOOKING_NOT_FOUND',
    })

    const unpaid = await stranger.get(receiptUrl(BOOKINGS.receiptUnpaid))
    expect(unpaid.status()).toBe(404)
    expect(await unpaid.json()).toEqual({
      success: false,
      message: expect.stringContaining('no receipt for this booking yet'),
      code: 'RECEIPT_NOT_AVAILABLE',
    })

    await stranger.dispose()
  })

  test('ops finds the booking by its receipt number, however it is typed', async () => {
    // The number exists once the customer has opened the receipt; read it
    // through the API rather than assume the earlier tests ran.
    const customer = await loginViaApi(CUSTOMERS.receipts.phone)
    const opened = await customer.get(receiptUrl(BOOKINGS.receiptPaid))
    expect(opened.status()).toBe(200)
    const number: string = (await opened.json()).data.receiptNumber
    await customer.dispose()

    const admin = await request.newContext({ baseURL: API, storageState: asRole('admin') })
    try {
      const found = await admin.get(`/api/v1/admin/bookings?q=${encodeURIComponent(number.toLowerCase())}`)
      expect(found.status()).toBe(200)
      const body = await found.json()
      expect(body.success).toBe(true)
      // Exactly the one booking: a receipt number is unique.
      expect(body.data.map((row: { id: string }) => row.id)).toEqual([BOOKINGS.receiptPaid])

      // As the saved PDF names it, which is what a customer's WhatsApp shows
      // and ops copies: hyphens for slashes. And read out over a call.
      for (const typed of [
        `Detlio receipt ${number.replaceAll('/', '-')}.pdf`,
        number.replaceAll('/', '-'),
        number.replaceAll('/', ' ').toLowerCase(),
      ]) {
        const again = await admin.get(`/api/v1/admin/bookings?q=${encodeURIComponent(typed)}`)
        expect(again.status(), typed).toBe(200)
        expect((await again.json()).data.map((row: { id: string }) => row.id), typed).toEqual([
          BOOKINGS.receiptPaid,
        ])
      }
    } finally {
      await admin.dispose()
    }
  })

  test("migration 0030's backfill numbers the seeded receipts as the app would", async () => {
    // On CI the migration runs on an empty database, before the seed, so its
    // backfill never meets a row there. Here it does: the seed writes paid
    // bookings without numbers, a moved booking among them. The backfill's
    // own statements run as written, but against empty temporary tables of
    // the same shape (an unqualified name finds pg_temp before public), so
    // what it writes is only what it decided, nothing another file is issuing
    // at the same time is touched, and all of it goes at the rollback.
    // Repeatable read, so its two runs see the same bookings.
    const migration = readFileSync(MIGRATION_0030, 'utf8')
    const backfill = migration
      .split('--> statement-breakpoint')
      .filter((statement) => /INSERT INTO "receipt_(numbers|counters)"/.test(statement))
    expect(backfill).toHaveLength(2)

    type Issued = {
      root_booking_id: string
      financial_year: string
      seq: number
      number: string
      issued_at: Date
      // Microseconds since the epoch: Postgres orders by these, and a JS Date
      // keeps only milliseconds.
      issued_us: string
      // Whether the booking it hangs off is a chain's first.
      is_root: boolean
    }
    type Counter = { financial_year: string; last_seq: number }
    type Run = { numbers: Issued[]; counters: Counter[] }
    const runs: Run[] = []

    const rollback = new Error('rolled back on purpose')
    await sql
      .begin('isolation level repeatable read', async (tx) => {
        await tx.unsafe(
          'create temp table receipt_numbers (like public.receipt_numbers including all) on commit drop'
        )
        await tx.unsafe(
          'create temp table receipt_counters (like public.receipt_counters including all) on commit drop'
        )

        // Twice: safe to re-run, so the second pass adds nothing and moves no
        // counter.
        for (let pass = 0; pass < 2; pass++) {
          for (const statement of backfill) await tx.unsafe(statement)
          runs.push({
            numbers: await tx.unsafe<Issued[]>(`
              select rn.root_booking_id, rn.financial_year, rn.seq, rn.number, rn.issued_at,
                     (extract(epoch from rn.issued_at) * 1000000)::bigint::text as issued_us,
                     b.original_booking_id is null as is_root
                from pg_temp.receipt_numbers rn
                join bookings b on b.id = rn.root_booking_id
               order by rn.financial_year, rn.seq`),
            counters: await tx.unsafe<Counter[]>(
              'select financial_year, last_seq from pg_temp.receipt_counters order by financial_year'
            ),
          })
        }
        throw rollback
      })
      .catch((error: unknown) => {
        if (error !== rollback) throw error
      })

    expect(runs).toHaveLength(2)
    const [{ numbers, counters }] = runs
    const byRoot = (id: string) => numbers.filter((row) => row.root_booking_id === id)

    // The moved booking's chain has one number, keyed by its first booking;
    // the booking it moved to (which holds the payment now) has none of its own.
    expect(byRoot(BOOKINGS.refundMovedFrom)).toHaveLength(1)
    expect(byRoot(BOOKINGS.refundMovedTo)).toHaveLength(0)
    // This file's own paid and refunded bookings are numbered; the unpaid one is not.
    expect(byRoot(BOOKINGS.receiptPaid)).toHaveLength(1)
    expect(byRoot(BOOKINGS.receiptRefunded)).toHaveLength(1)
    expect(byRoot(BOOKINGS.receiptUnpaid)).toHaveLength(0)

    for (const row of numbers) {
      // Only ever on a chain's first booking.
      expect(row.is_root, row.root_booking_id).toBe(true)
      // The same year and the same number the app would give it.
      expect(row.financial_year, row.number).toBe(financialYearOf(row.issued_at))
      expect(row.number).toBe(formatReceiptSerial(row.financial_year, row.seq))
    }

    // Each year counts 1, 2, 3… in the order the payments went through (the
    // booking id breaks a tie), and its counter is where the count ends.
    const years = [...new Set(numbers.map((row) => row.financial_year))]
    for (const year of years) {
      const rows = numbers.filter((row) => row.financial_year === year)
      expect(rows.map((row) => row.seq)).toEqual(rows.map((_, i) => i + 1))
      const order = [...rows].sort((a, b) => {
        const at = BigInt(a.issued_us) - BigInt(b.issued_us)
        if (at !== 0n) return at < 0n ? -1 : 1
        return a.root_booking_id < b.root_booking_id ? -1 : 1
      })
      expect(order.map((row) => row.seq)).toEqual(rows.map((row) => row.seq))
    }
    expect(counters).toEqual(
      years.sort().map((year) => ({
        financial_year: year,
        last_seq: numbers.filter((row) => row.financial_year === year).length,
      }))
    )

    expect(runs[1]).toEqual(runs[0])
  })

  test("migration 0030's financial year agrees with the app's at the edges", async () => {
    // The backfill's own expression, lifted from the file, at the moments
    // where a slip would show: the last second of 31 March and the first of
    // 1 April in IST, and a century turn.
    const migration = readFileSync(MIGRATION_0030, 'utf8')
    const expression = migration.match(
      /(to_char\(\(issued_at AT TIME ZONE 'Asia\/Kolkata'\)[\s\S]*?)\s+AS financial_year/
    )?.[1]
    expect(expression).toBeTruthy()

    const cases: Array<[string, string]> = [
      ['2027-03-31T18:29:59Z', '26-27'],
      ['2027-03-31T18:30:00Z', '27-28'],
      ['2026-12-31T23:59:59Z', '26-27'],
      ['2100-03-31T18:29:59Z', '99-00'],
      ['2100-03-31T18:30:00Z', '00-01'],
    ]
    for (const [at, year] of cases) {
      const [row] = await sql.unsafe<{ financial_year: string }[]>(
        `select ${expression} as financial_year from (select $1::timestamptz as issued_at) t`,
        [at]
      )
      expect(row.financial_year, at).toBe(year)
      expect(financialYearOf(new Date(at)), at).toBe(year)
    }
  })
})
