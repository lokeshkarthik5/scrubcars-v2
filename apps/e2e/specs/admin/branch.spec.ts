/**
 * "Add a branch…" (0069): from CITIES.branch's edit page, a branch in a town
 * that is not a city yet, with two of its three services. The new garage is
 * Pending and not shown to customers, has exactly those services at those
 * prices, its hours, and a vendor_admin seat for the same owner (so the
 * garage app's switcher shows both). Any branch left by an earlier run is
 * removed first, by its name; no other spec touches this garage.
 *
 * What comes along (packages, add-ons) is unit-tested in
 * apps/server/src/lib/branches.test.ts.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { CITIES } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const C = CITIES

const removeBranch = async () => {
  await sql`delete from vendors where business_name = ${C.branchName}`
}

test.describe.serial('Add a branch @p0', () => {
  test.beforeAll(removeBranch)
  test.afterAll(removeBranch)

  test('a branch with 2 of 3 services: pending, those services at those prices, the same owner’s login', async ({
    page,
  }) => {
    await page.goto(`/vendors/${C.branch.id}/edit`)
    await page.getByRole('button', { name: 'Add a branch…' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add a branch' })
    await expect(sheet.getByText(C.branch.services[0].name)).toBeVisible()

    // A town that is not a city yet: the name follows it.
    await sheet.getByLabel('City').selectOption({ label: 'Another town…' })
    await sheet.getByLabel('Town').fill(C.branchTown)
    await expect(sheet.getByLabel('Branch name')).toHaveValue(C.branchName)
    // Customers drive in to this garage, so the branch needs its address.
    await sheet.getByLabel('Address', { exact: true }).fill('2, Market Street, Branchtown')
    await sheet.getByLabel('Pincode').fill('624002')
    // Every service starts ticked, with its price; the coating stays behind.
    await expect(sheet.getByText('₹7,000')).toBeVisible()
    await sheet.getByRole('checkbox', { name: C.branch.services[2].name }).uncheck()
    await sheet.getByRole('button', { name: 'Add branch' }).click()

    await expect(page.getByText('Branch added. Check its details, then switch on Show to customers.')).toBeVisible()
    const [branch] = await sql`
      select id, owner_id, status, is_verified, city, address, pincode
        from vendors where business_name = ${C.branchName}`
    expect(branch).toMatchObject({
      owner_id: C.branch.ownerId,
      status: 'pending',
      is_verified: false,
      city: C.branchTown,
      pincode: '624002',
    })
    await expect(page).toHaveURL(new RegExp(`/vendors/${branch.id}/edit`))

    const services = await sql`
      select name, price, is_active from services where vendor_id = ${branch.id} and deleted_at is null order by name`
    expect(services).toEqual([
      { name: C.branch.services[0].name, price: '450.00', is_active: true },
      { name: C.branch.services[1].name, price: '900.00', is_active: true },
    ])
    const [{ count: hours }] = await sql`select count(*)::int as count from vendor_working_hours where vendor_id = ${branch.id}`
    expect(hours).toBe(7)
    const seats = await sql`
      select user_id, role, status from user_member_mapping where vendor_id = ${branch.id}`
    expect(seats).toEqual([{ user_id: C.branch.ownerId, role: 'vendor_admin', status: 'active' }])
    const [audit] = await sql`
      select actor_name, summary from admin_audit_log
       where action = 'garage_branch_added' and summary->>'vendorId' = ${branch.id}`
    expect(audit).toMatchObject({ actor_name: 'E2E Admin', summary: { fromVendorId: C.branch.id } })
  })
})
