/**
 * The garage portal's switcher (0069): an owner of two garages (the seeded
 * vendor-owner, MAIN and SECOND) sees which garage is active in the strip
 * above the wordmark (VendorShellHeader, once per screen) and switches to the
 * other, as the garage app's switcher does (same names, order and words). The
 * switch is this browser's own (localStorage), so it touches no other spec.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { setActiveVendor } from '../../support/auth'
import { VENDORS } from '../../support/seed-ids'

test.describe('garage switcher @p0', () => {
  test.use({ storageState: asRole('vendor-owner') })

  test('a two-garage owner sees the active garage and switches to the other', async ({ page, context }) => {
    await setActiveVendor(context, VENDORS.main.id)
    await page.goto('/home')
    const button = page.getByRole('button', { name: `Garage: ${VENDORS.main.name}. Switch garage` })
    await expect(button).toBeVisible()
    await button.click()
    const list = page.getByRole('listbox', { name: 'Your garages' })
    await expect(list.getByRole('option')).toHaveCount(2)
    await expect(list.getByRole('option', { name: new RegExp(VENDORS.main.name) })).toHaveAttribute('aria-selected', 'true')
    await list.getByRole('option', { name: new RegExp(VENDORS.second.name) }).click()
    await expect(page.getByRole('button', { name: `Garage: ${VENDORS.second.name}. Switch garage` })).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('detlio.activeVendorId'))).toBe(VENDORS.second.id)
  })
})
