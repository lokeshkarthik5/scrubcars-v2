/**
 * Seat management.
 *
 * Roles here are what the tenancy spec's gating is built on, so this file
 * proves the other end: that a seat can actually be granted and taken away,
 * and that the row written carries the tenant it was granted for.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { setActiveVendor } from '../../support/auth'
import { sql } from '../../support/db'
import { STAFF, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('vendor-owner') })

test.beforeEach(async ({ context }) => {
  await setActiveVendor(context, VENDORS.main.id)
})

test.describe('vendor members', () => {
  test('the existing team is listed with its roles', async ({ page }) => {
    await page.goto('/settings/members')

    await expect(page.getByText(STAFF.owner.name).first()).toBeVisible()
    await expect(page.getByText(STAFF.operator.name).first()).toBeVisible()
  })

  test('a member can be added and removed', async ({ page }) => {
    const phone = '9000009090'
    await sql`
      delete from user_member_mapping
       where vendor_id = ${VENDORS.main.id}
         and user_id in (select id from users where phone = ${phone})
    `

    await page.goto('/settings/members')
    await page.getByLabel('Phone').fill(phone)
    await page.getByLabel('Name (optional)').fill('Temp Teammate')
    await page.getByRole('button', { name: /^Add member/ }).click()

    await expect(page.getByText('Temp Teammate').first()).toBeVisible()

    // The row must be scoped to the garage it was granted for — a seat that
    // leaked to platform scope would be a super_admin.
    const rows = await sql<{ role: string; vendor_id: string }[]>`
      select m.role, m.vendor_id from user_member_mapping m
        join users u on u.id = m.user_id
       where u.phone = ${phone}
    `
    expect(rows).toHaveLength(1)
    expect(rows[0].vendor_id).toBe(VENDORS.main.id)
    expect(rows[0].role).toBe('vendor_operator')

    await page.getByRole('button', { name: /Remove/ }).last().click()

    await expect
      .poll(async () => {
        const after = await sql<{ n: string }[]>`
          select count(*)::text as n from user_member_mapping m
            join users u on u.id = m.user_id
           where u.phone = ${phone} and m.vendor_id = ${VENDORS.main.id}
        `
        return Number(after[0].n)
      })
      .toBe(0)

    await sql`delete from users where phone = ${phone}`
  })
})
