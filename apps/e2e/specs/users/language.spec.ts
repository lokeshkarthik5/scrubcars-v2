/**
 * English or தமிழ் (Tamil) on the customer website (owner, 10 Nov 2026).
 *
 * The choice is kept on this browser only (@repo/core/i18n, key
 * `detlio-lang`), so switching here touches no row and no other spec: every
 * context starts in English. Read-only throughout, so it shares the browse
 * customer with discovery and the garage list.
 *
 * What is asserted in Tamil is the dictionary's own words
 * (packages/core/src/i18n/ta/*.ts), on the screens a customer sees first:
 * Profile, Home, the garage list and a garage page.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-browse') })

/** Profile's Language row: "Language" in English, "மொழி (Language)" in Tamil. */
async function chooseLanguage(page: Page, option: 'English' | 'தமிழ் (Tamil)') {
  await page.getByRole('button', { name: /Language/ }).click()
  await page.getByRole('radio', { name: option, exact: true }).click()
  // The sheet closes on the choice.
  await expect(page.getByRole('radiogroup', { name: /Language/ })).toHaveCount(0)
}

const htmlLang = (page: Page) => page.evaluate(() => document.documentElement.lang)

test.describe('language @p0', () => {
  test('Tamil on Profile shows Tamil everywhere, survives a reload, and English comes back', async ({ page }) => {
    await page.goto('/profile')
    // The signed-in Profile, so the row is not swapped out under the sheet.
    await expect(page.getByRole('button', { name: 'Add vehicle', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
    expect(await htmlLang(page)).toBe('en')

    await chooseLanguage(page, 'தமிழ் (Tamil)')

    // At once, without a reload: the title, the row and <html lang>.
    await expect(page.getByRole('heading', { name: 'சுயவிவரம்', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /மொழி \(Language\)/ })).toContainText('தமிழ்')
    await expect.poll(() => htmlLang(page)).toBe('ta')

    // Home: the floating nav.
    await page.goto('/home')
    await expect(page.getByRole('link', { name: 'முகப்பு', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'புக்கிங்குகள்', exact: true })).toBeVisible()

    // The garage list.
    await page.goto('/garages')
    await expect(page.getByRole('heading', { name: 'அருகில் உள்ள கேரேஜ்கள்' })).toBeVisible()
    await expect(page.getByRole('radiogroup', { name: 'சர்வீஸ் முறை' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Nearby Garages' })).toHaveCount(0)

    // A garage page. The garage's and the service's names are data and stay
    // as the garage wrote them.
    await page.goto(`/garage/${VENDORS.main.id}`)
    await expect(page.getByRole('tab', { name: 'சர்வீஸ்கள்' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: `${SERVICES.wash.name}-ஐ புக்கிங்கில் சேர்க்கவும்` })
    ).toBeVisible()

    // Kept on this browser: a reload is still Tamil, after hydration.
    await page.reload()
    await expect(page.getByRole('tab', { name: 'சர்வீஸ்கள்' })).toBeVisible()
    await expect.poll(() => htmlLang(page)).toBe('ta')

    // And back to English, the same way.
    await page.goto('/profile')
    await expect(page.getByRole('button', { name: 'காரைச் சேர்க்கவும்', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'சுயவிவரம்', exact: true })).toBeVisible()
    await chooseLanguage(page, 'English')
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Language/ })).toContainText('English')
    await expect.poll(() => htmlLang(page)).toBe('en')

    await page.goto('/garages')
    await expect(page.getByRole('heading', { name: 'Nearby Garages' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Nearby Garages' })).toBeVisible()
  })
})
