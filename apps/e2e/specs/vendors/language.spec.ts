/**
 * English or தமிழ் (Tamil) on the garage website (owner, 10 Nov 2026), from
 * Settings → Account.
 *
 * The choice is kept on this browser only (@repo/core/i18n, key
 * `detlio-lang`), so switching here writes no row and every other context
 * starts in English. Read-only, so it shares the owner's session; MAIN is
 * only looked at.
 *
 * What is asserted in Tamil is the dictionary's own words
 * (packages/core/src/i18n/ta/*.ts).
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { setActiveVendor } from '../../support/auth'
import { VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('vendor-owner') })

/** The Language row: "Language" in English, "மொழி (Language)" in Tamil. */
async function chooseLanguage(page: Page, option: 'English' | 'தமிழ் (Tamil)') {
  await page.getByRole('button', { name: /Language/ }).click()
  await page.getByRole('radio', { name: option, exact: true }).click()
  // The sheet closes on the choice.
  await expect(page.getByRole('radiogroup', { name: /Language/ })).toHaveCount(0)
}

const htmlLang = (page: Page) => page.evaluate(() => document.documentElement.lang)

test.describe('language @p0', () => {
  test('Tamil from Settings shows Tamil, survives a reload, and English comes back', async ({ page, context }) => {
    await setActiveVendor(context, VENDORS.main.id)
    await page.goto('/settings?tab=account')
    await expect(page.getByRole('tab', { name: 'Account', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    expect(await htmlLang(page)).toBe('en')

    await chooseLanguage(page, 'தமிழ் (Tamil)')

    // At once, without a reload: the title, the tabs, the row and <html lang>.
    await expect(page.getByRole('heading', { name: 'அமைப்புகள்', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'கணக்கு', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(page.getByRole('tab', { name: 'சுயவிவரம்', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'நேரம்', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /மொழி \(Language\)/ })).toContainText('தமிழ்')
    await expect.poll(() => htmlLang(page)).toBe('ta')

    // Kept on this browser: a reload is still Tamil, after hydration.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'அமைப்புகள்', exact: true })).toBeVisible()
    await expect.poll(() => htmlLang(page)).toBe('ta')

    // Another screen: Your account.
    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'உங்கள் கணக்கு', exact: true })).toBeVisible()

    // And back to English, from Settings again.
    await page.goto('/settings?tab=account')
    await expect(page.getByRole('tab', { name: 'கணக்கு', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await chooseLanguage(page, 'English')
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Account', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Language/ })).toContainText('English')
    await expect.poll(() => htmlLang(page)).toBe('en')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  })
})
