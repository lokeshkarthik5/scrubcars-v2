/**
 * Branches (0081, mockups 2-branches-1, -2 and -4): the "E2E Shine Spa"
 * group's four garages (BRANCH_GROUPS).
 *
 *   - The Branches card on Velachery's page: the group and its count, each
 *     branch with its area, state, rating and Open; T. Nagar added today and
 *     not live yet. Open goes to that branch.
 *   - Link an existing garage: the garage search finds E2E Lone Car Care,
 *     Link puts it in the group (audited), Remove from group takes it out.
 *   - Change all branches at once: Velachery's Foam wash goes to ₹549 and a
 *     new service is added; Save changes asks This branch only / All 4
 *     branches, the server's preview flags OMR (₹529, "was different") and
 *     says the new one is added at all 4; saving writes every branch, T.
 *     Nagar too, and one audit row.
 *   - Delete at all branches: Bike wash goes at Anna Nagar and Velachery,
 *     and the preview says OMR and T. Nagar don't have it.
 *
 * Serial, and everything is put back before and after: no other spec uses
 * these garages (specs/users/branches.spec.ts only reads their names).
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { BRANCH_GROUPS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const B = BRANCH_GROUPS
const GROUP = [B.anna.id, B.vel.id, B.omr.id, B.tnagar.id]

/** The seed's state: four garages in the group, the lone one in none, the services as seeded. */
const putBack = async () => {
  await sql`update vendors set group_id = ${B.group.id} where id in ${sql(GROUP)}`
  await sql`update vendors set group_id = null where id = ${B.lone.id}`
  await sql`delete from services where vendor_id in ${sql(GROUP)} and name = ${B.addedName}`
  await sql`update services set price = ${B.foam.price}, is_active = true, deleted_at = null
             where id in ${sql([B.foam.ids.anna, B.foam.ids.vel, B.foam.ids.tnagar])}`
  await sql`update services set price = ${B.foam.omrPrice} where id = ${B.foam.ids.omr}`
  await sql`update services set is_active = true, deleted_at = null where id in ${sql([B.bike.ids.anna, B.bike.ids.vel])}`
}

const priceOf = async (id: string) => (await sql`select price from services where id = ${id}`)[0]?.price

test.describe.serial('Branches @p0', () => {
  test.beforeAll(putBack)
  test.afterAll(putBack)

  test('the Branches card: the group, each branch’s state and rating, and Open', async ({ page }) => {
    await page.goto(`/vendors/${B.vel.id}/edit`)
    const card = page.getByRole('region', { name: 'Branches' })
    await expect(card.getByText(`Group: ${B.group.name} · 4 branches`)).toBeVisible()
    await expect(card.getByRole('button', { name: 'Link an existing garage' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Add a branch', exact: true })).toBeVisible()

    const rows = card.getByRole('list', { name: 'Branches in this group' }).getByRole('listitem')
    await expect(rows).toHaveCount(4)
    // The first made is the main branch; this page's is marked.
    await expect(rows.nth(0)).toContainText(B.anna.label)
    await expect(rows.nth(0)).toContainText('Main branch')
    await expect(rows.nth(0)).toContainText('Live')
    await expect(rows.nth(1)).toContainText(B.vel.label)
    await expect(rows.nth(1)).toContainText('you are here')
    await expect(rows.nth(2)).toContainText(B.omr.label)
    await expect(rows.nth(3)).toContainText(B.tnagar.label)
    await expect(rows.nth(3)).toContainText('Not live yet')
    await expect(rows.nth(3)).toContainText('Added today. Not shown to customers until it’s checked.')
    await expect(rows.nth(3)).toContainText('No reviews yet')
    await expect(
      card.getByText(
        'Each branch has its own bookings, slots, team, documents and reviews. Services and prices can be changed for all branches at once from any branch’s Services tab.'
      )
    ).toBeVisible()
    // The status panel no longer has its own Add a branch button.
    await expect(page.getByRole('button', { name: 'Add a branch…' })).toHaveCount(0)

    // Add a branch opens today's sheet, now saying which group it joins.
    await card.getByRole('button', { name: 'Add a branch', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Add a branch' })
    await expect(sheet.getByText(`Joins the ${B.group.name} group`, { exact: false })).toBeVisible()
    await sheet.getByRole('button', { name: 'Cancel' }).click()
    await expect(sheet).toHaveCount(0)

    await card.getByRole('link', { name: `Open ${B.tnagar.label}` }).click()
    await expect(page).toHaveURL(new RegExp(`/vendors/${B.tnagar.id}/edit`))
    // The same card on every branch's page.
    await expect(
      page.getByRole('region', { name: 'Branches' }).getByText(`Group: ${B.group.name} · 4 branches`)
    ).toBeVisible()
  })

  test('Link an existing garage, then Remove from group', async ({ page }) => {
    await page.goto(`/vendors/${B.vel.id}/edit`)
    const card = page.getByRole('region', { name: 'Branches' })
    await card.getByRole('button', { name: 'Link an existing garage' }).click()
    const sheet = page.getByRole('dialog', { name: 'Link an existing garage' })
    await sheet.getByLabel('Search garages').fill('E2E Lone')
    await sheet.getByRole('button', { name: `Link ${B.lone.name}` }).click()
    await expect(page.getByText(`${B.lone.name} is one of these branches now.`)).toBeVisible()
    await expect.poll(async () => (await sql`select group_id from vendors where id = ${B.lone.id}`)[0]?.group_id).toBe(
      B.group.id
    )
    const [linked] = await sql`
      select actor_name, summary from admin_audit_log
       where action = 'garage_branch_linked' and summary->>'vendorId' = ${B.lone.id}
       order by created_at desc limit 1`
    expect(linked).toMatchObject({ actor_name: 'E2E Admin', summary: { groupId: B.group.id, toVendorId: B.vel.id } })

    // In the sheet's list of this group now, with Remove from group.
    await sheet.getByRole('button', { name: `Remove ${B.lone.name} from group` }).click()
    await expect(page.getByText(`${B.lone.name} is no longer one of these branches.`)).toBeVisible()
    await expect.poll(async () => (await sql`select group_id from vendors where id = ${B.lone.id}`)[0]?.group_id).toBeNull()
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(card.getByText(`Group: ${B.group.name} · 4 branches`)).toBeVisible()
  })

  test('Save changes for all 4 branches: the preview, then every branch at once', async ({ page }) => {
    await page.goto(`/vendors/${B.vel.id}/edit?tab=services`)
    await expect(
      page.getByText(
        `This garage is one of 4 ${B.group.name} branches. When you save, you choose: this branch only, or all of them.`
      )
    ).toBeVisible()

    // Foam wash ₹499 → ₹549.
    await page.getByRole('group', { name: B.foam.name }).getByLabel(/price in rupees$/).fill('549')
    // And a new service, by car type, ₹249 for every size.
    await page.getByRole('button', { name: 'Add service' }).click()
    await page.getByRole('group', { name: 'What kind of service?' }).getByRole('button', { name: /^Car wash/ }).click()
    await page.keyboard.type(B.addedName)
    const added = page.getByRole('group', { name: B.addedName })
    await added.getByLabel(/hatchback price in rupees/).fill('249')
    await added.getByLabel(/sedan price in rupees/).fill('249')
    await added.getByLabel(/SUV price in rupees/).fill('249')

    await page.getByRole('button', { name: 'Save changes' }).click()
    const sheet = page.getByRole('dialog', { name: 'Save for' })
    await expect(sheet.getByRole('radio', { name: /^This branch only/ })).toBeChecked()
    await expect(sheet.getByText('Anna Nagar, Velachery, OMR and T. Nagar')).toBeVisible()
    await sheet.getByRole('radio', { name: /^All 4 branches/ }).check()

    // The server's preview: each branch's price, OMR's flagged, the new one at all 4.
    await expect(sheet.getByText('(was different)')).toHaveCount(1)
    await expect(sheet.getByRole('listitem').filter({ hasText: B.omr.label })).toContainText('₹529')
    await expect(sheet.getByRole('listitem').filter({ hasText: B.tnagar.label })).toContainText('₹549')
    await expect(sheet.getByText(`${B.addedName} (new)`)).toBeVisible()
    await expect(sheet.getByText('Added at all 4:', { exact: false })).toContainText('₹249')
    await expect(
      sheet.getByText('Only services and prices. Hours, photos, team and bank stay as each branch has them.')
    ).toBeVisible()

    await sheet.getByRole('button', { name: 'Save for all 4 branches' }).click()
    await expect(sheet).toHaveCount(0)
    for (const id of Object.values(B.foam.ids)) await expect.poll(() => priceOf(id)).toBe('549.00')
    const addedRows = await sql`
      select vendor_id, price_hatchback from services
       where name = ${B.addedName} and deleted_at is null order by vendor_id`
    expect(addedRows.map((row) => row.vendor_id).sort()).toEqual([...GROUP].sort())
    expect(addedRows.every((row) => row.price_hatchback === '249.00')).toBe(true)
    // Another business's garage is never touched.
    expect(await priceOf(B.loneWash.id)).toBe(B.loneWash.price)
    const [audit] = await sql`
      select actor_name, summary, detail from admin_audit_log
       where action = 'garage_services_saved_all_branches' and summary->>'vendorId' = ${B.vel.id}
       order by created_at desc limit 1`
    expect(audit).toMatchObject({
      actor_name: 'E2E Admin',
      summary: { groupId: B.group.id, branches: 4 },
      detail: { updated: 4, added: 4, deleted: 0 },
    })
  })

  test('Delete at all branches: where it is, and skipped where it isn’t', async ({ page }) => {
    await page.goto(`/vendors/${B.vel.id}/edit?tab=services`)
    await page.getByRole('button', { name: `More for ${B.bike.name}` }).click()
    await page.getByRole('button', { name: `Delete ${B.bike.name}` }).click()
    const sheet = page.getByRole('dialog', { name: `Delete ${B.bike.name}?` })
    await expect(sheet.getByText('Past bookings keep it.')).toBeVisible()
    await sheet.getByRole('radio', { name: /^All 4 branches/ }).check()
    await expect(sheet.getByRole('listitem').filter({ hasText: B.anna.label })).toContainText('Deleted')
    await expect(sheet.getByRole('listitem').filter({ hasText: B.omr.label })).toContainText('Doesn’t have it · skipped')
    await expect(sheet.getByRole('listitem').filter({ hasText: B.tnagar.label })).toContainText('Doesn’t have it · skipped')
    await sheet.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    await expect.poll(async () =>
      (await sql`select count(*)::int as n from services where id in ${sql([B.bike.ids.anna, B.bike.ids.vel])} and deleted_at is not null`)[0]?.n
    ).toBe(2)
    await expect(page.getByRole('group', { name: B.bike.name })).toHaveCount(0)
  })
})
