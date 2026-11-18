/**
 * Service templates (0082) in admin: Settings → Service templates (the list,
 * Add, Edit, the On switch and Delete, with the description rules on save),
 * a new template in a garage's "Add from template" marked New, and "Save as
 * template" from a garage's service, which never takes its price.
 *
 * The built-in templates are 0082's own seed and are only read here. Every
 * template this file makes is named "E2E …" (SERVICE_TEMPLATE_FIXTURES.prefix)
 * and is deleted before and after each test, so a retry starts clean and no
 * other spec's chips change for long. The garage is SERVICE_TEMPLATE_FIXTURES,
 * which no other file reads.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { SERVICE_TEMPLATE_FIXTURES as T } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const MONSOON = `${T.prefix}Monsoon underbody wash`
const GUARD = `${T.prefix}Engine mouse guard`
const GOOD_WORDS = 'Underside and wheel arches rinsed to clear mud and flood-water grime, then an anti-rust spray on the chassis.'

async function clearOwnTemplates() {
  await sql`delete from service_templates where name like ${`${T.prefix}%`}`
}

test.beforeEach(clearOwnTemplates)
test.afterAll(clearOwnTemplates)

async function storedTemplate(name: string) {
  const [row] = await sql<
    { id: string; is_on: boolean; duration_mins: number; created_by_admin: string; source_vendor_id: string | null; deleted: boolean }[]
  >`
    select id, is_on, duration_mins, created_by_admin, source_vendor_id, deleted_at is not null as deleted
      from service_templates where name = ${name} order by created_at desc limit 1
  `
  return row
}

async function auditActions(templateId: string) {
  const rows = await sql<{ action: string; actor_name: string }[]>`
    select action, actor_name from admin_audit_log
     where summary->>'templateId' = ${templateId} order by created_at, id
  `
  return rows.map((row) => `${row.action} by ${row.actor_name}`)
}

test.describe('Settings → Service templates', () => {
  test('the list, Add with the words checked, Edit, the On switch and Delete @p0', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('link', { name: /^Service templates/ }).click()
    await expect(page).toHaveURL(/\/settings\/service-templates$/)
    await expect(page.getByRole('heading', { name: 'Service templates', exact: true })).toBeVisible()

    // The built-ins, by category, each with its time and pricing and Built in.
    const carWash = page.getByRole('group', { name: /^Car wash/ })
    const foam = carWash.getByRole('listitem', { name: 'Foam wash', exact: true })
    await expect(foam).toContainText('Built in')
    await expect(foam).toContainText('45 min')
    await expect(foam).toContainText('By car type')
    await expect(foam.getByRole('switch', { name: 'Foam wash on' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('Off hides it from “Add from template” without deleting it.')).toBeVisible()

    // Add template: the sheet, empty, with no Delete.
    await page.getByRole('button', { name: 'Add template' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add template' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Delete' })).toHaveCount(0)
    await expect(sheet).toContainText('No prices or promises. Every garage sets its own price.')
    await expect(sheet).toContainText('Signed as E2E Admin')
    await sheet.getByLabel('Name', { exact: true }).fill(MONSOON)
    await sheet.getByLabel('Category').selectOption('others')
    await sheet.getByLabel('Usual time').selectOption('45')
    await sheet.getByRole('radio', { name: 'Same for all cars' }).click()

    // A price in the words is refused, with the reason, and nothing is saved.
    await sheet.getByLabel('Description').fill('Underside rinsed, from ₹299.')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(sheet.getByRole('alert')).toHaveText('The description can’t be saved: it mentioned a price or money.')
    expect(await storedTemplate(MONSOON)).toBeUndefined()

    await sheet.getByLabel('Description').fill(GOOD_WORDS)
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'added' })).toHaveText(`“${MONSOON}” added.`)

    const others = page.getByRole('group', { name: /^Others/ })
    const row = others.getByRole('listitem', { name: MONSOON })
    await expect(row).toContainText('New')
    await expect(row).toContainText('45 min')
    await expect(row).toContainText('Same for all cars')
    await expect(row).not.toContainText('Built in')
    const saved = await storedTemplate(MONSOON)
    expect(saved).toMatchObject({ is_on: true, duration_mins: 45, created_by_admin: 'E2E Admin', source_vendor_id: null })

    // Edit: who added it, then a new usual time.
    await row.getByRole('button', { name: `Edit ${MONSOON}` }).click()
    const edit = page.getByRole('dialog', { name: 'Edit template' })
    await expect(edit).toContainText('Changes reach services added from now on.')
    await expect(edit).toContainText('Added by E2E Admin, today.')
    await expect(edit.getByLabel('Name', { exact: true })).toHaveValue(MONSOON)
    await edit.getByLabel('Usual time').selectOption('60')
    await edit.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(row).toContainText('60 min')
    expect((await storedTemplate(MONSOON))!.duration_mins).toBe(60)

    // The switch: off at once, listed under Off.
    const on = row.getByRole('switch', { name: `${MONSOON} on` })
    await on.click()
    await expect(on).toHaveAttribute('aria-checked', 'false')
    await expect.poll(async () => (await storedTemplate(MONSOON))!.is_on).toBe(false)
    await page.getByRole('button', { name: /^Off \d+$/ }).click()
    await expect(page.getByRole('listitem', { name: MONSOON })).toBeVisible()
    await expect(page.getByRole('listitem', { name: 'Foam wash', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: /^All \d+$/ }).click()

    // Delete, after its confirm.
    await page.getByRole('listitem', { name: MONSOON }).getByRole('button', { name: `Edit ${MONSOON}` }).click()
    const again = page.getByRole('dialog', { name: 'Edit template' })
    await again.getByRole('button', { name: 'Delete' }).click()
    await expect(again).toContainText('Services garages already added from it stay as they are.')
    await again.getByRole('button', { name: 'Delete template' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('listitem', { name: MONSOON })).toHaveCount(0)

    expect(await auditActions(saved!.id)).toEqual([
      'service_template_added by E2E Admin',
      'service_template_edited by E2E Admin',
      'service_template_turned_off by E2E Admin',
      'service_template_deleted by E2E Admin',
    ])
  })
})

test.describe('the garage editor', () => {
  test('a template added this week shows in “Add from template” marked New; switched off, it goes @p0', async ({
    page,
  }) => {
    const created = await page.request.post(`${API}/api/v1/admin/service-templates`, {
      data: {
        name: GUARD,
        category: 'others',
        durationMins: 30,
        pricingType: 'flat',
        description: 'A mesh guard fitted over the engine bay openings to keep rodents out.',
      },
    })
    expect(created.status()).toBe(201)
    const guard = (await created.json()).data as { id: string; isNew: boolean }
    expect(guard.isNew).toBe(true)

    await page.goto(`/vendors/${T.garage.id}/edit`)
    await page.getByRole('tab', { name: 'Services' }).click()
    const others = page.getByRole('group', { name: 'Others templates' })
    const chip = others.getByRole('button', { name: `${GUARD} New` })
    await expect(chip).toBeVisible()
    // A built-in is never New.
    await expect(others.getByRole('button', { name: 'Bike wash', exact: true })).toBeVisible()

    // One tap: the row arrives with the template's words and asks for its price.
    await chip.click()
    const row = page.getByRole('group', { name: GUARD })
    await expect(row).toContainText('Add the price')
    await expect(others.getByRole('button', { name: `${GUARD} New` })).toHaveCount(0)
    await page.getByRole('button', { name: 'Discard' }).click()

    // Off: gone from every garage's chips.
    const off = await page.request.patch(`${API}/api/v1/admin/service-templates/${guard.id}/on`, { data: { on: false } })
    expect(off.status()).toBe(200)
    await page.reload()
    await page.getByRole('tab', { name: 'Services' }).click()
    await expect(page.getByRole('group', { name: 'Add from template' })).toBeVisible()
    await expect(page.getByRole('button', { name: `${GUARD} New` })).toHaveCount(0)
  })

  test('Save as template from a garage’s service: filled in from it, never its price @p0', async ({ page }) => {
    await page.goto(`/vendors/${T.garage.id}/edit`)
    await page.getByRole('tab', { name: 'Services' }).click()
    await page.getByRole('button', { name: `More for ${T.rat.name}` }).click()
    const row = page.getByRole('group', { name: T.rat.name })
    await expect(row.getByRole('button', { name: `Hide ${T.rat.name}` })).toBeVisible()
    await row.getByRole('button', { name: `Save ${T.rat.name} as template` }).click()

    const sheet = page.getByRole('dialog', { name: 'Save as template' })
    await expect(sheet).toContainText(
      `From ${T.garage.name}’s “${T.rat.name}”. Check the words, then every garage can add it in one tap.`
    )
    await expect(sheet.getByLabel('Name', { exact: true })).toHaveValue(T.rat.name)
    await expect(sheet.getByLabel('Category')).toHaveValue('others')
    await expect(sheet.getByLabel('Usual time')).toHaveValue(String(T.rat.durationMins))
    await expect(sheet.getByRole('radio', { name: 'Same for all cars' })).toHaveAttribute('aria-checked', 'true')
    await expect(sheet.getByLabel('Description')).toHaveValue(T.rat.description)
    await expect(sheet).toContainText(`Prices are not saved. Each garage sets its own. ${T.garage.name}’s service stays as it is.`)
    await expect(sheet.getByRole('button', { name: 'Delete' })).toHaveCount(0)
    await sheet.getByRole('button', { name: 'Save template' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'saved as a template' })).toHaveText(
      `“${T.rat.name}” saved as a template. Every garage can add it from “Add from template”.`
    )
    const saved = await storedTemplate(T.rat.name)
    expect(saved).toMatchObject({ is_on: true, duration_mins: T.rat.durationMins, source_vendor_id: T.garage.id })
    expect(await auditActions(saved!.id)).toEqual(['service_template_saved_from_service by E2E Admin'])
    // The garage's own service is untouched, price and all.
    const [service] = await sql<{ price: string; name: string }[]>`select price, name from services where id = ${T.rat.id}`
    expect(service).toEqual({ price: T.rat.price, name: T.rat.name })

    // In Settings, under Others, New, and where it came from.
    await page.goto('/settings/service-templates')
    const listed = page.getByRole('group', { name: /^Others/ }).getByRole('listitem', { name: T.rat.name })
    await expect(listed).toContainText('New')
    await listed.getByRole('button', { name: `Edit ${T.rat.name}` }).click()
    await expect(page.getByRole('dialog', { name: 'Edit template' })).toContainText(
      `Saved from ${T.garage.name}’s service by E2E Admin, today.`
    )
  })
})
