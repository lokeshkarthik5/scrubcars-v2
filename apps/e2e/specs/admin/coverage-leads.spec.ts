/**
 * Leads in Coverage (0064, mockup coverage-zones B, C, D4–D8): Add lead
 * (the pin and zone from a Maps link, the duplicate warning), a row's
 * status (Not interested with a reason and a try-again day), note, assign
 * and edit (and Remove lead), Paste a list with its preview, and Onboard,
 * which opens Add garage filled in and links the lead to the garage made.
 *
 * Works in Perambur on LEADS' rows and its own, which it removes after;
 * the seeded rows it changes are put back. The rules are unit-tested in
 * apps/server/src/modules/coverage/coverage-leads.routes.test.ts.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { LEADS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const ADDED = 'Leads Added Car Spa'
const ADDED_PHONE = '9000004442'
/** A full Maps link a few hundred metres from Perambur's centre: read without any request. */
const LINK = 'https://www.google.com/maps/place/Car+Spa/@13.1222,80.2335,17z'

const cleanUp = async () => {
  await sql`delete from leads where created_by_name <> 'E2E seed' and (name like 'Leads %' or phone in (${ADDED_PHONE}, ${LEADS.pasted.phone}))`
  await sql`update leads set status = 'to_target', not_interested_reason = null, not_interested_on = null,
    retry_after = null, assigned_login_id = null, assigned_name = null, last_note = 'Owner back on Monday',
    last_note_by = 'E2E seed', name = ${LEADS.toTarget.name} where id = ${LEADS.toTarget.id}`
  await sql`update leads set status = 'to_target', vendor_id = null, onboarded_at = null where id = ${LEADS.onboard.id}`
  const owner = await sql<
    { id: string }[]
  >`select id from users where phone = ${LEADS.onboardOwner.phone}`
  if (owner.length) {
    await sql`delete from leads where vendor_id in (select id from vendors where owner_id = ${owner[0].id})`
    await sql`delete from user_member_mapping where user_id = ${owner[0].id}`
    await sql`delete from vendor_working_hours where vendor_id in (select id from vendors where owner_id = ${owner[0].id})`
    await sql`delete from vendors where owner_id = ${owner[0].id}`
    await sql`delete from users where id = ${owner[0].id}`
  }
}

async function openPerambur(page: Page) {
  const zone = await sql<
    { id: string }[]
  >`select id from zones where slug = ${LEADS.zoneSlug}`
  await page.goto(`/coverage?zone=${zone[0].id}`)
  const drawer = page.getByRole('dialog', { name: LEADS.zoneName })
  await expect(drawer).toBeVisible()
  return {
    drawer,
    list: drawer.getByRole('list', { name: `Call list for ${LEADS.zoneName}` }),
    zoneId: zone[0].id,
  }
}

const row = (list: ReturnType<Page['getByRole']>, name: string) =>
  list.getByRole('listitem').filter({ hasText: name })

test.describe.serial('Coverage leads @p0', () => {
  test.beforeAll(cleanUp)
  test.afterAll(cleanUp)

  test('Add lead here: the pin and zone come from the Maps link; a lookalike warns before saving', async ({
    page,
  }) => {
    const { drawer, list, zoneId } = await openPerambur(page)
    await drawer.getByRole('button', { name: '+ Add lead here' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add lead' })
    await expect(dialog).toBeVisible()
    // Added in Perambur: with no pin yet, its zone is the one it was added in.
    await expect(dialog.getByLabel('Zone')).toHaveValue(zoneId)

    await dialog.getByLabel('Garage name').fill(ADDED)
    await dialog.getByLabel('Phone').fill('call me')
    await expect(
      dialog.getByText('Enter a phone number, like 98400 12345.')
    ).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Save lead' })
    ).toBeDisabled()
    // The same number as a lead Perambur already has.
    await dialog.getByLabel('Phone').fill(`+91 ${LEADS.toTarget.phone}`)
    await dialog.getByLabel('Google Maps link').fill(LINK)
    await expect(dialog.getByText('Pin found')).toBeVisible()
    await expect(dialog).toContainText(`${LEADS.zoneName} (from the pin)`)

    await dialog.getByRole('radio', { name: 'Not interested' }).click()
    await expect(
      dialog.getByRole('button', { name: 'Save lead' })
    ).toBeDisabled()
    await dialog.getByRole('radio', { name: 'To target' }).click()
    await dialog.getByLabel('Assign to').selectOption({ label: 'E2E Admin' })
    await dialog.getByLabel('Note (optional)').fill('Met at the expo')

    await dialog.getByRole('button', { name: 'Save lead' }).click()
    await expect(dialog.getByRole('alert')).toContainText(
      `${LEADS.toTarget.name} — lead, To target`
    )
    await expect(dialog.getByRole('alert')).toContainText('same phone')
    expect((await sql`select 1 from leads where name = ${ADDED}`).length).toBe(
      0
    )

    // A different number: any change clears the warning (the button is
    // Save lead again), and checked again it finds nothing, so it saves.
    await dialog.getByLabel('Phone').fill(ADDED_PHONE)
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Save lead' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(row(list, ADDED)).toBeVisible()
    await expect(row(list, ADDED)).toContainText('E2E Admin · Met at the expo')

    const [saved] = await sql<
      {
        phone: string
        pin_source: string
        zone_id: string
        source: string
        status: string
        assigned_name: string
        last_note_by: string
        created_by_name: string
      }[]
    >`select phone, pin_source, zone_id, source, status, assigned_name, last_note_by, created_by_name from leads where name = ${ADDED}`
    expect(saved).toEqual({
      phone: ADDED_PHONE,
      pin_source: 'maps_link',
      zone_id: zoneId,
      source: 'manual',
      status: 'to_target',
      assigned_name: 'E2E Admin',
      last_note_by: 'E2E Admin',
      created_by_name: 'E2E Admin',
    })
  })

  test('a row: Not interested with why and when, back to To target, assign, note', async ({
    page,
  }) => {
    const { list } = await openPerambur(page)
    const lead = row(list, LEADS.toTarget.name)

    await lead
      .getByLabel(`Status of ${LEADS.toTarget.name}`)
      .selectOption('not_interested')
    const nope = page.getByRole('dialog', {
      name: `Not interested: ${LEADS.toTarget.name}`,
    })
    await expect(nope.getByRole('button', { name: 'Save' })).toBeDisabled()
    await nope.getByLabel('Why not interested').fill('Too busy this month')
    await nope.getByLabel('Try again after (optional)').fill('2027-01-15')
    await nope.getByRole('button', { name: 'Save' }).click()
    await expect(nope).toHaveCount(0)
    await expect(lead).toContainText('“Too busy this month”')
    await expect(lead).toContainText('try again after 15 Jan')
    const [ni] = await sql<
      {
        status: string
        not_interested_reason: string
        retry_after: string
        not_interested_on: string | null
      }[]
    >`
      select status, not_interested_reason, retry_after::text, not_interested_on::text from leads where id = ${LEADS.toTarget.id}`
    expect(ni).toMatchObject({
      status: 'not_interested',
      not_interested_reason: 'Too busy this month',
      retry_after: '2027-01-15',
    })
    expect(ni.not_interested_on).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    await lead
      .getByLabel(`Status of ${LEADS.toTarget.name}`)
      .selectOption('to_target')
    await expect(lead).not.toContainText('Too busy this month')
    await expect
      .poll(
        async () =>
          (
            await sql<
              { status: string }[]
            >`select status from leads where id = ${LEADS.toTarget.id}`
          )[0].status
      )
      .toBe('to_target')

    await lead
      .getByLabel(`Assign ${LEADS.toTarget.name}`)
      .selectOption({ label: 'E2E Admin' })
    await expect(lead).toContainText('E2E Admin ·')
    await expect
      .poll(
        async () =>
          (
            await sql<
              { assigned_name: string | null }[]
            >`select assigned_name from leads where id = ${LEADS.toTarget.id}`
          )[0].assigned_name
      )
      .toBe('E2E Admin')

    await lead
      .getByRole('button', { name: `Note for ${LEADS.toTarget.name}` })
      .click()
    const note = page.getByRole('dialog', {
      name: `Note: ${LEADS.toTarget.name}`,
    })
    await expect(note.getByLabel('Note')).toHaveValue('Owner back on Monday')
    await note.getByLabel('Note').fill('Call back Thu, owner travelling')
    await note.getByRole('button', { name: 'Save note' }).click()
    await expect(note).toHaveCount(0)
    await expect(lead).toContainText('Call back Thu, owner travelling')

    await lead
      .getByRole('button', { name: `Note for ${LEADS.toTarget.name}` })
      .click()
    await page
      .getByRole('dialog', { name: `Note: ${LEADS.toTarget.name}` })
      .getByRole('button', { name: 'Clear note' })
      .click()
    await expect(lead).toContainText('E2E Admin · Not called yet')
    const [noted] = await sql<
      { last_note: string | null }[]
    >`select last_note from leads where id = ${LEADS.toTarget.id}`
    expect(noted.last_note).toBeNull()
  })

  test('Edit lead: rename, remove the pin, then Remove lead', async ({
    page,
  }) => {
    const { list } = await openPerambur(page)
    await row(list, ADDED)
      .getByRole('button', { name: `Edit ${ADDED}` })
      .click()
    const edit = page.getByRole('dialog', { name: `Edit ${ADDED}` })
    // Nothing changed yet: nothing to save.
    await expect(
      edit.getByRole('button', { name: 'Save changes' })
    ).toBeDisabled()
    await edit.getByLabel('Garage name').fill(`${ADDED} Studio`)
    await edit.getByRole('button', { name: 'Remove the pin' }).click()
    await expect(edit.getByLabel('Zone')).toBeVisible()
    await edit.getByRole('button', { name: 'Save changes' }).click()
    await expect(edit).toHaveCount(0)
    await expect(row(list, `${ADDED} Studio`)).toBeVisible()
    const [edited] = await sql<
      {
        lat: number | null
        pin_source: string | null
        zone_id: string | null
      }[]
    >`
      select lat, pin_source, zone_id from leads where name = ${`${ADDED} Studio`}`
    expect(edited.lat).toBeNull()
    expect(edited.pin_source).toBeNull()
    expect(edited.zone_id).not.toBeNull()

    await row(list, `${ADDED} Studio`)
      .getByRole('button', { name: `Edit ${ADDED} Studio` })
      .click()
    await page
      .getByRole('dialog', { name: `Edit ${ADDED} Studio` })
      .getByRole('button', { name: 'Remove lead' })
      .click()
    const confirm = page.getByRole('dialog', { name: `Remove ${ADDED} Studio` })
    await confirm.getByRole('button', { name: 'Keep it' }).click()
    await page
      .getByRole('dialog', { name: `Edit ${ADDED} Studio` })
      .getByRole('button', { name: 'Remove lead' })
      .click()
    await page
      .getByRole('dialog', { name: `Remove ${ADDED} Studio` })
      .getByRole('button', { name: 'Remove', exact: true })
      .click()
    await expect(row(list, `${ADDED} Studio`)).toHaveCount(0)
    expect(
      (await sql`select 1 from leads where name = ${`${ADDED} Studio`}`).length
    ).toBe(0)
  })

  test('Paste a list: a preview line by line, a lookalike unticked, then saved To target in the zone', async ({
    page,
  }) => {
    const { drawer, list, zoneId } = await openPerambur(page)
    await drawer.getByRole('button', { name: 'Paste a list' }).click()
    const paste = page.getByRole('dialog', { name: 'Paste a list' })
    await expect(paste.getByLabel('Zone')).toHaveValue(zoneId)
    await paste
      .getByLabel('Names and phones, one a line')
      .fill(
        [
          'Name, Phone',
          `${LEADS.pasted.name}, 90000 04441`,
          `Lookalike Wash, ${LEADS.toTarget.phone}`,
          '9840000000',
        ].join('\n')
      )
    await paste.getByRole('button', { name: 'Preview' }).click()

    const lines = paste.getByRole('list', { name: 'Pasted lines' })
    await expect(lines.getByRole('listitem')).toHaveCount(3)
    await expect(
      paste.getByRole('checkbox', { name: `Keep ${LEADS.pasted.name}` })
    ).toBeChecked()
    await expect(
      paste.getByRole('checkbox', { name: 'Keep Lookalike Wash' })
    ).not.toBeChecked()
    await expect(lines).toContainText(
      `Looks like ${LEADS.toTarget.name} — lead`
    )
    await expect(
      paste.getByRole('checkbox', { name: 'Keep line 4' })
    ).toBeDisabled()
    await expect(lines).toContainText('Line 4: No name on this line')

    // Back keeps the text; Preview again.
    await paste.getByRole('button', { name: 'Back' }).click()
    await expect(
      paste.getByLabel('Names and phones, one a line')
    ).toContainText(LEADS.pasted.name)
    await paste.getByRole('button', { name: 'Preview' }).click()
    await paste.getByRole('button', { name: 'Save 1 lead' }).click()
    await expect(paste).toHaveCount(0)
    await expect(row(list, LEADS.pasted.name)).toBeVisible()

    const [pasted] = await sql<
      { phone: string; source: string; status: string; zone_id: string }[]
    >`
      select phone, source, status, zone_id from leads where name = ${LEADS.pasted.name}`
    expect(pasted).toEqual({
      phone: LEADS.pasted.phone,
      source: 'paste',
      status: 'to_target',
      zone_id: zoneId,
    })
    expect(
      (await sql`select 1 from leads where name = 'Lookalike Wash'`).length
    ).toBe(0)
  })

  test('Onboard: Add garage filled in from the lead; Create links the lead, Onboarded', async ({
    page,
  }) => {
    const { list, zoneId } = await openPerambur(page)
    await row(list, LEADS.onboard.name)
      .getByRole('link', { name: `Onboard ${LEADS.onboard.name}` })
      .click()
    await expect(page).toHaveURL(
      new RegExp(`/vendors/new\\?by=hand&lead=${LEADS.onboard.id}$`)
    )
    await expect(
      page.getByText(`Fill in by hand · from the lead ${LEADS.onboard.name}`)
    ).toBeVisible()
    await expect(page.getByLabel('Business name')).toHaveValue(
      LEADS.onboard.name
    )
    await expect(page.getByLabel('Business phone')).toHaveValue(
      LEADS.onboard.phone
    )

    // Straight to the address works (the page reads the query in the browser).
    await page.reload()
    await expect(page.getByLabel('Business name')).toHaveValue(
      LEADS.onboard.name
    )

    await page.getByLabel('Owner name').fill(LEADS.onboardOwner.name)
    await page.getByLabel('Owner phone').fill(LEADS.onboardOwner.phone)
    await page.getByRole('tab', { name: 'Location' }).click()
    await expect(page.getByLabel('City')).toHaveValue('Chennai')
    await expect(page.getByLabel('Google Maps link (optional)')).toHaveValue(
      'https://www.google.com/maps/@13.1217,80.2305,17z'
    )
    await page
      .getByLabel('Address', { exact: true })
      .fill('4, Lead Street, Perambur')
    await page.getByLabel('Pincode').fill('600011')
    await page.getByRole('button', { name: 'Create garage' }).click()

    // Back to the lead's zone, where it is a garage now.
    await expect(page).toHaveURL(new RegExp(`/coverage\\?zone=${zoneId}$`))
    const [lead] = await sql<
      { status: string; vendor_id: string | null; onboarded_at: Date | null }[]
    >`
      select status, vendor_id, onboarded_at from leads where id = ${LEADS.onboard.id}`
    expect(lead.status).toBe('onboarded')
    expect(lead.onboarded_at).not.toBeNull()
    const [garage] = await sql<
      { id: string; business_name: string; lat: number; status: string }[]
    >`
      select id, business_name, lat, status from vendors where id = ${lead.vendor_id}`
    expect(garage).toMatchObject({
      business_name: LEADS.onboard.name,
      status: 'pending',
    })
    expect(garage.lat).toBeCloseTo(13.121 + 80 / 111_320, 4)

    const drawer = page.getByRole('dialog', { name: LEADS.zoneName })
    const garageRow = row(
      drawer.getByRole('list', { name: `Call list for ${LEADS.zoneName}` }),
      LEADS.onboard.name
    )
    await expect(garageRow).toContainText('Garage · not live yet · pending')
    await expect(
      garageRow.getByRole('link', { name: `Open ${LEADS.onboard.name}` })
    ).toHaveAttribute('href', `/vendors/${garage.id}/edit`)
    // The lead is that garage's row now, never a second one.
    await expect(garageRow).toHaveCount(1)

    // Onboard again from the old address: it says it is a garage already.
    await page.goto(`/vendors/new?by=hand&lead=${LEADS.onboard.id}`)
    // Filtered: page-wide, Next's route announcer is an alert too.
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: `${LEADS.onboard.name} is already a garage.` })
    ).toBeVisible()
    await page.getByRole('link', { name: 'Open it' }).click()
    await expect(page).toHaveURL(new RegExp(`/vendors/${garage.id}/edit`))
  })
})
