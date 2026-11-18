/**
 * "Add a branch…" (0069): from CITIES.branch's edit page, two branches in
 * towns that are not cities yet, each with two of its three services.
 *
 * The owner's phone follows the owner's decisions (10 Nov 2026). Kept as the
 * garage owner's own number, it is the same login: a vendor_admin seat for
 * that owner, whose garage app then lists both garages, and the signed
 * pickup & drop agreement comes along. A different number is that person's
 * own login, set up here with the name the sheet asks for: their seat, the
 * branch on their number, and pickup & drop off (its radius kept) until that
 * garage signs its own agreement.
 *
 * The first branch puts the garage and itself in a new group named after the
 * garage (0081); the second joins it. Each branch is Pending and not shown to customers, has exactly the ticked
 * services at those prices and the hours. Any branch (and the other owner's
 * account) left by an earlier run is removed first, by name and number; no
 * other spec touches this garage.
 *
 * What comes along (packages, add-ons) and the owner rules are unit-tested
 * in apps/server/src/lib/branches.test.ts.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { CITIES } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const C = CITIES

const removeBranches = async () => {
  await sql`delete from vendors where business_name in (${C.branchName}, ${C.otherBranchName})`
  await sql`delete from users where phone = ${C.branchOtherOwner.phone}`
  // The group the first branch made (0081); its garages leave it with it.
  await sql`delete from garage_groups where name = ${C.branch.name}`
}

/** The garages a login's garage app lists (its switcher). */
const garagesOf = async (phone: string) => {
  const owner = await loginViaApi(phone, 'vendor')
  try {
    const res = await owner.get(`${API}/api/v1/auth/me/vendors`)
    expect(res.status()).toBe(200)
    return ((await res.json()).data as Array<{ id: string }>).map((garage) => garage.id).sort()
  } finally {
    await owner.dispose()
  }
}

test.describe.serial('Add a branch @p0', () => {
  test.beforeAll(removeBranches)
  test.afterAll(removeBranches)

  test('the owner’s own number: pending, those services at those prices, the same login with both garages', async ({
    page,
  }) => {
    await page.goto(`/vendors/${C.branch.id}/edit`)
    // On the Branches card (0081): a garage in no group has none yet.
    const card = page.getByRole('region', { name: 'Branches' })
    await expect(card.getByText('No other branches yet.', { exact: false })).toBeVisible()
    await card.getByRole('button', { name: 'Add a branch', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Add a branch' })
    await expect(sheet.getByText(C.branch.services[0].name)).toBeVisible()
    // The one new line: the group it joins, named after the garage (no area in its name).
    await expect(
      sheet.getByText(
        `Joins the ${C.branch.name} group: customers see the other branches, and you can change services and prices for all branches at once.`
      )
    ).toBeVisible()

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
    // The owner's number is already there: the same login, so no name asked.
    await expect(sheet.getByLabel('Owner’s phone number')).toHaveValue(C.branch.ownerPhone)
    await expect(
      sheet.getByText('Same number: same login, both garages show in the garage app. A different number gets its own login.')
    ).toBeVisible()
    await expect(sheet.getByLabel('Owner’s name')).toHaveCount(0)
    await sheet.getByRole('button', { name: 'Add branch' }).click()

    await expect(page.getByText('Branch added. Check its details, then switch on Show to customers.')).toBeVisible()
    const [branch] = await sql`
      select id, owner_id, phone, status, is_verified, city, address, pincode,
             pickup, pickup_radius_km, pickup_terms_accepted_at
        from vendors where business_name = ${C.branchName}`
    expect(branch).toMatchObject({
      owner_id: C.branch.ownerId,
      phone: C.branch.ownerPhone,
      status: 'pending',
      is_verified: false,
      city: C.branchTown,
      pincode: '624002',
      // The same login keeps the signed agreement.
      pickup: 'yes',
      pickup_radius_km: C.branch.pickupRadiusKm,
    })
    expect(branch.pickup_terms_accepted_at).not.toBeNull()
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
      select actor_name, summary, detail from admin_audit_log
       where action = 'garage_branch_added' and summary->>'vendorId' = ${branch.id}`
    expect(audit).toMatchObject({
      actor_name: 'E2E Admin',
      summary: { fromVendorId: C.branch.id },
      detail: { login: 'same', accountCreated: false, groupCreated: true },
    })
    // The source and the branch are one group now (0081), named after the source.
    const grouped = await sql`
      select v.id, g.name from vendors v join garage_groups g on g.id = v.group_id
       where v.id in (${C.branch.id}, ${branch.id}) order by v.created_at`
    expect(grouped).toEqual([
      { id: C.branch.id, name: C.branch.name },
      { id: branch.id, name: C.branch.name },
    ])
    // The branch's own page opens on its Branches card: both garages, the source the main one.
    const branches = page.getByRole('region', { name: 'Branches' })
    await expect(branches.getByText(`Group: ${C.branch.name} · 2 branches`)).toBeVisible()
    await expect(branches.getByRole('link', { name: `Open ${C.branch.name}` })).toBeVisible()
    await expect(branches.getByText('Main branch')).toBeVisible()

    // One login, both garages in the garage app's switcher.
    expect(await garagesOf(C.branch.ownerPhone)).toEqual([C.branch.id, branch.id].sort())
  })

  test('a different number: its own new login with the name asked, and pickup & drop off until it signs', async ({
    page,
  }) => {
    await page.goto(`/vendors/${C.branch.id}/edit`)
    await page.getByRole('region', { name: 'Branches' }).getByRole('button', { name: 'Add a branch', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Add a branch' })
    await expect(sheet.getByText(C.branch.services[0].name)).toBeVisible()

    await sheet.getByLabel('City').selectOption({ label: 'Another town…' })
    await sheet.getByLabel('Town').fill(C.otherBranchTown)
    await expect(sheet.getByLabel('Branch name')).toHaveValue(C.otherBranchName)
    await sheet.getByLabel('Address', { exact: true }).fill('5, Bazaar Road, Othertown')
    await sheet.getByLabel('Pincode').fill('624003')
    await sheet.getByRole('checkbox', { name: C.branch.services[2].name }).uncheck()

    // Another number: its own login, so the sheet asks the owner's name and
    // says pickup & drop waits for this garage's own agreement.
    await sheet.getByLabel('Owner’s phone number').fill(C.branchOtherOwner.phone)
    await expect(sheet.getByText('Pickup & drop stays off until this garage signs its own agreement.')).toBeVisible()
    await sheet.getByRole('button', { name: 'Add branch' }).click()
    await expect(sheet.getByRole('alert')).toHaveText('Enter the owner’s name: a different number gets its own login.')
    await sheet.getByLabel('Owner’s name').fill(C.branchOtherOwner.name)
    await sheet.getByRole('button', { name: 'Add branch' }).click()

    await expect(page.getByText('Branch added. Check its details, then switch on Show to customers.')).toBeVisible()
    const [owner] = await sql`
      select id, name, is_vendor_owner from users where phone = ${C.branchOtherOwner.phone}`
    expect(owner).toMatchObject({ name: C.branchOtherOwner.name, is_vendor_owner: true })
    const [branch] = await sql`
      select id, owner_id, phone, whatsapp, status, is_verified,
             pickup, pickup_radius_km, pickup_terms_accepted_at, pickup_terms_accepted_by
        from vendors where business_name = ${C.otherBranchName}`
    expect(branch).toMatchObject({
      owner_id: owner.id,
      // Reached on its own owner's number.
      phone: C.branchOtherOwner.phone,
      whatsapp: null,
      status: 'pending',
      is_verified: false,
      // Off, nothing signed, the reach kept for when it signs.
      pickup: 'no',
      pickup_radius_km: C.branch.pickupRadiusKm,
      pickup_terms_accepted_at: null,
      pickup_terms_accepted_by: null,
    })
    await expect(page).toHaveURL(new RegExp(`/vendors/${branch.id}/edit`))

    const services = await sql`
      select name from services where vendor_id = ${branch.id} and deleted_at is null order by name`
    expect(services.map((row) => row.name)).toEqual([C.branch.services[0].name, C.branch.services[1].name])
    const seats = await sql`
      select user_id, role, status from user_member_mapping where vendor_id = ${branch.id}`
    expect(seats).toEqual([{ user_id: owner.id, role: 'vendor_admin', status: 'active' }])
    const [audit] = await sql`
      select detail from admin_audit_log
       where action = 'garage_branch_added' and summary->>'vendorId' = ${branch.id}`
    // It joins the group the first branch started.
    expect(audit.detail).toMatchObject({ login: 'new', accountCreated: true, groupCreated: false })
    // The number never goes in the audit row.
    expect(JSON.stringify(audit.detail)).not.toContain(C.branchOtherOwner.phone)

    // Its own login sees the branch alone; the source owner's does not gain it.
    expect(await garagesOf(C.branchOtherOwner.phone)).toEqual([branch.id])
    expect(await garagesOf(C.branch.ownerPhone)).not.toContain(branch.id)
  })
})
