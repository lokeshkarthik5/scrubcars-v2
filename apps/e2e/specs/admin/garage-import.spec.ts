/**
 * Add garage from a poster, photo, PDF or Tally file: the import's review
 * screen, and Create from it.
 *
 * A photo is read by the API's fake (AI_FAKE=1 in .env.e2e), which answers
 * every file with the same poster (FAKE_GARAGE_READING in
 * apps/server/src/lib/garage-import/vision.ts): nothing leaves the machine.
 * A Tally file needs no AI at all. Neither touches a seeded garage; the one
 * garage this file creates is found by its owner's phone, which no seed uses,
 * and removed before and after.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'

test.use({ storageState: asRole('admin') })

const PIXEL = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/pixel.png'
)

// The fake poster's only number, which the review copies into the owner
// phone. No seed or other spec uses it.
const POSTER_PHONE = '9000009101'

/** The garage an earlier attempt created, and its owner, gone. Cascades. */
async function removeImported() {
  await sql`delete from users where phone = ${POSTER_PHONE}`
}

/** Opens a file input through its button, as a person would. */
async function pickFiles(
  page: Page,
  button: string,
  files: Parameters<Page['setInputFiles']>[1]
) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: button }).click()
  await (await chooser).setFiles(files)
}

test.describe('admin garage import', () => {
  test.beforeEach(removeImported)
  test.afterAll(removeImported)

  test('a poster fills in the form, what to check is marked, and Create saves it as Pending @p0', async ({
    page,
  }) => {
    const name = `E2E Import ${Date.now().toString().slice(-5)}`

    await page.goto('/vendors/new')
    await expect(
      page.getByRole('heading', { name: 'Import from a form or poster' })
    ).toBeVisible()
    await expect(
      page.getByText('Read by an AI service; the file isn’t stored')
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: /Fill in by hand/ })
    ).toHaveAttribute('href', '/vendors/new?by=hand')

    await pickFiles(page, 'Upload photo or PDF', PIXEL)

    await expect(
      page.getByRole('heading', { name: 'Check the details' })
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Add garage · from a photo')).toBeVisible()

    // The counts: the owner phone, Full wash's price and Interior cleaning's
    // category to check; the owner's name, the pincode and the inspection
    // fee to fill in.
    const summary = page.getByRole('region', { name: 'What was read' })
    await expect(summary.getByRole('definition')).toHaveText([/\d+/, '3', '3'])

    // What the poster said, in its fields.
    await expect(page.getByLabel('Business name')).toHaveValue(
      'SKT Car Wash and Polish'
    )
    await expect(page.getByLabel('Business phone')).toHaveValue(POSTER_PHONE)
    await expect(page.getByLabel('City')).toHaveValue('Chennai')

    // The owner signs in with this number: always to check, never trusted.
    const ownerPhone = page.getByLabel('Owner phone')
    await expect(ownerPhone).toHaveValue(POSTER_PHONE)
    await expect(ownerPhone).toHaveAccessibleDescription(
      /^Check this · Copied from the garage's number\. The owner signs in to Detlio with it\./
    )
    await expect(
      page.getByText('No Detlio account has this number yet.')
    ).toBeVisible()

    // Not on the poster: left empty, and said.
    const ownerName = page.getByLabel('Owner name')
    await expect(ownerName).toHaveValue('')
    await expect(ownerName).toHaveAccessibleDescription(/^Not found — fill in/)
    await expect(page.getByLabel('Pincode')).toHaveAccessibleDescription(
      /^Not found — fill in/
    )

    // "Call" is On inspection with the fee left to the garage, never guessed.
    const interior = page.getByRole('group', { name: 'Interior cleaning' })
    await expect(interior).toContainText(
      'Not found — fill in · Says “Call”, so we set On inspection. Ask the garage for its fee.'
    )
    await expect(page.getByRole('group', { name: 'Full wash' })).toContainText(
      'Check this · The poster shows ₹999 crossed out. We used the offer price.'
    )
    await expect(
      page.getByText(
        'No times given for these services, so each takes one booking slot.'
      )
    ).toBeVisible()

    // Always Pending: there is no stage to choose.
    await expect(
      page.getByText('Saved as Pending — nothing goes live until you verify')
    ).toBeVisible()
    await expect(
      page.getByRole('checkbox', { name: 'Mark as verified' })
    ).toHaveCount(0)

    const create = page.getByRole('button', { name: 'Create garage' })
    await expect(create).toBeDisabled()
    await expect(
      page.getByText('Fill in the 3 missing fields to create')
    ).toBeVisible()

    await page.getByLabel('Business name').fill(name)
    await ownerName.fill('Import Owner')
    await expect(ownerName).not.toHaveAccessibleDescription(/Not found/)
    await page.getByLabel('Pincode').fill('600017')
    await expect(
      page.getByText('Fill in the 1 missing field to create')
    ).toBeVisible()
    await interior.getByLabel('Service 3 price in rupees').fill('150')

    await expect(create).toBeEnabled()
    await create.click()

    // Back to the list, on Not live yet, where the new garage is.
    await expect(page).toHaveURL(/\/vendors\?show=notlive/)
    const card = page.getByRole('row', { name, exact: true })
    await expect(card).toContainText('Pending')
    await expect(
      card.getByRole('button', { name: `Verify ${name}` })
    ).toHaveCount(0)

    const [garage] = await sql<
      {
        id: string
        status: string
        is_verified: boolean
        owner_name: string
        owner_phone: string
      }[]
    >`
      select v.id, v.status, v.is_verified, u.name as owner_name, u.phone as owner_phone
        from vendors v join users u on u.id = v.owner_id
       where v.business_name = ${name}
    `
    expect(garage).toMatchObject({
      status: 'pending',
      is_verified: false,
      owner_name: 'Import Owner',
      owner_phone: POSTER_PHONE,
    })

    const services = await sql<
      { name: string; pricing_type: string; price: string }[]
    >`
      select name, pricing_type, price from services where vendor_id = ${garage.id} order by name
    `
    expect(
      services.map((s) => [s.name, s.pricing_type, Number(s.price)])
    ).toEqual([
      ['Foam wash', 'flat', 399],
      ['Full wash', 'flat', 799],
      ['Interior cleaning', 'on_inspection', 150],
    ])

    // The poster's week: Monday to Saturday 9 to 8, Sunday closed.
    const hours = await sql<
      {
        day_of_week: number
        is_closed: boolean
        open_time: string
        close_time: string
      }[]
    >`
      select day_of_week, is_closed, open_time, close_time from vendor_working_hours
       where vendor_id = ${garage.id} order by day_of_week
    `
    expect(hours.map((h) => [h.day_of_week, h.is_closed])).toEqual([
      [0, true],
      [1, false],
      [2, false],
      [3, false],
      [4, false],
      [5, false],
      [6, false],
    ])
    expect(hours[1].open_time.slice(0, 5)).toBe('09:00')
    expect(hours[1].close_time.slice(0, 5)).toBe('20:00')
  })

  test('a Tally file with two garages: pick one, and its answers fill in the form @p0', async ({
    page,
  }) => {
    const csv = [
      'Submission ID,Respondent ID,Submitted at,Name of your garage,Your name,Owner mobile number,Garage phone number,Address,City,Pincode,Timings,Services and prices',
      'abc1,r1,2026-10-01 10:00:00,Sparkle Auto Spa,Kumar S,+91 90000 09201,044 2345 6789,"5, Lake Road",Chennai,600040,Mon-Sat 9am - 7pm,"Foam wash - 349\nInterior cleaning – Call"',
      'abc2,r2,2026-10-02 11:30:00,Shine Car Care,Lakshmi R,90000-09202,9000009203,"22, Temple Street",Chennai,600028,9am - 8pm,"Full wash: Hatch 499 / Sedan 549 / SUV 649 (1 hr)"',
    ].join('\n')

    await page.goto('/vendors/new')
    await pickFiles(page, 'Upload Tally responses (CSV)', {
      name: 'responses.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    })

    await expect(
      page.getByRole('heading', { name: 'Pick a garage' })
    ).toBeVisible()
    await expect(page.getByText('2 garages in responses.csv.')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Sparkle Auto Spa/ })
    ).toContainText('Kumar S · sent 2026-10-01')
    await page.getByRole('button', { name: /Shine Car Care/ }).click()

    await expect(
      page.getByRole('heading', { name: 'Check the details' })
    ).toBeVisible()
    await expect(page.getByText('Add garage · from Tally')).toBeVisible()
    await expect(
      page.getByText('Tally responses · garage 2 of 2')
    ).toBeVisible()

    await expect(page.getByLabel('Business name')).toHaveValue('Shine Car Care')
    await expect(page.getByLabel('Owner name')).toHaveValue('Lakshmi R')
    // Normalised to 10 digits, and still to check.
    await expect(page.getByLabel('Owner phone')).toHaveValue('9000009202')
    await expect(page.getByLabel('Owner phone')).toHaveAccessibleDescription(
      /^Check this/
    )
    await expect(page.getByLabel('Business phone')).toHaveValue('9000009203')
    await expect(page.getByLabel('Address')).toHaveValue('22, Temple Street')
    await expect(page.getByLabel('Pincode')).toHaveValue('600028')

    // Car sizes priced by car type, and the time read.
    const wash = page.getByRole('group', { name: 'Full wash' })
    await expect(
      wash.getByLabel('Service 1 hatchback price in rupees')
    ).toHaveValue('499')
    await expect(
      wash.getByLabel('Service 1 sedan price in rupees')
    ).toHaveValue('549')
    await expect(wash.getByLabel('Service 1 SUV price in rupees')).toHaveValue(
      '649'
    )

    // Everything Create needs is there; nothing has been saved.
    await expect(
      page.getByRole('button', { name: 'Create garage' })
    ).toBeEnabled()
    const saved = await sql<{ n: string }[]>`
      select count(*)::text as n from vendors where business_name in ('Shine Car Care', 'Sparkle Auto Spa')
    `
    expect(Number(saved[0].n)).toBe(0)

    // Back returns to the list it came from, for the other garage.
    await page.getByRole('button', { name: 'Go back' }).click()
    await expect(
      page.getByRole('heading', { name: 'Pick a garage' })
    ).toBeVisible()
  })
})
